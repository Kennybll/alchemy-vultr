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

export interface FirewallRuleProps {
  /** Firewall group id or a resource exposing `{ id }`. */
  firewallGroup: string | { readonly id: string };
  ipType: "v4" | "v6";
  protocol: "icmp" | "tcp" | "udp" | "gre" | "esp" | "ah";
  /** Source subnet, e.g. `0.0.0.0/0`. */
  subnet: string;
  subnetSize: number;
  port?: string;
  source?: string;
  notes?: string;
}

export type FirewallRule = Resource<
  "Vultr.FirewallRule",
  FirewallRuleProps,
  {
    id: string;
    firewallGroupId: string;
    action: string;
    port: string;
    notes: string;
  },
  never,
  Providers
>;

/**
 * A rule inside a Vultr {@link FirewallGroup}.
 * @resource
 */
export const FirewallRule = Resource<FirewallRule>("Vultr.FirewallRule");

export const FirewallRuleProvider = () =>
  Provider.succeed(
    FirewallRule,
    FirewallRule.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        const groupChanged =
          resourceId(news.firewallGroup) !== resourceId(olds.firewallGroup);
        if (
          groupChanged ||
          news.ipType !== olds.ipType ||
          news.protocol !== olds.protocol ||
          news.subnet !== olds.subnet ||
          news.subnetSize !== olds.subnetSize ||
          news.port !== olds.port ||
          news.source !== olds.source
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id || !output.firewallGroupId) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(
            `/firewalls/${output.firewallGroupId}/rules/${output.id}`,
          ),
        );
        if (!response) return undefined;
        const live = (response.firewall_rule ?? response) as JsonObject;
        return {
          id: String(live.id ?? output.id),
          firewallGroupId: output.firewallGroupId,
          action: String(live.action ?? ""),
          port: String(live.port ?? ""),
          notes: String(live.notes ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const groupId = resourceId(news.firewallGroup);

        if (output?.id) {
          const existing = yield* catchNotFound(
            client.get<JsonObject>(
              `/firewalls/${groupId}/rules/${output.id}`,
            ),
          );
          if (existing) {
            const live = (existing.firewall_rule ?? existing) as JsonObject;
            return {
              id: String(live.id ?? output.id),
              firewallGroupId: groupId,
              action: String(live.action ?? ""),
              port: String(live.port ?? ""),
              notes: String(live.notes ?? news.notes ?? ""),
            };
          }
        }

        const created = yield* client.post<JsonObject>(
          `/firewalls/${groupId}/rules`,
          {
            body: compact({
              ip_type: news.ipType,
              protocol: news.protocol,
              subnet: news.subnet,
              subnet_size: news.subnetSize,
              port: news.port,
              source: news.source,
              notes: news.notes,
            }),
          },
        );
        const live = (created.firewall_rule ?? created) as JsonObject;
        return {
          id: String(live.id ?? ""),
          firewallGroupId: groupId,
          action: String(live.action ?? ""),
          port: String(live.port ?? news.port ?? ""),
          notes: String(live.notes ?? news.notes ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id || !output.firewallGroupId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(
            `/firewalls/${output.firewallGroupId}/rules/${output.id}`,
          ),
        );
      }),
    }),
  );
