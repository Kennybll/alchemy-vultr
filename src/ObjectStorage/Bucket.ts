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

export const BucketProvider = () =>
  Provider.succeed(
    Bucket,
    Bucket.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
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
        return output;
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const objectStorageId = resourceId(news.objectStorage);
        if (output?.name === news.name) {
          return {
            id: `${objectStorageId}:${news.name}`,
            objectStorageId,
            name: news.name,
          };
        }
        yield* client.post<JsonObject>(
          `/object-storage/${objectStorageId}/buckets`,
          { body: compact({ name: news.name }) },
        );
        return {
          id: `${objectStorageId}:${news.name}`,
          objectStorageId,
          name: news.name,
        };
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
