/**
 * Live provider lifecycle test (alchemy factory shape).
 *
 * Run: `CI=1 VULTR_API_KEY=... bun run test:live`
 */
import { beforeAll, test as bunTest, expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Vultr from "../../src/index.ts";
import type { JsonObject } from "../../src/internal/defineResource.ts";
import { clientGet, hasApiKey, probeAuthenticatedAccess } from "./helpers.ts";

const { test } = Test.make({
  providers: Vultr.providers(),
});

let authOk = false;

beforeAll(async () => {
  if (!hasApiKey) return;
  authOk = (await probeAuthenticatedAccess()).ok;
});

bunTest.skipIf(!hasApiKey)("alchemy-test adapter loads", () => {
  expect(typeof test.provider).toBe("function");
});

test.provider.skipIf(!hasApiKey)(
  "create, update, verify out-of-band, and delete an SSH key",
  (stack) =>
    Effect.gen(function* () {
      if (!authOk) {
        console.warn("skip SshKey lifecycle — authenticated access blocked");
        return;
      }

      yield* stack.destroy();

      const created = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.SshKey.SshKey("LiveKey", {
            name: "alchemy-vultr-live-ssh",
            sshKey:
              "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAliveAlchemyVultrFactoryTestKey00001 alchemy-vultr-live@test",
          });
        }),
      );

      expect(created.id.length).toBeGreaterThan(0);
      expect(created.name).toBe("alchemy-vultr-live-ssh");

      const live1 = yield* clientGet(`/ssh-keys/${created.id}`);
      const wrap1 = (live1.ssh_key ?? live1) as JsonObject;
      expect(String(wrap1.id)).toBe(created.id);
      expect(String(wrap1.name)).toBe("alchemy-vultr-live-ssh");

      const updated = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.SshKey.SshKey("LiveKey", {
            name: "alchemy-vultr-live-ssh-v2",
            sshKey:
              "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAliveAlchemyVultrFactoryTestKey00001 alchemy-vultr-live@test",
          });
        }),
      );
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe("alchemy-vultr-live-ssh-v2");

      const live2 = yield* clientGet(`/ssh-keys/${updated.id}`);
      const wrap2 = (live2.ssh_key ?? live2) as JsonObject;
      expect(String(wrap2.name)).toBe("alchemy-vultr-live-ssh-v2");

      yield* stack.destroy();

      const gone = yield* clientGet(`/ssh-keys/${created.id}`).pipe(
        Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
      );
      expect(gone).toBeUndefined();
    }),
  { timeout: 180_000 },
);
