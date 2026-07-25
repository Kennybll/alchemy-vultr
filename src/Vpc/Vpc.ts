import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface VpcProps {
  region: string;
  description?: string;
  v4Subnet?: string;
  v4SubnetMask?: number;
}

export type VpcAttributes = {
  id: string;
  dateCreated: string;
};

const defined = defineCrudResource<"Vultr.Vpc.Vpc", VpcProps, VpcAttributes>({
  type: "Vultr.Vpc.Vpc",
  aliases: ["Vultr.Vpc"],
  description: "A Vultr VPC network.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/vpcs",
  listKey: "vpcs",
  wrapKey: "vpc",
  getPath: (id) => `/vpcs/${id}`,
  // Live API: PATCH → 405; only DELETE, GET, PUT are allowed.
  updateMethod: "PUT",
  replaceOnChange: ["region", "v4Subnet", "v4SubnetMask"],
  toCreateBody: (props) =>
    compact({
      region: props.region,
      description: props.description,
      v4_subnet: props.v4Subnet,
      v4_subnet_mask: props.v4SubnetMask,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        description: props.description,
      },
      live,
      ["description"],
    ),
  toAttributes: (live, _props) => ({
    id: live.id as string,
    dateCreated: live.date_created as string,
  }),
});

/**
 * A Vultr VPC network.
 * @resource
 */
export const Vpc = defined.Resource;
export const VpcProvider = defined.Provider;
