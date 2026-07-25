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

export interface KubernetesNodePoolProps {
  /** VKE cluster id or resource with `{ id }`. */
  cluster: string | { readonly id: string };
  nodeQuantity: number;
  label: string;
  plan: string;
  tag?: string;
  autoScaler?: boolean;
  minNodes?: number;
  maxNodes?: number;
  labels?: ReadonlyArray<{ key: string; value: string }>;
  taints?: ReadonlyArray<{
    key: string;
    value: string;
    effect: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
  }>;
}

export type KubernetesNodePool = Resource<
  "Vultr.KubernetesNodePool",
  KubernetesNodePoolProps,
  {
    id: string;
    clusterId: string;
    label: string;
    plan: string;
    status: string;
    nodeQuantity: number;
    dateCreated: string;
  },
  never,
  Providers
>;

/**
 * A node pool on a Vultr Kubernetes cluster.
 * @resource
 */
export const KubernetesNodePool = Resource<KubernetesNodePool>(
  "Vultr.KubernetesNodePool",
);

export const KubernetesNodePoolProvider = () =>
  Provider.succeed(
    KubernetesNodePool,
    KubernetesNodePool.Provider.of({
      stables: ["id"],
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          resourceId(news.cluster) !== resourceId(olds.cluster) ||
          news.plan !== olds.plan
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id || !output.clusterId) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(
            `/kubernetes/clusters/${output.clusterId}/node-pools/${output.id}`,
          ),
        );
        if (!response) return undefined;
        const live = (response.node_pool ?? response) as JsonObject;
        return {
          id: String(live.id ?? output.id),
          clusterId: output.clusterId,
          label: String(live.label ?? ""),
          plan: String(live.plan ?? ""),
          status: String(live.status ?? ""),
          nodeQuantity: Number(live.node_quantity ?? 0),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;
        const clusterId = resourceId(news.cluster);

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(
            client.get<JsonObject>(
              `/kubernetes/clusters/${clusterId}/node-pools/${output.id}`,
            ),
          );
          if (response) {
            live = (response.node_pool ?? response) as JsonObject;
          }
        }

        if (!live) {
          const created = yield* client.post<JsonObject>(
            `/kubernetes/clusters/${clusterId}/node-pools`,
            {
              body: compact({
                node_quantity: news.nodeQuantity,
                label: news.label,
                plan: news.plan,
                tag: news.tag,
                auto_scaler: news.autoScaler,
                min_nodes: news.minNodes,
                max_nodes: news.maxNodes,
                labels: news.labels,
                taints: news.taints,
              }),
            },
          );
          live = (created.node_pool ?? created) as JsonObject;
        } else {
          const body = pickChanged(
            {
              node_quantity: news.nodeQuantity,
              label: news.label,
              tag: news.tag,
              auto_scaler: news.autoScaler,
              min_nodes: news.minNodes,
              max_nodes: news.maxNodes,
            },
            live,
            [
              "node_quantity",
              "label",
              "tag",
              "auto_scaler",
              "min_nodes",
              "max_nodes",
            ],
          );
          if (Object.keys(body).length > 0) {
            const updated = yield* client.patch<JsonObject>(
              `/kubernetes/clusters/${clusterId}/node-pools/${live.id}`,
              { body },
            );
            live = (updated?.node_pool ?? updated ?? live) as JsonObject;
          }
        }

        return {
          id: String(live.id ?? ""),
          clusterId,
          label: String(live.label ?? news.label),
          plan: String(live.plan ?? news.plan),
          status: String(live.status ?? ""),
          nodeQuantity: Number(live.node_quantity ?? news.nodeQuantity),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id || !output.clusterId) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(
          client.del(
            `/kubernetes/clusters/${output.clusterId}/node-pools/${output.id}`,
          ),
        );
      }),
    }),
  );
