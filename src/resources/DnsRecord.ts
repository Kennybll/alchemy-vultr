import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import {
  compact,
  pickChanged,
  resourceId,
  type JsonObject,
} from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface DnsRecordProps {
  /** Domain name or a DnsDomain resource exposing `{ domain }`. */
  domain: string | { readonly domain: string; readonly id?: string };
  name: string;
  type: "A" | "AAAA" | "CNAME" | "NS" | "MX" | "SRV" | "TXT" | "CAA" | "SSHFP";
  data: string;
  ttl?: number;
  priority?: number;
}

export type DnsRecord = Resource<
  "Vultr.DnsRecord",
  DnsRecordProps,
  {
    id: string;
    domain: string;
    name: string;
    type: string;
    data: string;
    ttl: number;
    priority: number;
  },
  never,
  Providers
>;

/**
 * A DNS record on a Vultr {@link DnsDomain}.
 * @resource
 */
export const DnsRecord = Resource<DnsRecord>("Vultr.DnsRecord");

const domainName = (
  domain: string | { readonly domain: string; readonly id?: string },
) => (typeof domain === "string" ? domain : domain.domain);

export const DnsRecordProvider = () =>
  Provider.succeed(
    DnsRecord,
    DnsRecord.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          domainName(news.domain) !== domainName(olds.domain) ||
          news.type !== olds.type
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id || !output.domain) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(
            `/domains/${output.domain}/records/${output.id}`,
          ),
        );
        if (!response) return undefined;
        const live = (response.record ?? response) as JsonObject;
        return {
          id: String(live.id ?? output.id),
          domain: output.domain,
          name: String(live.name ?? ""),
          type: String(live.type ?? ""),
          data: String(live.data ?? ""),
          ttl: Number(live.ttl ?? 0),
          priority: Number(live.priority ?? 0),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const domain = domainName(news.domain);

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(
            client.get<JsonObject>(`/domains/${domain}/records/${output.id}`),
          );
          if (response) {
            live = (response.record ?? response) as JsonObject;
          }
        }

        if (!live) {
          const created = yield* client.post<JsonObject>(
            `/domains/${domain}/records`,
            {
              body: compact({
                name: news.name,
                type: news.type,
                data: news.data,
                ttl: news.ttl,
                priority: news.priority,
              }),
            },
          );
          live = (created.record ?? created) as JsonObject;
        } else {
          const body = pickChanged(
            {
              name: news.name,
              data: news.data,
              ttl: news.ttl,
              priority: news.priority,
            },
            live,
            ["name", "data", "ttl", "priority"],
          );
          if (Object.keys(body).length > 0) {
            yield* client.patch(`/domains/${domain}/records/${live.id}`, {
              body,
            });
            const refreshed = yield* client.get<JsonObject>(
              `/domains/${domain}/records/${live.id}`,
            );
            live = (refreshed.record ?? refreshed) as JsonObject;
          }
        }

        return {
          id: String(live.id ?? ""),
          domain,
          name: String(live.name ?? news.name),
          type: String(live.type ?? news.type),
          data: String(live.data ?? news.data),
          ttl: Number(live.ttl ?? news.ttl ?? 0),
          priority: Number(live.priority ?? news.priority ?? 0),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id || !output.domain) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(`/domains/${output.domain}/records/${output.id}`),
        );
      }),
    }),
  );
