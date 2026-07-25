import * as Redacted from "effect/Redacted";

/**
 * Accept either a plain string or a {@link Redacted.Redacted} and unwrap
 * for wire bodies. Prefer declaring sensitive props as `Redacted.Redacted`.
 */
export const reveal = (
  value: string | Redacted.Redacted<string> | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : Redacted.value(value);
};

/**
 * Wrap a live secret attribute. Empty / missing values stay empty strings
 * wrapped so attrs stay typed as Redacted.
 */
export const redact = (
  value: unknown,
): Redacted.Redacted<string> =>
  Redacted.make(typeof value === "string" ? value : String(value ?? ""));
