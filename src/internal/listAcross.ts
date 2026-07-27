import * as Effect from "effect/Effect";
import { VultrClient, type VultrClientError } from "./Client.ts";
import type { JsonObject } from "./defineResource.ts";

/** Parallel fan-out for nuke lists; keep modest to avoid 429 storms. */
const FANOUT_CONCURRENCY = 8;

/**
 * Exhaustively list child resources across every parent — powers `list` for
 * nuke ([Providers › list](https://alchemy.run/infrastructure-as-code/provider#list)).
 */
export const listAcrossParents = <A>(options: {
  readonly parentPath: string;
  readonly parentKey: string;
  readonly parentIdField?: string;
  readonly childPath: (parentId: string) => string;
  readonly childKey: string;
  readonly map: (item: JsonObject, parentId: string) => A;
}): Effect.Effect<A[], VultrClientError, VultrClient> =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    const parents = yield* client.listAll<JsonObject>(options.parentPath, options.parentKey);
    const idField = options.parentIdField ?? "id";
    const batches = yield* Effect.forEach(
      parents,
      (parent) =>
        Effect.gen(function* () {
          const parentId = String(parent[idField] ?? "");
          if (!parentId) return [] as A[];
          const children = yield* client.listAll<JsonObject>(
            options.childPath(parentId),
            options.childKey,
          );
          return children.map((child) => options.map(child, parentId));
        }),
      { concurrency: FANOUT_CONCURRENCY },
    );
    return batches.flat();
  });

/**
 * Two-level fan-out: grandparent → parent → child (e.g. VPC → NAT Gateway → rule).
 */
export const listAcrossGrandparents = <A>(options: {
  readonly grandparentPath: string;
  readonly grandparentKey: string;
  readonly grandparentIdField?: string;
  readonly parentPath: (grandparentId: string) => string;
  readonly parentKey: string;
  readonly parentIdField?: string;
  readonly childPath: (grandparentId: string, parentId: string) => string;
  readonly childKey: string;
  readonly map: (item: JsonObject, grandparentId: string, parentId: string) => A;
}): Effect.Effect<A[], VultrClientError, VultrClient> =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    const grandparents = yield* client.listAll<JsonObject>(
      options.grandparentPath,
      options.grandparentKey,
    );
    const gpField = options.grandparentIdField ?? "id";
    const pField = options.parentIdField ?? "id";
    const batches = yield* Effect.forEach(
      grandparents,
      (grandparent) =>
        Effect.gen(function* () {
          const grandparentId = String(grandparent[gpField] ?? "");
          if (!grandparentId) return [] as A[];
          const parents = yield* client.listAll<JsonObject>(
            options.parentPath(grandparentId),
            options.parentKey,
          );
          const childBatches = yield* Effect.forEach(
            parents,
            (parent) =>
              Effect.gen(function* () {
                const parentId = String(parent[pField] ?? "");
                if (!parentId) return [] as A[];
                const children = yield* client.listAll<JsonObject>(
                  options.childPath(grandparentId, parentId),
                  options.childKey,
                );
                return children.map((child) => options.map(child, grandparentId, parentId));
              }),
            { concurrency: FANOUT_CONCURRENCY },
          );
          return childBatches.flat();
        }),
      { concurrency: FANOUT_CONCURRENCY },
    );
    return batches.flat();
  });
