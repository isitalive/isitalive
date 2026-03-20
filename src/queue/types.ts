// ---------------------------------------------------------------------------
// Unified Event Queue — message types
//
// A single queue carries all background event types. The consumer
// receives batches and processes each type efficiently.
// ---------------------------------------------------------------------------

import type { CheckEventContext } from '../analytics/events';
import type { ScoringResult } from '../scoring/types';
import type { GitHubAppAnalytics } from '../github/types';

/** Recent query tracking — replaces KV read-modify-write */
export interface RecentQueryMessage {
  type: 'recent-query';
  data: {
    owner: string;
    repo: string;
    score: number;
    verdict: string;
    checkedAt: string;
  };
}

/** Analytics event — replaces direct Pipeline send */
export interface CheckEventMessage {
  type: 'check-event';
  data: {
    result: ScoringResult;
    ctx: CheckEventContext;
  };
}

/** First-seen tracking — replaces KV read-then-conditional-write */
export interface FirstSeenMessage {
  type: 'first-seen';
  data: {
    provider: string;
    owner: string;
    repo: string;
  };
}

/** R2 raw data archival */
export interface ArchiveRawMessage {
  type: 'archive-raw';
  data: {
    provider: string;
    owner: string;
    repo: string;
    rawResponse: any;
  };
}

/** Page view — client-side beacon tracking for real browser views */
export interface PageViewMessage {
  type: 'page-view';
  data: {
    provider: string;
    owner: string;
    repo: string;
    score: number;
    verdict: string;
  };
}

/** GitHub App analytics event — audit results from PR checks and re-scans */
export interface GitHubAppEventMessage {
  type: 'github-app-event';
  data: GitHubAppAnalytics;
}

export type QueueMessage =
  | RecentQueryMessage
  | CheckEventMessage
  | FirstSeenMessage
  | ArchiveRawMessage
  | PageViewMessage
  | GitHubAppEventMessage;
