import * as Effect from "effect/Effect";
import { VultrClient, type VultrClientError } from "./Client.ts";
import type { JsonObject } from "./defineResource.ts";

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
    const parents = yield* client.listAll<JsonObject>(
      options.parentPath,
      options.parentKey,
    );
    const idField = options.parentIdField ?? "id";
    const out: A[] = [];
    for (const parent of parents) {
      const parentId = String(parent[idField] ?? "");
      if (!parentId) continue;
      const children = yield* client.listAll<JsonObject>(
        options.childPath(parentId),
        options.childKey,
      );
      for (const child of children) {
        out.push(options.map(child, parentId));
      }
    }
    return out;
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
  readonly map: (
    item: JsonObject,
    grandparentId: string,
    parentId: string,
  ) => A;
}): Effect.Effect<A[], VultrClientError, VultrClient> =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    const grandparents = yield* client.listAll<JsonObject>(
      options.grandparentPath,
      options.grandparentKey,
    );
    const gpField = options.grandparentIdField ?? "id";
    const pField = options.parentIdField ?? "id";
    const out: A[] = [];
    for (const grandparent of grandparents) {
      const grandparentId = String(grandparent[gpField] ?? "");
      if (!grandparentId) continue;
      const parents = yield* client.listAll<JsonObject>(
        options.parentPath(grandparentId),
        options.parentKey,
      );
      for (const parent of parents) {
        const parentId = String(parent[pField] ?? "");
        if (!parentId) continue;
        const children = yield* client.listAll<JsonObject>(
          options.childPath(grandparentId, parentId),
          options.childKey,
        );
        for (const child of children) {
          out.push(options.map(child, grandparentId, parentId));
        }
      }
    }
    return out;
  });
