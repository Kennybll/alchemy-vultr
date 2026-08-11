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

/**
 * A create-only ("first boot") input changed on a resource that is already
 * deployed. Vultr has no API to re-apply it, so the provider fails instead of
 * reporting a convergence that never physically happened — the plan must
 * replace the resource.
 */
export class VultrCreateOnlyChange extends Data.TaggedError("VultrCreateOnlyChange")<{
  readonly resourceType: string;
  readonly id?: string;
  /** Props that changed and can only take effect on a fresh resource. */
  readonly props: ReadonlyArray<string>;
  readonly message: string;
}> {}

/**
 * A resource never reached a usable state within its readiness budget — e.g.
 * Vultr kept reporting the `0.0.0.0` provisioning placeholder instead of
 * assigning a public IPv4 address.
 */
export class VultrNotReady extends Data.TaggedError("VultrNotReady")<{
  readonly resourceType: string;
  readonly id: string;
  readonly attempts: number;
  /** Total time spent polling, in milliseconds. */
  readonly waitedMillis: number;
  readonly lastIp?: string;
  readonly status?: string;
  readonly serverStatus?: string;
  readonly message: string;
}> {}

/**
 * More than one live resource carries this resource's ownership marker, so the
 * provider cannot tell which one it created. Fails closed rather than picking
 * one arbitrarily and orphaning (or deleting) the other.
 */
export class VultrAmbiguousRecovery extends Data.TaggedError("VultrAmbiguousRecovery")<{
  readonly resourceType: string;
  readonly fqn: string;
  readonly tag: string;
  readonly candidateIds: ReadonlyArray<string>;
  readonly message: string;
}> {}

/**
 * Lifecycle failures raised by resource providers rather than by the HTTP
 * client. Kept out of {@link VultrError} so `VultrClientService` keeps
 * declaring only the errors it can actually produce.
 */
export type VultrLifecycleError = VultrCreateOnlyChange | VultrNotReady | VultrAmbiguousRecovery;

export type VultrError =
  | VultrApiError
  | VultrUnauthorizedIp
  | VultrInvalidToken
  | VultrNotFound
  | VultrConflict
  | VultrRateLimited
  | VultrUnavailable
  | VultrDecodeError;
