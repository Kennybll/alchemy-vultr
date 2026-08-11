import * as Duration from "effect/Duration";

/**
 * Re-hydrate a {@link Duration.Input} that may have been persisted as a
 * Duration object in state (same approach as alchemy/Util Duration helpers).
 */
export const normalizeDurationInput = (input: Duration.Input): Duration.Input => {
  if (typeof input !== "object" || input === null) return input;

  // Effect 3 durations persisted their scalar representation under `value`.
  if ("value" in input) {
    const value = (input as { readonly value: unknown }).value;
    if (typeof value === "bigint") return Duration.nanos(value);
    if (typeof value === "number") return Duration.millis(value);
  }

  // Effect 4's `Duration.toJSON` shape is not itself a Duration.Input: without
  // rehydration, `fromInputUnsafe` treats it as an empty DurationObject (zero).
  const json = input as unknown as {
    readonly _id?: unknown;
    readonly _tag?: "Millis" | "Nanos" | "Infinity" | "NegativeInfinity";
    readonly millis?: unknown;
    readonly nanos?: unknown;
  };
  if (json._id === "Duration") {
    if (json._tag === "Millis" && typeof json.millis === "number") return json.millis;
    if (
      json._tag === "Nanos" &&
      (typeof json.nanos === "string" || typeof json.nanos === "bigint")
    ) {
      return BigInt(json.nanos);
    }
    if (json._tag === "Infinity") return "Infinity";
    if (json._tag === "NegativeInfinity") return "-Infinity";
  }
  return input;
};

/**
 * Convert a {@link Duration.Input} to whole, non-negative seconds for Vultr
 * wire fields (load balancer timeout, OIDC TTL, …).
 */
export const toWireSeconds = (input: Duration.Input | undefined): number | undefined => {
  if (input === undefined) return undefined;
  return Math.max(0, Math.ceil(Duration.toSeconds(normalizeDurationInput(input))));
};

/**
 * Convert a {@link Duration.Input} to whole, non-negative hours.
 */
export const toWireHours = (input: Duration.Input | undefined): number | undefined => {
  if (input === undefined) return undefined;
  return Math.max(0, Math.ceil(Duration.toHours(normalizeDurationInput(input))));
};
