/**
 * Minimal stack matching the Custom Provider guide end-state:
 * https://alchemy.run/infrastructure-as-code/custom-provider/
 *
 *   export VULTR_API_KEY=...
 *   bun alchemy deploy examples/basic.ts
 *   bun alchemy deploy examples/basic.ts --stage staging
 *   bun alchemy destroy examples/basic.ts --stage staging
 *
 * Omit SSH / startup-script names so createPhysicalName embeds the stage
 * (required for multi-stage isolation on a shared Vultr account).
 */
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Vultr from "../src/index.ts";

export default Alchemy.Stack(
  "VultrBasic",
  {
    providers: Vultr.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const key = yield* Vultr.SshKey.SshKey("deploy", {
      sshKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample alchemy-vultr@example",
    });

    const vpc = yield* Vultr.Vpc.Vpc("net", {
      region: "ewr",
      description: `basic-example-${stage}`,
    });

    return {
      stage,
      sshKeyId: key.id,
      sshKeyName: key.name,
      vpcId: vpc.id,
    };
  }),
);
