import * as Effect from "effect/Effect";
import { VultrClient } from "../internal/Client.ts";
import type { JsonObject } from "../internal/defineResource.ts";

/**
 * Read-only Vultr catalog helpers (plans, regions, OS images, apps).
 * These are not Stack resources — they are Effectful lookups for use in
 * stacks and application code.
 */
export const listRegions = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>("/regions", "regions");
  });

export const listPlans = (options?: { type?: string }) =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>("/plans", "plans", {
      query: { type: options?.type },
    });
  });

export const listBareMetalPlans = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>(
      "/plans-metal",
      "plans_metal",
    );
  });

export const listOperatingSystems = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>("/os", "os");
  });

export const listApplications = (options?: { type?: string }) =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>("/applications", "applications", {
      query: { type: options?.type },
    });
  });

export const listObjectStorageClusters = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>(
      "/object-storage/clusters",
      "clusters",
    );
  });

export const listObjectStorageTiers = (clusterId: number) =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>(
      `/object-storage/tiers`,
      "tiers",
      { query: { cluster_id: clusterId } },
    );
  });

export const listKubernetesVersions = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.get<{ versions: string[] }>(
      "/kubernetes/versions",
    );
  });

export const getAccount = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.get<JsonObject>("/account");
  });

export const listBackups = () =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    return yield* client.listAll<JsonObject>("/backups", "backups");
  });
