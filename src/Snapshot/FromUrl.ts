import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { compact, type JsonObject } from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface SnapshotFromUrlProps {
  url: string;
  description?: string;
}

export type FromUrl = Resource<
  "Vultr.Snapshot.FromUrl",
  SnapshotFromUrlProps,
  {
    id: string;
    description: string;
    status: string;
    size: number;
    dateCreated: string;
  },
  never,
  Providers
>;

/**
 * A Vultr snapshot created from a remote URL.
 * @resource
 */
export const FromUrl = Resource<FromUrl>("Vultr.Snapshot.FromUrl", {
  aliases: ["Vultr.SnapshotFromUrl"],
});

export const FromUrlProvider = () =>
  Provider.succeed(
    FromUrl,
    FromUrl.Provider.of({
      stables: ["id"],
      list: Effect.fn(function* () {
        const client = yield* yield* VultrClient;
        const items = yield* client.listAll<JsonObject>(
          "/snapshots",
          "snapshots",
        );
        return items.map((live) => ({
          id: String(live.id ?? ""),
          description: String(live.description ?? ""),
          status: String(live.status ?? ""),
          size: Number(live.size ?? 0),
          dateCreated: String(live.date_created ?? ""),
        }));
      }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (news.url !== olds.url) return { action: "replace" as const };
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(`/snapshots/${output.id}`),
        );
        if (!response) return undefined;
        const live = (response.snapshot ?? response) as JsonObject;
        return {
          id: String(live.id ?? ""),
          description: String(live.description ?? ""),
          status: String(live.status ?? ""),
          size: Number(live.size ?? 0),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        if (output?.id) {
          const existing = yield* catchNotFound(
            client.get<JsonObject>(`/snapshots/${output.id}`),
          );
          if (existing) {
            const live = (existing.snapshot ?? existing) as JsonObject;
            return {
              id: String(live.id ?? output.id),
              description: String(live.description ?? news.description ?? ""),
              status: String(live.status ?? ""),
              size: Number(live.size ?? 0),
              dateCreated: String(live.date_created ?? ""),
            };
          }
        }
        const created = yield* client.post<JsonObject>(
          "/snapshots/create-from-url",
          {
            body: compact({
              url: news.url,
              description: news.description,
            }),
          },
        );
        const live = (created.snapshot ?? created) as JsonObject;
        return {
          id: String(live.id ?? ""),
          description: String(live.description ?? news.description ?? ""),
          status: String(live.status ?? ""),
          size: Number(live.size ?? 0),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(client.del(`/snapshots/${output.id}`));
      }),
    }),
  );
