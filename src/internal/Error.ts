import * as Data from "effect/Data";

/**
 * Typed Vultr API failure.
 */
export class VultrApiError extends Data.TaggedError("VultrApiError")<{
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

export type VultrError = VultrApiError | VultrDecodeError;
