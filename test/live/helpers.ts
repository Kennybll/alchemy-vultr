import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fromApiKey } from "../../src/Credentials.ts";
import type { VultrClientError } from "../../src/internal/Client.ts";
import { VultrClient, VultrClientLive } from "../../src/internal/Client.ts";
import type { JsonObject } from "../../src/internal/defineResource.ts";

export const apiKey = process.env.VULTR_API_KEY;

/** True when a key is present (live suite may still hit IP allowlisting). */
export const hasApiKey = Boolean(apiKey && apiKey.length > 0);

/**
 * Probe whether authenticated Vultr calls work from this egress IP.
 * Account IP allowlists return 401 `Unauthorized IP address: …`.
 */
export const probeAuthenticatedAccess = (): Promise<{
  ok: boolean;
  reason?: string;
}> =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    yield* client.get<JsonObject>("/ssh-keys");
    return { ok: true as const };
  }).pipe(
    Effect.catch((error: VultrClientError) =>
      Effect.succeed({
        ok: false as const,
        reason: `${error._tag}: ${error.message}`,
      }),
    ),
    Effect.provide(VultrClientLive),
    Effect.provide(fromApiKey(apiKey ?? "missing")),
    Effect.provide(FetchHttpClient.layer),
    Effect.runPromise,
  );

export const withClient = <A>(effect: Effect.Effect<A, VultrClientError, VultrClient>) =>
  effect.pipe(
    Effect.provide(VultrClientLive),
    Effect.provide(fromApiKey(apiKey ?? "missing")),
    Effect.provide(FetchHttpClient.layer),
  );

export const clientGet = <A = JsonObject>(path: string) =>
  withClient(
    Effect.gen(function* () {
      const client = yield* yield* VultrClient;
      return yield* client.get<A>(path);
    }),
  );

export const clientListAll = <A = JsonObject>(path: string, key: string) =>
  withClient(
    Effect.gen(function* () {
      const client = yield* yield* VultrClient;
      return yield* client.listAll<A>(path, key);
    }),
  );
