import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface KubernetesProps {
  region: string;
  version: string;
  label?: string;
  haControlplanes?: boolean;
  /** Initial node pools created with the cluster. */
  nodePools?: ReadonlyArray<{ nodeQuantity: number; label: string; plan: string; autoScaler?: boolean; minNodes?: number; maxNodes?: number; tags?: ReadonlyArray<string> }>;
}

export type KubernetesAttributes = {
  id: string;
  status: string;
  dateCreated: string;
  clusterSubnet: string;
  serviceSubnet: string;
  endpoint: string;
};

const defined = defineCrudResource<
  "Vultr.Cluster.Cluster",
  KubernetesProps,
  KubernetesAttributes
>({
  type: "Vultr.Cluster.Cluster",
  aliases: ["Vultr.Kubernetes"],
  description: "A Vultr Cluster Engine (VKE) cluster.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/kubernetes/clusters",
  listKey: "vke_clusters",
  wrapKey: "vke_cluster",
  getPath: (id) => `/kubernetes/clusters/${id}`,
  
  
  
  replaceOnChange: ["region", "version", "haControlplanes"],
  toCreateBody: (props) =>
    compact({
    region: props.region,
    version: props.version,
    label: props.label,
    ha_controlplanes: props.haControlplanes,
    node_pools: props.nodePools,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
      label: props.label,
      },
      live,
      ["label"],
    ),
  toAttributes: (live, props) => ({
    id: live.id as string,
    status: live.status as string,
    dateCreated: live.date_created as string,
    clusterSubnet: live.cluster_subnet as string,
    serviceSubnet: live.service_subnet as string,
    endpoint: live.endpoint as string,
  }),
});

/**
 * A Vultr Cluster Engine (VKE) cluster.
 * @resource
 */
export const Cluster = defined.Resource;
export const ClusterProvider = defined.Provider;
