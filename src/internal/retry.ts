import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import {
  VultrRateLimited,
  VultrUnavailable,
  type VultrError,
} from "./Error.ts";

const isTransient = (error: VultrError): boolean =>
  error._tag === "VultrRateLimited" || error._tag === "VultrUnavailable";

/**
 * Bounded exponential backoff for Vultr rate limits and 5xx/transport blips.
 * Caps total attempts so lifecycle never hangs (factory speed doctrine).
 */
export const withTransientRetry = <A, E extends VultrError, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.retry({
      while: (error) => isTransient(error),
      // Bound total attempts (factory speed doctrine: no unbounded waits).
      times: 5,
      schedule: Schedule.max([
        Schedule.exponential(Duration.millis(100)),
        Schedule.recurs(5),
      ]),
    }),
  );

export const isRateLimited = (error: unknown): error is VultrRateLimited =>
  error instanceof VultrRateLimited;

export const isUnavailable = (error: unknown): error is VultrUnavailable =>
  error instanceof VultrUnavailable;
