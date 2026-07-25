import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { resourceId } from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface ReverseIpv6Props {
  instance: string | { readonly id: string };
  ip: string;
  reverse: string;
}

export type ReverseIpv6 = Resource<
  "Vultr.ReverseIpv6",
  ReverseIpv6Props,
  { id: string; instanceId: string; ip: string; reverse: string },
  never,
  Providers
>;

/** Reverse DNS for an instance IPv6 address. @resource */
export const ReverseIpv6 = Resource<ReverseIpv6>("Vultr.ReverseIpv6");

export const ReverseIpv6Provider = () =>
  Provider.succeed(
    ReverseIpv6,
    ReverseIpv6.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          resourceId(news.instance) !== resourceId(olds.instance) ||
          news.ip !== olds.ip
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.ip || !output.instanceId) return undefined;
        const client = yield* yield* VultrClient;
        const items = yield* client
          .get<{ reverse_ipv6s?: Array<{ ip: string; reverse: string }> }>(
            `/instances/${output.instanceId}/ipv6/reverse`,
          )
          .pipe(Effect.catch(() => Effect.succeed({ reverse_ipv6s: [] })));
        const live = (items.reverse_ipv6s ?? []).find(
          (item) => item.ip === output.ip,
        );
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
          client.del(
            `/instances/${output.instanceId}/ipv6/reverse/${output.ip}`,
          ),
        );
      }),
    }),
  );
