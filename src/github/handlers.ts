// ---------------------------------------------------------------------------
// GitHub App — event handlers
//
// Orchestrates the full flow for each webhook event type:
//   pull_request → detect manifests → audit → Check Run + commit status
//   push         → re-score baseline (default branch only)
//   installation → log + analytics
// ---------------------------------------------------------------------------

import type { Env } from '../scoring/types';
import type {
  PullRequestEvent,
  PushEvent,
  InstallationEvent,
  GitHubAppConfig,
  GitHubAppAnalytics,
  DEFAULT_CONFIG,
} from './types';
import { getInstallationToken } from './auth';
import {
  listPullRequestFiles,
  getFileContent,
  createCheckRun,
  updateCheckRun,
  createCommitStatus,
  findPRComment,
  createPRComment,
  updatePRComment,
} from './api';
import { detectManifests } from './detector';
import { buildCheckRunOutput, getConclusion, buildPRCommentBody, COMMENT_MARKER } from './report';
import { parseManifest } from '../audit/parsers';
import { resolveAll } from '../audit/resolver';
import { scoreAudit, hashManifest } from '../audit/scorer';
import type { QueueMessage } from '../queue/types';

const CHECK_NAME = 'IsItAlive Dependency Audit';

// ---------------------------------------------------------------------------
// Pull Request: opened / synchronize / reopened
// ---------------------------------------------------------------------------

