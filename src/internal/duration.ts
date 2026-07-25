import * as Duration from "effect/Duration";

/**
 * Re-hydrate a {@link Duration.Input} that may have been persisted as a
 * Duration object in state (same approach as alchemy/Util Duration helpers).
 */
export const normalizeDurationInput = (
  input: Duration.Input,
): Duration.Input => {
  if (typeof input === "object" && input !== null && "value" in input) {
    const value = (input as { value: unknown }).value;
    if (typeof value === "bigint") return Duration.nanos(value);
    if (typeof value === "number") return Duration.millis(value);
  }
  return input;
};

/**
 * Convert a {@link Duration.Input} to whole, non-negative seconds for Vultr
 * wire fields (load balancer timeout, OIDC TTL, …).
 */
export const toWireSeconds = (
  input: Duration.Input | undefined,
): number | undefined => {
  if (input === undefined) return undefined;
  return Math.max(
    0,
    Math.ceil(Duration.toSeconds(normalizeDurationInput(input))),
  );
};

/**
 * Convert a {@link Duration.Input} to whole, non-negative hours.
 */
export const toWireHours = (
  input: Duration.Input | undefined,
): number | undefined => {
  if (input === undefined) return undefined;
  return Math.max(
    0,
    Math.ceil(Duration.toHours(normalizeDurationInput(input))),
  );
};
