import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { resourceId } from "../internal/defineResource.ts";
import { listAcrossParents } from "../internal/listAcross.ts";
import type { Providers } from "../Providers.ts";

export interface ReverseIpv6Props {
  instance: string | { readonly id: string };
  ip: string;
  reverse: string;
}

export type Ipv6 = Resource<
  "Vultr.ReverseDns.Ipv6",
  ReverseIpv6Props,
  { id: string; instanceId: string; ip: string; reverse: string },
  never,
  Providers
>;

/** Reverse DNS for an instance IPv6 address. @resource */
export const Ipv6 = Resource<Ipv6>("Vultr.ReverseDns.Ipv6", {
  aliases: ["Vultr.ReverseIpv6"],
});

export const Ipv6Provider = () =>
  Provider.succeed(
    Ipv6,
    Ipv6.Provider.of({
      stables: ["id"],
      list: () =>
        listAcrossParents({
          parentPath: "/instances",
          parentKey: "instances",
          childPath: (instanceId) => `/instances/${instanceId}/ipv6/reverse`,
          childKey: "reverse_ipv6s",
          map: (live, instanceId) => ({
            id: `${instanceId}:${String(live.ip ?? "")}`,
            instanceId,
            ip: String(live.ip ?? ""),
            reverse: String(live.reverse ?? ""),
          }),
        }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (resourceId(news.instance) !== resourceId(olds.instance) || news.ip !== olds.ip) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.ip || !output.instanceId) return undefined;
        const client = yield* yield* VultrClient;
        const items = yield* catchNotFound(
          client.get<{
            reverse_ipv6s?: Array<{ ip: string; reverse: string }>;
          }>(`/instances/${output.instanceId}/ipv6/reverse`),
        );
        const live = (items?.reverse_ipv6s ?? []).find((item) => item.ip === output.ip);
        if (!live) return undefined;
        return {
          id: `${output.instanceId}:${live.ip}`,
          instanceId: output.instanceId,
          ip: live.ip,
          reverse: live.reverse,
        };
      }),
      reconcile: Effect.fn(function* ({ news }) {
        const client = yield* yield* VultrClient;
        const instanceId = resourceId(news.instance);
        yield* client.post(`/instances/${instanceId}/ipv6/reverse`, {
          body: { ip: news.ip, reverse: news.reverse },
        });
        return {
          id: `${instanceId}:${news.ip}`,
          instanceId,
          ip: news.ip,
          reverse: news.reverse,
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(`/instances/${output.instanceId}/ipv6/reverse/${output.ip}`),
        );
      }),
    }),
  );
