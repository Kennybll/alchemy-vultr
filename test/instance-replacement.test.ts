/**
 * Create-only ("first boot") replacement semantics for `Vultr.Instance.Instance`.
 *
 * Vultr consumes `userData`, `scriptId`, `sshKeyIds`, … only while a VM is
 * provisioned, so a change to one of them must plan a replacement instead of
 * converging in place. See issue #3.
 */
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { instanceLifecycle } from "../src/Instance/Instance.ts";
import { VultrCreateOnlyChange } from "../src/internal/Error.ts";
import { fakeVultrApi } from "./helpers/fakeClient.ts";

const BASE = {
  region: "ewr",
  plan: "vc2-1c-1gb",
  osId: 2284,
  label: "app",
} as const;

const plan = (news: Record<string, unknown>, olds: Record<string, unknown>) =>
  Effect.runPromise(
    (instanceLifecycle.diff as any)({
      id: "App",
      fqn: "App",
      instanceId: "gen-1",
      olds,
      news,
      oldBindings: [],
      newBindings: [],
      output: { id: "vm-1" },
    }),
  );

const LIVE_INSTANCE = {
  id: "vm-1",
  region: "ewr",
  plan: "vc2-1c-1gb",
  os_id: 2284,
  label: "app",
  main_ip: "149.28.225.185",
  status: "active",
  server_status: "ok",
  tags: [],
};

const reconcile = (
  news: Record<string, unknown>,
  olds: Record<string, unknown> | undefined,
  api = fakeVultrApi(() => ({ status: 200, body: { instance: LIVE_INSTANCE } })),
) => ({
  api,
  run: Effect.runPromise(
    (instanceLifecycle.reconcile as any)({
      id: "App",
      fqn: "App",
      instanceId: "gen-1",
      news,
      olds,
      output: { id: "vm-1" },
      session: {},
      bindings: [],
    }).pipe(Effect.provide(api.layer)),
  ),
});

describe("Instance diff — create-only inputs plan replacement", () => {
  it("replaces when userData changes", async () => {
    expect(
      await plan({ ...BASE, userData: "#cloud-config\nb" }, { ...BASE, userData: "a" }),
    ).toEqual({ action: "replace" });
  });

  it("replaces when scriptId changes", async () => {
    expect(await plan({ ...BASE, scriptId: "s-2" }, { ...BASE, scriptId: "s-1" })).toEqual({
      action: "replace",
    });
  });

  it("replaces when sshKeyIds change", async () => {
    expect(
      await plan({ ...BASE, sshKeyIds: ["k-1", "k-2"] }, { ...BASE, sshKeyIds: ["k-1"] }),
    ).toEqual({ action: "replace" });
  });

  it("ignores sshKeyIds ordering (Terraform models them as a set)", async () => {
    expect(
      await plan({ ...BASE, sshKeyIds: ["k-2", "k-1"] }, { ...BASE, sshKeyIds: ["k-1", "k-2"] }),
    ).toBeUndefined();
  });

  it.each([
    ["disablePublicIpv4", true, false],
    ["reservedIpv4", "192.0.2.10", "192.0.2.11"],
    ["userScheme", "root", "limited"],
    ["bootstrapVersion", "sha-a", "sha-b"],
    ["hostname", "app-1", "app-2"],
    ["region", "ewr", "lax"],
    ["osId", 2284, 1743],
  ])("replaces when %s changes", async (prop, oldValue, newValue) => {
    expect(await plan({ ...BASE, [prop]: newValue }, { ...BASE, [prop]: oldValue })).toEqual({
      action: "replace",
    });
  });

  it("replaces when appVariables change but not when only their key order does", async () => {
    expect(
      await plan(
        { ...BASE, appVariables: { a: "1", b: "2" } },
        { ...BASE, appVariables: { b: "2", a: "1" } },
      ),
    ).toBeUndefined();
    expect(
      await plan({ ...BASE, appVariables: { a: "2" } }, { ...BASE, appVariables: { a: "1" } }),
    ).toEqual({ action: "replace" });
  });

  it("replaces when a create-only input is still an unresolved Output", async () => {
    // The upstream startup script is itself being replaced, so `scriptId`
    // cannot be compared. Returning `undefined` here would let Alchemy fall
    // back to `havePropsChanged` → in-place update.
    expect(
      await plan({ ...BASE, scriptId: Effect.succeed("s-2") }, { ...BASE, scriptId: "s-1" }),
    ).toEqual({ action: "replace" });
  });

  it("leaves mutable inputs to the engine's own diff", async () => {
    expect(
      await plan(
        { ...BASE, label: "renamed", tags: ["b"], backups: "enabled", firewallGroupId: "fw-2" },
        { ...BASE, label: "app", tags: ["a"], backups: "disabled", firewallGroupId: "fw-1" },
      ),
    ).toBeUndefined();
  });

  it("is a no-op for an unchanged instance", async () => {
    const props = { ...BASE, userData: "a", scriptId: "s-1", sshKeyIds: ["k-1"] };
    expect(await plan({ ...props }, { ...props })).toBeUndefined();
  });

  it("honours replaceOnBootstrapChange: false for bootstrap inputs only", async () => {
    expect(
      await plan(
        { ...BASE, replaceOnBootstrapChange: false, userData: "b" },
        { ...BASE, replaceOnBootstrapChange: false, userData: "a" },
      ),
    ).toBeUndefined();
    // Identity inputs still replace — Vultr cannot move a VM between regions.
    expect(
      await plan(
        { ...BASE, replaceOnBootstrapChange: false, region: "lax" },
        { ...BASE, replaceOnBootstrapChange: false, region: "ewr" },
      ),
    ).toEqual({ action: "replace" });
  });
});

