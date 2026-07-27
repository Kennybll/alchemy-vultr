import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { type JsonObject, resourceId } from "../internal/defineResource.ts";
import { listAcrossParents } from "../internal/listAcross.ts";
import type { Providers } from "../Providers.ts";

export interface ReverseIpv4Props {
  instance: string | { readonly id: string };
  ip: string;
  reverse: string;
}

export type Ipv4 = Resource<
  "Vultr.ReverseDns.Ipv4",
  ReverseIpv4Props,
  { id: string; instanceId: string; ip: string; reverse: string },
  never,
  Providers
>;

/**
 * Reverse DNS for an instance IPv4 address.
 *
 * Delete resets the PTR to Vultr's default (singleton-style config), so nuke
 * treats this as `nuke.singleton`.
 *
 * @resource
 */
export const Ipv4 = Resource<Ipv4>("Vultr.ReverseDns.Ipv4", {
  aliases: ["Vultr.ReverseIpv4"],
});

export const Ipv4Provider = () =>
  Provider.succeed(
    Ipv4,
    Ipv4.Provider.of({
      stables: ["id"],
      nuke: { singleton: true },
      list: () =>
        listAcrossParents({
          parentPath: "/instances",
          parentKey: "instances",
          childPath: (instanceId) => `/instances/${instanceId}/ipv4`,
          childKey: "ipv4s",
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
          client.listAll<JsonObject>(`/instances/${output.instanceId}/ipv4`, "ipv4s"),
        );
        if (!items) return undefined;
        const live = items.find((item) => item.ip === output.ip);
        if (!live) return undefined;
        return {
          id: `${output.instanceId}:${String(live.ip ?? "")}`,
          instanceId: output.instanceId,
          ip: String(live.ip ?? ""),
          reverse: String(live.reverse ?? ""),
        };
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
        // Reset to Vultr default PTR — treat not-found as already reset.
        yield* catchNotFound(
          client.post(`/instances/${output.instanceId}/ipv4/reverse/default`, {
            body: { ip: output.ip },
          }),
        );
      }),
    }),
  );
