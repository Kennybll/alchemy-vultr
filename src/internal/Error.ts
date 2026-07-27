import * as Data from "effect/Data";

/**
 * Generic Vultr API failure (validation, auth, and other non-classified
 * statuses). Prefer the more specific tags below when matching lifecycle races.
 */
export class VultrApiError extends Data.TaggedError("VultrApiError")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * API key is valid but this egress IP is not on the account allowlist.
 * Live shape: `{ "error": "Unauthorized IP address: 1.2.3.4", "status": 401 }`.
 */
export class VultrUnauthorizedIp extends Data.TaggedError("VultrUnauthorizedIp")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly ip?: string;
  readonly body?: unknown;
}> {}

/**
 * Missing/invalid API token.
 * Live shape: `{ "error": "Invalid API token.", "status": 401 }`.
 */
export class VultrInvalidToken extends Data.TaggedError("VultrInvalidToken")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * Resource or path was not found. Delete/read treat this as success / missing.
 */
export class VultrNotFound extends Data.TaggedError("VultrNotFound")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * Create raced with an already-existing resource (or similar conflict).
 * Reconcile should observe and continue.
 */
export class VultrConflict extends Data.TaggedError("VultrConflict")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * Rate limited — retry with backoff.
 */
export class VultrRateLimited extends Data.TaggedError("VultrRateLimited")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * Transient upstream / transport failure — retry with backoff.
 */
export class VultrUnavailable extends Data.TaggedError("VultrUnavailable")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly message: string;
  readonly body?: unknown;
}> {}

/**
 * Unexpected / malformed Vultr API response.
 */
export class VultrDecodeError extends Data.TaggedError("VultrDecodeError")<{
  readonly method: string;
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type VultrError =
  | VultrApiError
  | VultrUnauthorizedIp
  | VultrInvalidToken
  | VultrNotFound
  | VultrConflict
  | VultrRateLimited
  | VultrUnavailable
  | VultrDecodeError;
