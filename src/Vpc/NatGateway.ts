import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface NatGatewayProps {
  vpc: string | { readonly id: string };
  label?: string;
}

export type NatGatewayAttributes = {
  id: string;
  vpcId: string;
  label: string;
  status: string;
  dateCreated: string;
};

const defined = defineNestedCrudResource<
  "Vultr.Vpc.NatGateway",
  NatGatewayProps,
  NatGatewayAttributes
>({
  type: "Vultr.Vpc.NatGateway",
  aliases: ["Vultr.NatGateway"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "vpcId",
  wrapKey: "nat_gateway",
  listKey: "nat_gateways",
  parentList: { path: "/vpcs", key: "vpcs" },
  resolveParentId: (props) => resourceId(props.vpc),
  listPath: (vpcId) => `/vpcs/${vpcId}/nat-gateways`,
  getPath: (vpcId, id) => `/vpcs/${vpcId}/nat-gateways/${id}`,
  toCreateBody: (props) => compact({ label: props.label }),
  toUpdateBody: (props, live) =>
    pickChanged({ label: props.label }, live, ["label"]),
  toAttributes: (live, vpcId, props) => ({
    id: String(live.id ?? ""),
    vpcId,
    label: String(live.label ?? props.label ?? ""),
    status: String(live.status ?? ""),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A NAT Gateway attached to a Vultr VPC. @resource */
export const NatGateway = defined.Resource;
export const NatGatewayProvider = defined.Provider;
