import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { resourceId, type JsonObject } from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface InstanceIpv4Props {
  instance: string | { readonly id: string };
  /** Whether to reboot after attaching the address. */
  reboot?: boolean;
}

export type InstanceIpv4 = Resource<
  "Vultr.InstanceIpv4",
  InstanceIpv4Props,
  {
    id: string;
    instanceId: string;
    ip: string;
    netmask: string;
    gateway: string;
    type: string;
  },
  never,
  Providers
>;

/**
 * An additional IPv4 address on a Vultr instance.
 * @resource
 */
export const InstanceIpv4 = Resource<InstanceIpv4>("Vultr.InstanceIpv4");

export const InstanceIpv4Provider = () =>
  Provider.succeed(
    InstanceIpv4,
    InstanceIpv4.Provider.of({
      stables: ["id", "ip"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (resourceId(news.instance) !== resourceId(olds.instance)) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.ip || !output.instanceId) return undefined;
        const client = yield* yield* VultrClient;
        const items = yield* client.listAll<JsonObject>(
          `/instances/${output.instanceId}/ipv4`,
          "ipv4s",
        );
        const live = items.find((item) => item.ip === output.ip);
        if (!live) return undefined;
        return {
          id: String(live.ip ?? ""),
          instanceId: output.instanceId,
          ip: String(live.ip ?? ""),
          netmask: String(live.netmask ?? ""),
          gateway: String(live.gateway ?? ""),
          type: String(live.type ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const instanceId = resourceId(news.instance);

        if (output?.ip) {
          const items = yield* client.listAll<JsonObject>(
            `/instances/${instanceId}/ipv4`,
            "ipv4s",
          );
          const existing = items.find((item) => item.ip === output.ip);
          if (existing) {
            return {
              id: String(existing.ip ?? ""),
              instanceId,
              ip: String(existing.ip ?? ""),
              netmask: String(existing.netmask ?? ""),
              gateway: String(existing.gateway ?? ""),
              type: String(existing.type ?? ""),
            };
          }
        }

        const created = yield* client.post<JsonObject>(
          `/instances/${instanceId}/ipv4`,
          { body: { reboot: news.reboot ?? true } },
        );
        const live = (created.ipv4 ?? created) as JsonObject;
        return {
          id: String(live.ip ?? ""),
          instanceId,
          ip: String(live.ip ?? ""),
          netmask: String(live.netmask ?? ""),
          gateway: String(live.gateway ?? ""),
          type: String(live.type ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.ip || !output.instanceId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(`/instances/${output.instanceId}/ipv4/${output.ip}`),
        );
      }),
    }),
  );