describe("Instance reconcile — create-only inputs are never silently converged", () => {
  it("fails instead of PATCHing user_data onto a running VM", async () => {
    const { api, run } = reconcile({ ...BASE, userData: "b" }, { ...BASE, userData: "a" });
    const error = await run.then(
      () => undefined,
      (cause) => cause,
    );
    expect(String(error)).toContain("userData");
    expect(api.calls("PATCH")).toHaveLength(0);
  });

  it("reports the failure as a typed VultrCreateOnlyChange", async () => {
    const api = fakeVultrApi(() => ({ status: 200, body: { instance: LIVE_INSTANCE } }));
    const error = await Effect.runPromise(
      (instanceLifecycle.reconcile as any)({
        id: "App",
        fqn: "App",
        instanceId: "gen-1",
        news: { ...BASE, scriptId: "s-2", sshKeyIds: ["k-2"] },
        olds: { ...BASE, scriptId: "s-1", sshKeyIds: ["k-1"] },
        output: { id: "vm-1" },
        session: {},
        bindings: [],
      }).pipe(Effect.provide(api.layer), Effect.flip),
    );
    expect(error).toBeInstanceOf(VultrCreateOnlyChange);
    expect((error as VultrCreateOnlyChange).props).toEqual(["sshKeyIds", "scriptId"]);
    expect((error as VultrCreateOnlyChange).id).toBe("vm-1");
  });

  it("updates mutable inputs in place and never sends create-only fields", async () => {
    const { api, run } = reconcile(
      { ...BASE, label: "renamed", userData: "a" },
      { ...BASE, label: "app", userData: "a" },
    );
    await run;
    const patches = api.calls("PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body.label).toBe("renamed");
    expect(patches[0]?.body).not.toHaveProperty("user_data");
    expect(patches[0]?.body).not.toHaveProperty("user_scheme");
  });

  it("warns instead of failing when replaceOnBootstrapChange is disabled", async () => {
    const { api, run } = reconcile(
      { ...BASE, replaceOnBootstrapChange: false, userData: "b", label: "renamed" },
      { ...BASE, replaceOnBootstrapChange: false, userData: "a", label: "app" },
    );
    const attributes = (await run) as { id: string };
    expect(attributes.id).toBe("vm-1");
    expect(api.calls("PATCH")[0]?.body.label).toBe("renamed");
  });
});
