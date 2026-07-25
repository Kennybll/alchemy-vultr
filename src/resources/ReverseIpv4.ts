import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { VultrClient } from "../internal/Client.ts";
import { resourceId } from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface ReverseIpv4Props {
  instance: string | { readonly id: string };
  ip: string;
  reverse: string;
}

export type ReverseIpv4 = Resource<
  "Vultr.ReverseIpv4",
  ReverseIpv4Props,
  { id: string; instanceId: string; ip: string; reverse: string },
  never,
  Providers
>;

/** Reverse DNS for an instance IPv4 address. @resource */
export const ReverseIpv4 = Resource<ReverseIpv4>("Vultr.ReverseIpv4");

export const ReverseIpv4Provider = () =>
  Provider.succeed(
    ReverseIpv4,
    ReverseIpv4.Provider.of({
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
        if (!output?.ip) return undefined;
        return output;
      }),
      reconcile: Effect.fn(function* ({ news }) {
        const client = yield* yield* VultrClient;
        const instanceId = resourceId(news.instance);
        yield* client.post(`/instances/${instanceId}/ipv4/reverse`, {
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
        yield* client.post(
          `/instances/${output.instanceId}/ipv4/reverse/default`,
          { body: { ip: output.ip } },
        ).pipe(Effect.catch(() => Effect.void));
      }),
    }),
  );
