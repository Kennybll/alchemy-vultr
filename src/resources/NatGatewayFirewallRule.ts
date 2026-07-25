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

export interface NatGatewayFirewallRuleProps {
  vpc: string | { readonly id: string };
  natGateway: string | { readonly id: string };
  ipType: "v4" | "v6";
  protocol: "icmp" | "tcp" | "udp" | "gre" | "esp" | "ah";
  subnet: string;
  subnetSize: number;
  port?: string;
  notes?: string;
}

export type NatGatewayFirewallRule = Resource<
  "Vultr.NatGatewayFirewallRule",
  NatGatewayFirewallRuleProps,
  { id: string; vpcId: string; natGatewayId: string },
  never,
  Providers
>;

/** A firewall rule on a Vultr NAT Gateway. @resource */
export const NatGatewayFirewallRule = Resource<NatGatewayFirewallRule>(
  "Vultr.NatGatewayFirewallRule",
);

export const NatGatewayFirewallRuleProvider = () =>
  Provider.succeed(
    NatGatewayFirewallRule,
    NatGatewayFirewallRule.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          resourceId(news.vpc) !== resourceId(olds.vpc) ||
          resourceId(news.natGateway) !== resourceId(olds.natGateway) ||
          news.ipType !== olds.ipType ||
          news.protocol !== olds.protocol ||
          news.subnet !== olds.subnet ||
          news.subnetSize !== olds.subnetSize ||
          news.port !== olds.port
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id || !output.vpcId || !output.natGatewayId) {
          return undefined;
        }
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(
            `/vpcs/${output.vpcId}/nat-gateways/${output.natGatewayId}/firewall-rules/${output.id}`,
          ),
        );
        if (!response) return undefined;
        const live = (response.firewall_rule ?? response) as JsonObject;
        return {
          id: String(live.id ?? output.id),
          vpcId: output.vpcId,
          natGatewayId: output.natGatewayId,
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const vpcId = resourceId(news.vpc);
        const natGatewayId = resourceId(news.natGateway);
        if (output?.id) {
          const existing = yield* catchNotFound(
            client.get<JsonObject>(
              `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/firewall-rules/${output.id}`,
            ),
          );
          if (existing) {
            return { id: output.id, vpcId, natGatewayId };
          }
        }
        const created = yield* client.post<JsonObject>(
          `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/firewall-rules`,
          {
            body: compact({
              ip_type: news.ipType,
              protocol: news.protocol,
              subnet: news.subnet,
              subnet_size: news.subnetSize,
              port: news.port,
              notes: news.notes,
            }),
          },
        );
        const live = (created.firewall_rule ?? created) as JsonObject;
        return { id: String(live.id ?? ""), vpcId, natGatewayId };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id || !output.vpcId || !output.natGatewayId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(
            `/vpcs/${output.vpcId}/nat-gateways/${output.natGatewayId}/firewall-rules/${output.id}`,
          ),
        );
      }),
    }),
  );
