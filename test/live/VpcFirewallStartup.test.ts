/**
 * Live lifecycle for cheap account-scoped primitives:
 * StartupScript, Vpc, Firewall.Group, Firewall.Rule.
 */
import { beforeAll, expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Vultr from "../../src/index.ts";
import {
  clientGet,
  clientListAll,
  hasApiKey,
  probeAuthenticatedAccess,
} from "./helpers.ts";
import type { JsonObject } from "../../src/internal/defineResource.ts";

const { test } = Test.make({
  providers: Vultr.providers(),
});

let authOk = false;

beforeAll(async () => {
  if (!hasApiKey) return;
  authOk = (await probeAuthenticatedAccess()).ok;
});

test.provider.skipIf(!hasApiKey)(
  "startup script create / update / destroy",
  (stack) =>
    Effect.gen(function* () {
      if (!authOk) {
        console.warn("skip StartupScript — authenticated access blocked");
        return;
      }
      yield* stack.destroy();

      const created = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.StartupScript.StartupScript("Boot", {
            name: "alchemy-vultr-live-boot",
            script: "#!/bin/bash\necho alchemy-vultr-live",
            type: "boot",
          });
        }),
      );
      expect(created.id.length).toBeGreaterThan(0);

      const live = yield* clientGet(`/startup-scripts/${created.id}`);
      const wrap = (live.startup_script ?? live) as JsonObject;
      expect(String(wrap.id)).toBe(created.id);
      expect(String(wrap.name)).toBe("alchemy-vultr-live-boot");
      // Wire format is base64 (OpenAPI/docs often under-specify this).
      const decoded = Buffer.from(String(wrap.script ?? ""), "base64").toString(
        "utf8",
      );
      expect(decoded).toContain("alchemy-vultr-live");

      const updated = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.StartupScript.StartupScript("Boot", {
            name: "alchemy-vultr-live-boot-v2",
            script: "#!/bin/bash\necho alchemy-vultr-live-v2",
            type: "boot",
          });
        }),
      );
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe("alchemy-vultr-live-boot-v2");

      yield* stack.destroy();
      const gone = yield* clientGet(`/startup-scripts/${created.id}`).pipe(
        Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
      );
      expect(gone).toBeUndefined();
    }),
  { timeout: 180_000 },
);

test.provider.skipIf(!hasApiKey)(
  "vpc create / update description / destroy",
  (stack) =>
    Effect.gen(function* () {
      if (!authOk) {
        console.warn("skip Vpc — authenticated access blocked");
        return;
      }
      yield* stack.destroy();

      const created = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.Vpc.Vpc("Net", {
            region: "ewr",
            description: "alchemy-vultr-live-vpc",
          });
        }),
      );
      expect(created.id.length).toBeGreaterThan(0);

      const live = yield* clientGet(`/vpcs/${created.id}`);
      const wrap = (live.vpc ?? live) as JsonObject;
      expect(String(wrap.id)).toBe(created.id);
      expect(String(wrap.region)).toBe("ewr");

      const updated = yield* stack.deploy(
        Effect.gen(function* () {
          return yield* Vultr.Vpc.Vpc("Net", {
            region: "ewr",
            description: "alchemy-vultr-live-vpc-v2",
          });
        }),
      );
      expect(updated.id).toBe(created.id);

      yield* stack.destroy();
      const gone = yield* clientGet(`/vpcs/${created.id}`).pipe(
        Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
      );
      expect(gone).toBeUndefined();
    }),
  { timeout: 180_000 },
);

test.provider.skipIf(!hasApiKey)(
  "firewall group + rule create / list / destroy",
  (stack) =>
    Effect.gen(function* () {
      if (!authOk) {
        console.warn("skip Firewall — authenticated access blocked");
        return;
      }
      yield* stack.destroy();

      const deployed = yield* stack.deploy(
        Effect.gen(function* () {
          const group = yield* Vultr.Firewall.Group("Edge", {
            description: "alchemy-vultr-live-fw",
          });
          const rule = yield* Vultr.Firewall.Rule("Ssh", {
            firewallGroup: group,
            ipType: "v4",
            protocol: "tcp",
            subnet: "0.0.0.0",
            subnetSize: 0,
            port: "22",
            notes: "alchemy-vultr-live",
          });
          return { group, rule };
        }),
      );

      expect(deployed.group.id.length).toBeGreaterThan(0);
      expect(deployed.rule.id.length).toBeGreaterThan(0);
      expect(deployed.rule.firewallGroupId).toBe(deployed.group.id);

      const groups = yield* clientListAll("/firewalls", "firewall_groups");
      expect(groups.some((g) => String(g.id) === deployed.group.id)).toBe(true);

      const rules = yield* clientListAll(
        `/firewalls/${deployed.group.id}/rules`,
        "firewall_rules",
      );
      expect(rules.some((r) => String(r.id) === deployed.rule.id)).toBe(true);

      yield* stack.destroy();

      const groupGone = yield* clientGet(`/firewalls/${deployed.group.id}`).pipe(
        Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
      );
      expect(groupGone).toBeUndefined();
    }),
  { timeout: 180_000 },
);
