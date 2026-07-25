/**
 * Alchemy stages isolate state + physical names. Vultr accounts are shared,
 * so omitted names must go through createPhysicalName (includes stage).
 *
 * Run: `CI=1 VULTR_API_KEY=... bun run test:live`
 */
import { beforeAll, expect } from "bun:test";
import * as Alchemy from "alchemy";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Vultr from "../../src/index.ts";
import {
  clientGet,
  hasApiKey,
  probeAuthenticatedAccess,
} from "./helpers.ts";
import type { JsonObject } from "../../src/internal/defineResource.ts";

const SSH_PUB =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStageIsolationTestKey00000001 alchemy-vultr-stage@test";

const { test, deploy, destroy } = Test.make({
  providers: Vultr.providers(),
});

/** Scratch provider tests pinned to a non-default stage. */
const { test: prStageTest } = Test.make({
  providers: Vultr.providers(),
  stage: "pr42",
});

let authOk = false;

beforeAll(async () => {
  if (!hasApiKey) return;
  authOk = (await probeAuthenticatedAccess()).ok;
});

const StageStack = Alchemy.Stack(
  "VultrStageLive",
  {
    providers: Vultr.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const key = yield* Vultr.SshKey.SshKey("DeployKey", {
      // Omit name → createPhysicalName embeds stack + stage.
      sshKey: SSH_PUB,
    });
    const script = yield* Vultr.StartupScript.StartupScript("Boot", {
      script: `#!/bin/bash\necho alchemy-vultr-stage-${stage}`,
      type: "boot",
    });
    const vpc = yield* Vultr.Vpc.Vpc("Net", {
      region: "ewr",
      description: `alchemy-vultr-${stage}`,
    });
    return {
      stage,
      keyId: key.id,
      keyName: key.name,
      scriptId: script.id,
      scriptName: script.name,
      vpcId: vpc.id,
    };
  }),
);

prStageTest.provider.skipIf(!hasApiKey)(
  "omitted names include the configured alchemy stage",
  (stack) =>
    Effect.gen(function* () {
      if (!authOk) {
        console.warn("skip stage physical names — authenticated access blocked");
        return;
      }
      yield* stack.destroy();

      const created = yield* stack.deploy(
        Effect.gen(function* () {
          const key = yield* Vultr.SshKey.SshKey("DeployKey", {
            sshKey: SSH_PUB,
          });
          const script = yield* Vultr.StartupScript.StartupScript("Boot", {
            script: "#!/bin/bash\necho pr42",
            type: "boot",
          });
          return { key, script };
        }),
      );

      expect(created.key.name.toLowerCase()).toContain("pr42");
      expect(created.script.name.toLowerCase()).toContain("pr42");

      yield* stack.destroy();
    }),
  { timeout: 180_000 },
);

test.skipIf(!hasApiKey)(
  "two stages get distinct resources; destroy is stage-scoped",
  Effect.gen(function* () {
    if (!authOk) {
      console.warn("skip multi-stage — authenticated access blocked");
      return;
    }

    // Best-effort cleanup from a prior interrupted run.
    yield* destroy(StageStack, { stage: "livea" }).pipe(Effect.ignore);
    yield* destroy(StageStack, { stage: "liveb" }).pipe(Effect.ignore);

    const a = yield* deploy(StageStack, { stage: "livea" });
    const b = yield* deploy(StageStack, { stage: "liveb" });

    expect(a.stage).toBe("livea");
    expect(b.stage).toBe("liveb");
    expect(a.keyId).not.toBe(b.keyId);
    expect(a.scriptId).not.toBe(b.scriptId);
    expect(a.vpcId).not.toBe(b.vpcId);
    expect(a.keyName.toLowerCase()).toContain("livea");
    expect(b.keyName.toLowerCase()).toContain("liveb");
    expect(a.scriptName.toLowerCase()).toContain("livea");
    expect(b.scriptName.toLowerCase()).toContain("liveb");

    const vpcA = yield* clientGet(`/vpcs/${a.vpcId}`);
    const vpcAWrap = (vpcA.vpc ?? vpcA) as JsonObject;
    expect(String(vpcAWrap.description)).toBe("alchemy-vultr-livea");

    // Destroy only stage A — B must remain live on the shared Vultr account.
    yield* destroy(StageStack, { stage: "livea" });

    const aKeyGone = yield* clientGet(`/ssh-keys/${a.keyId}`).pipe(
      Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
    );
    expect(aKeyGone).toBeUndefined();

    const aScriptGone = yield* clientGet(`/startup-scripts/${a.scriptId}`).pipe(
      Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
    );
    expect(aScriptGone).toBeUndefined();

    const aVpcGone = yield* clientGet(`/vpcs/${a.vpcId}`).pipe(
      Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
    );
    expect(aVpcGone).toBeUndefined();

    const bKey = yield* clientGet(`/ssh-keys/${b.keyId}`);
    expect(String(((bKey.ssh_key ?? bKey) as JsonObject).id)).toBe(b.keyId);

    const bScript = yield* clientGet(`/startup-scripts/${b.scriptId}`);
    expect(
      String(((bScript.startup_script ?? bScript) as JsonObject).id),
    ).toBe(b.scriptId);

    const bVpc = yield* clientGet(`/vpcs/${b.vpcId}`);
    expect(String(((bVpc.vpc ?? bVpc) as JsonObject).id)).toBe(b.vpcId);

    yield* destroy(StageStack, { stage: "liveb" });

    const bKeyGone = yield* clientGet(`/ssh-keys/${b.keyId}`).pipe(
      Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
    );
    expect(bKeyGone).toBeUndefined();
  }),
  { timeout: 300_000 },
);
