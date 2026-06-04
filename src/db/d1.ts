export type D1Queryable = D1Database | D1DatabaseSession

export interface D1ReplicationDiagnostic {
  served_by_region?: string
  served_by_primary?: boolean
  bookmark: string | null
}

type D1WithSession = D1Database & {
  withSession: (constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint) => D1DatabaseSession
}

function hasSessionApi(db: D1Database): db is D1WithSession {
  return typeof (db as { withSession?: unknown }).withSession === 'function'
}

export function readReplicaSession(db: D1Database): D1Queryable {
  return hasSessionApi(db) ? db.withSession('first-unconstrained') : db
}

export function readPrimarySession(db: D1Database): D1Queryable {
  return hasSessionApi(db) ? db.withSession('first-primary') : db
}

function getSessionBookmark(queryable: D1Queryable): string | null {
  const bookmark = (queryable as { getBookmark?: unknown }).getBookmark
  return typeof bookmark === 'function' ? bookmark.call(queryable) ?? null : null
}

export function d1ReplicationDiagnostic(
  queryable: D1Queryable,
  result: D1Result<unknown>,
): D1ReplicationDiagnostic {
  return {
    served_by_region: result.meta.served_by_region,
    served_by_primary: result.meta.served_by_primary,
    bookmark: getSessionBookmark(queryable),
  }
}