export async function handlePullRequest(
  event: PullRequestEvent,
  env: Env,
  ctx: ExecutionContext,
  config: GitHubAppConfig,
): Promise<void> {
  const { repository, pull_request: pr, installation } = event;
  const [owner, repo] = repository.full_name.split('/');
  const headSha = pr.head.sha;

  const token = await getInstallationToken(env, installation.id);

  // Create an in-progress check run immediately
  const checkRun = await createCheckRun(token, {
    owner,
    repo,
    name: CHECK_NAME,
    headSha,
    status: 'in_progress',
    detailsUrl: `https://isitalive.dev/${owner}/${repo}`,
  });

  // Post pending commit status
  await createCommitStatus(token, owner, repo, headSha, {
    state: 'pending',
    description: 'Auditing dependency health...',
    context: 'isitalive',
    targetUrl: `https://isitalive.dev/${owner}/${repo}`,
  });

  const startTime = Date.now();

  try {
    // List changed files in the PR
    const files = await listPullRequestFiles(token, owner, repo, pr.number);

    // Detect manifest files
    const manifests = detectManifests(files);

    // If no manifests were changed in the PR, fall back to auditing
    // the repo's existing manifest files from the PR head SHA.
    // This ensures every PR gets a dependency health check.
    let manifest = manifests[0] ?? null;
    let isBaseline = false;

    if (!manifest) {
      const fallbackPaths = ['package.json', 'go.mod'] as const;
      for (const path of fallbackPaths) {
        try {
          const content = await getFileContent(token, owner, repo, path, headSha);
          if (content) {
            manifest = { path, format: path };
            isBaseline = true;
            break;
          }
        } catch {
          // File doesn't exist — try next
        }
      }
    }

    if (!manifest) {
      // No manifest files exist in the repo at all
      await updateCheckRun(token, owner, repo, checkRun.id, {
        status: 'completed',
        conclusion: 'neutral',
        output: {
          title: 'No manifest files found',
          summary: 'No `package.json` or `go.mod` files found in this repository.',
        },
      });
      await createCommitStatus(token, owner, repo, headSha, {
        state: 'success',
        description: 'No manifest files found',
        context: 'isitalive',
      });
      return;
    }


    // Fetch manifest content from the PR head
    const content = await getFileContent(token, owner, repo, manifest.path, headSha);

    // Parse → resolve → score (direct function calls, no HTTP)
    const deps = parseManifest(manifest.format, content);

    if (deps.length === 0) {
      await updateCheckRun(token, owner, repo, checkRun.id, {
        status: 'completed',
        conclusion: 'success',
        output: {
          title: 'No dependencies found',
          summary: `\`${manifest.path}\` contains no dependencies to audit.`,
        },
      });
      await createCommitStatus(token, owner, repo, headSha, {
        state: 'success',
        description: 'No dependencies',
        context: 'isitalive',
      });
      return;
    }

    const resolved = await resolveAll(deps, env);
    const contentHash = await hashManifest(content);
    const auditResult = await scoreAudit(resolved, manifest.format, contentHash, env, ctx);

    // Build check run output
    const output = buildCheckRunOutput(auditResult, manifest.path, config);
    const conclusion = getConclusion(auditResult, config.scoreThreshold);

    // Annotate title for baseline audits (no manifest changes in the PR)
    if (isBaseline) {
      output.title += ' (baseline)';
    }

    // Update the check run with results
    await updateCheckRun(token, owner, repo, checkRun.id, {
      status: 'completed',
      conclusion,
      output,
    });

    // Post final commit status
    await createCommitStatus(token, owner, repo, headSha, {
      state: conclusion === 'success' ? 'success' : 'failure',
      description: `Score: ${auditResult.summary.avgScore}/100 (${auditResult.scored} deps)`,
      context: 'isitalive',
      targetUrl: checkRun.html_url,
    });

    // Post or update PR comment with audit results (best-effort)
    const commentBody = buildPRCommentBody(auditResult, manifest.path, config, isBaseline);
    try {
      const existing = await findPRComment(token, owner, repo, pr.number, COMMENT_MARKER);

      if (existing) {
        await updatePRComment(token, owner, repo, existing.id, commentBody);
      } else {
        await createPRComment(token, owner, repo, pr.number, commentBody);
      }
    } catch (commentErr) {
      // Best-effort: PR comment failures should not affect audit outcome
      console.warn('Failed to post/update PR comment:', commentErr);
    }

    // Emit analytics event
    const analyticsData: GitHubAppAnalytics = {
      installationId: installation.id,
      action: 'audit',
      trigger: 'pull_request',
      repoFullName: repository.full_name,
      prNumber: pr.number,
      manifestFormat: manifest.format,
      depCount: deps.length,
      avgScore: auditResult.summary.avgScore,
      conclusion,
      threshold: config.scoreThreshold,
      processingTimeMs: Date.now() - startTime,
    };

    ctx.waitUntil(
      env.EVENTS_QUEUE.send({
        type: 'github-app-event',
        data: analyticsData,
      } satisfies QueueMessage),
    );
  } catch (err: any) {
    console.error('GitHub App: PR handler error:', err);

    // Update check run with error
    await updateCheckRun(token, owner, repo, checkRun.id, {
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Audit error',
        summary: `An error occurred while auditing dependencies: ${err.message}`,
      },
    }).catch(() => {}); // best effort

    await createCommitStatus(token, owner, repo, headSha, {
      state: 'error',
      description: 'Audit failed — see check run for details',
      context: 'isitalive',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Push: default branch only — re-score baseline
// ---------------------------------------------------------------------------

export async function handlePush(
  event: PushEvent,
  env: Env,
  ctx: ExecutionContext,
  config: GitHubAppConfig,
): Promise<void> {
  const { repository, installation, after: headSha } = event;

  // Only process pushes to the default branch
  const expectedRef = `refs/heads/${repository.default_branch}`;
  if (event.ref !== expectedRef) return;

  const [owner, repo] = repository.full_name.split('/');
  const token = await getInstallationToken(env, installation.id);
  const startTime = Date.now();

  // Try to find and audit manifest files on the default branch
  // Check common locations
  const manifestPaths = ['package.json', 'go.mod'];

  for (const manifestPath of manifestPaths) {
    try {
      const content = await getFileContent(token, owner, repo, manifestPath, headSha);
      const format = manifestPath as 'package.json' | 'go.mod';
      const deps = parseManifest(format, content);

      if (deps.length === 0) continue;

      const resolved = await resolveAll(deps, env);
      const contentHash = await hashManifest(content);
      const auditResult = await scoreAudit(resolved, format, contentHash, env, ctx);

      // Emit analytics
      ctx.waitUntil(
        env.EVENTS_QUEUE.send({
          type: 'github-app-event',
          data: {
            installationId: installation.id,
            action: 'audit',
            trigger: 'push',
            repoFullName: repository.full_name,
            manifestFormat: format,
            depCount: deps.length,
            avgScore: auditResult.summary.avgScore,
            conclusion: getConclusion(auditResult, config.scoreThreshold),
            threshold: config.scoreThreshold,
            processingTimeMs: Date.now() - startTime,
          } satisfies GitHubAppAnalytics,
        } satisfies QueueMessage),
      );

      break; // Only audit the first manifest found
    } catch {
      // File not found on this branch — try next
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// Installation: created — log the event
// ---------------------------------------------------------------------------

export async function handleInstallation(
  event: InstallationEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  if (event.action !== 'created') return;

  const { installation, repositories } = event;
  console.log(
    `GitHub App: installed on ${installation.account.login} ` +
    `(${installation.account.type}) — ` +
    `${repositories?.length ?? 0} repos`,
  );

  // Could emit an analytics event for installation tracking here
}
