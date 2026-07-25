/**
 * Live provider lifecycle test (alchemy factory shape).
 *
 * Run: `VULTR_API_KEY=... bun run test:live`
 * Skips cleanly when the env key is unset.
 */
import { expect, test as bunTest } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Vultr from "../../src/index.ts";
import { fromApiKey } from "../../src/Credentials.ts";
import { VultrClient, VultrClientLive } from "../../src/internal/Client.ts";
import type { JsonObject } from "../../src/internal/defineResource.ts";

const apiKey = process.env.VULTR_API_KEY;
const { test } = Test.make({
  providers: Vultr.providers(),
});

const outOfBandGet = (id: string) =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.get<JsonObject>(`/ssh-keys/${id}`);
  }).pipe(
    Effect.provide(VultrClientLive),
    Effect.provide(fromApiKey(apiKey ?? "missing")),
    Effect.provide(FetchHttpClient.layer),
  );

bunTest.skipIf(!apiKey)("alchemy-test adapter loads", () => {
  expect(typeof test.provider).toBe("function");
});

test.provider.skipIf(!apiKey)(
  "create, verify out-of-band, and delete an SSH key",
  (stack) =>
    Effect.gen(function* () {
      yield* stack.destroy();

      const key = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.SshKey.SshKey("LiveKey", {
            // Deterministic ed25519 public key fixture (not a private key).
            sshKey:
              "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAliveAlchemyVultrFactoryTestKey00001 alchemy-vultr-live@test",
          });
        }),
      );

      expect(key.id.length).toBeGreaterThan(0);
      expect(key.name.length).toBeGreaterThan(0);

      const live = yield* outOfBandGet(key.id);
      const wrap = (live.ssh_key ?? live) as JsonObject;
      expect(String(wrap.id)).toBe(key.id);

      yield* stack.destroy();

      const gone = yield* outOfBandGet(key.id).pipe(
        Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
      );
      expect(gone).toBeUndefined();
    }),
  { timeout: 120_000 },
);
