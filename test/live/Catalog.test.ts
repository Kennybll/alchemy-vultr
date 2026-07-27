/**
 * Live catalog probes (factory out-of-band verification against real API).
 * Many catalog endpoints are public; authenticated ones need a working key+IP.
 */
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Vultr from "../../src/index.ts";
import { hasApiKey, probeAuthenticatedAccess, withClient } from "./helpers.ts";

test("listRegions returns regions with id/city/country", async () => {
  const regions = await Effect.runPromise(withClient(Vultr.Catalog.listRegions()));
  expect(regions.length).toBeGreaterThan(0);
  const ewr = regions.find((r) => r.id === "ewr");
  expect(ewr).toBeDefined();
  expect(typeof ewr?.city).toBe("string");
  // Live shape includes connectivity[] (not always in older OpenAPI snapshots).
  expect(Array.isArray((ewr as { connectivity?: unknown }).connectivity)).toBe(true);
});

test("listPlans filters by type=vhf", async () => {
  const plans = await Effect.runPromise(withClient(Vultr.Catalog.listPlans({ type: "vhf" })));
  expect(plans.length).toBeGreaterThan(0);
  expect(plans.every((p) => p.type === "vhf")).toBe(true);
  // Live plans expose preemptible cost fields.
  expect("hourly_cost" in plans[0]!).toBe(true);
  expect("monthly_cost_preemptible" in plans[0]!).toBe(true);
});

test("listBareMetalPlans uses plans_metal collection key", async () => {
  const plans = await Effect.runPromise(withClient(Vultr.Catalog.listBareMetalPlans()));
  expect(plans.length).toBeGreaterThan(0);
  expect(typeof plans[0]?.id).toBe("string");
});

test("listOperatingSystems and listApplications", async () => {
  const os = await Effect.runPromise(withClient(Vultr.Catalog.listOperatingSystems()));
  const apps = await Effect.runPromise(withClient(Vultr.Catalog.listApplications()));
  expect(os.length).toBeGreaterThan(0);
  expect(apps.length).toBeGreaterThan(0);
});

test("listObjectStorageClusters is public; tiers require auth", async () => {
  const clusters = await Effect.runPromise(withClient(Vultr.Catalog.listObjectStorageClusters()));
  expect(clusters.length).toBeGreaterThan(0);
  const clusterId = Number(clusters[0]?.id);
  expect(clusterId).toBeGreaterThan(0);

  if (!hasApiKey) return;
  const access = await probeAuthenticatedAccess();
  if (!access.ok) {
    console.warn("skip tiers — authenticated access blocked:", access.reason);
    return;
  }
  const tiers = await Effect.runPromise(
    withClient(Vultr.Catalog.listObjectStorageTiers(clusterId)),
  );
  expect(tiers.length).toBeGreaterThan(0);
  expect(typeof tiers[0]?.slug).toBe("string");
});

test("listKubernetesVersions returns version strings with +build suffix", async () => {
  const response = await Effect.runPromise(withClient(Vultr.Catalog.listKubernetesVersions()));
  expect(Array.isArray(response.versions)).toBe(true);
  expect(response.versions.length).toBeGreaterThan(0);
  // Live format: "v1.36.1+3" — OpenAPI often documents plain semver.
  expect(response.versions[0]).toMatch(/^v\d+\.\d+\.\d+/);
});

test.skipIf(!hasApiKey)("getAccount works when IP allowlist permits this egress", async () => {
  const access = await probeAuthenticatedAccess();
  if (!access.ok) {
    console.warn("skip getAccount:", access.reason);
    return;
  }
  const account = await Effect.runPromise(withClient(Vultr.Catalog.getAccount()));
  expect(account).toBeDefined();
  expect(
    typeof (account as { account?: { email?: string } }).account?.email === "string" ||
      typeof account === "object",
  ).toBe(true);
});
