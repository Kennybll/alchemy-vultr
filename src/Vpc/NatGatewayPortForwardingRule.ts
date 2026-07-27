import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { compact, type JsonObject, pickChanged, resourceId } from "../internal/defineResource.ts";
import { listAcrossGrandparents } from "../internal/listAcross.ts";
import type { Providers } from "../Providers.ts";

export interface NatGatewayPortForwardingRuleProps {
  vpc: string | { readonly id: string };
  natGateway: string | { readonly id: string };
  protocol: "tcp" | "udp";
  externalPort: number;
  internalIp: string;
  internalPort: number;
  name?: string;
}

export type NatGatewayPortForwardingRule = Resource<
  "Vultr.Vpc.NatGatewayPortForwardingRule",
  NatGatewayPortForwardingRuleProps,
  {
    id: string;
    vpcId: string;
    natGatewayId: string;
    name: string;
  },
  never,
  Providers
>;

/** A port-forwarding rule on a Vultr NAT Gateway. @resource */
export const NatGatewayPortForwardingRule = Resource<NatGatewayPortForwardingRule>(
  "Vultr.Vpc.NatGatewayPortForwardingRule",
  { aliases: ["Vultr.NatGatewayPortForwardingRule"] },
);

export const NatGatewayPortForwardingRuleProvider = () =>
  Provider.succeed(
    NatGatewayPortForwardingRule,
    NatGatewayPortForwardingRule.Provider.of({
      stables: ["id"],
      list: () =>
        listAcrossGrandparents({
          grandparentPath: "/vpcs",
          grandparentKey: "vpcs",
          parentPath: (vpcId) => `/vpcs/${vpcId}/nat-gateways`,
          parentKey: "nat_gateways",
          childPath: (vpcId, natGatewayId) =>
            `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/port-forwarding-rules`,
          childKey: "port_forwarding_rules",
          map: (live, vpcId, natGatewayId) => ({
            id: String(live.id ?? ""),
            vpcId,
            natGatewayId,
            name: String(live.name ?? ""),
          }),
        }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          resourceId(news.vpc) !== resourceId(olds.vpc) ||
          resourceId(news.natGateway) !== resourceId(olds.natGateway)
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
            `/vpcs/${output.vpcId}/nat-gateways/${output.natGatewayId}/port-forwarding-rules/${output.id}`,
          ),
        );
        if (!response) return undefined;
        const live = (response.port_forwarding_rule ?? response) as JsonObject;
        return {
          id: String(live.id ?? output.id),
          vpcId: output.vpcId,
          natGatewayId: output.natGatewayId,
          name: String(live.name ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const vpcId = resourceId(news.vpc);
        const natGatewayId = resourceId(news.natGateway);
        let live: JsonObject | undefined;
        if (output?.id) {
          const existing = yield* catchNotFound(
            client.get<JsonObject>(
              `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/port-forwarding-rules/${output.id}`,
            ),
          );
          if (existing) {
            live = (existing.port_forwarding_rule ?? existing) as JsonObject;
          }
        }
        const body = compact({
          name: news.name,
          protocol: news.protocol,
          external_port: news.externalPort,
          internal_ip: news.internalIp,
          internal_port: news.internalPort,
        });
        if (!live) {
          const created = yield* client.post<JsonObject>(
            `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/port-forwarding-rules`,
            { body },
          );
          live = (created.port_forwarding_rule ?? created) as JsonObject;
        } else {
          const patch = pickChanged(body, live, [
            "name",
            "protocol",
            "external_port",
            "internal_ip",
            "internal_port",
          ]);
          if (Object.keys(patch).length > 0) {
            const updated = yield* client.patch<JsonObject>(
              `/vpcs/${vpcId}/nat-gateways/${natGatewayId}/port-forwarding-rules/${live.id}`,
              { body: patch },
            );
            live = (updated?.port_forwarding_rule ?? updated ?? live) as JsonObject;
          }
        }
        return {
          id: String(live.id ?? ""),
          vpcId,
          natGatewayId,
          name: String(live.name ?? news.name ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id || !output.vpcId || !output.natGatewayId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(
            `/vpcs/${output.vpcId}/nat-gateways/${output.natGatewayId}/port-forwarding-rules/${output.id}`,
          ),
        );
      }),
    }),
  );
