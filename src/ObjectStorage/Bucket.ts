import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import {
  compact,
  resourceId,
  type JsonObject,
} from "../internal/defineResource.ts";
import { listAcrossParents } from "../internal/listAcross.ts";
import type { Providers } from "../Providers.ts";

export interface ObjectStorageBucketProps {
  objectStorage: string | { readonly id: string };
  name: string;
}

export type Bucket = Resource<
  "Vultr.ObjectStorage.Bucket",
  ObjectStorageBucketProps,
  {
    id: string;
    objectStorageId: string;
    name: string;
  },
  never,
  Providers
>;

/**
 * A bucket inside a Vultr Object Storage subscription.
 * @resource
 */
export const Bucket = Resource<Bucket>("Vultr.ObjectStorage.Bucket", {
  aliases: ["Vultr.ObjectStorageBucket"],
});

const readBucket = (objectStorageId: string, name: string) =>
  Effect.gen(function* () {
    const client = yield* yield* VultrClient;
    const response = yield* catchNotFound(
      client.get<JsonObject>(
        `/object-storage/${objectStorageId}/buckets/${name}`,
      ),
    );
    if (!response) {
      // Some Vultr plans only expose list; fall back to list+match.
      const listed = yield* catchNotFound(
        client.get<{ buckets?: JsonObject[] }>(
          `/object-storage/${objectStorageId}/buckets`,
        ),
      );
      const match = listed?.buckets?.find(
        (bucket) => String(bucket.name ?? "") === name,
      );
      if (!match) return undefined;
    }
    return {
      id: `${objectStorageId}:${name}`,
      objectStorageId,
      name,
    };
  });

export const BucketProvider = () =>
  Provider.succeed(
    Bucket,
    Bucket.Provider.of({
      stables: ["id"],
      list: () =>
        listAcrossParents({
          parentPath: "/object-storage",
          parentKey: "object_storages",
          childPath: (objectStorageId) =>
            `/object-storage/${objectStorageId}/buckets`,
          childKey: "buckets",
          map: (live, objectStorageId) => {
            const name = String(live.name ?? "");
            return {
              id: `${objectStorageId}:${name}`,
              objectStorageId,
              name,
            };
          },
        }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          resourceId(news.objectStorage) !== resourceId(olds.objectStorage) ||
          news.name !== olds.name
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.name || !output.objectStorageId) return undefined;
        return yield* readBucket(output.objectStorageId, output.name);
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const objectStorageId = resourceId(news.objectStorage);

        // Observe → ensure → sync (existence-only).
        let observed = output?.name
          ? yield* readBucket(objectStorageId, output.name)
          : undefined;
        if (!observed || observed.name !== news.name) {
          observed = yield* readBucket(objectStorageId, news.name);
        }
        if (!observed) {
          const client = yield* yield* VultrClient;
          yield* client
            .post<JsonObject>(`/object-storage/${objectStorageId}/buckets`, {
              body: compact({ name: news.name }),
            })
            .pipe(
              Effect.catchTag("VultrConflict", () => Effect.void),
            );
          observed = {
            id: `${objectStorageId}:${news.name}`,
            objectStorageId,
            name: news.name,
          };
        }
        return observed;
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.name || !output.objectStorageId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(
            `/object-storage/${output.objectStorageId}/buckets/${output.name}`,
          ),
        );
      }),
    }),
  );
