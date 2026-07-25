import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface ReservedIpProps {
  region: string;
  ipType: "v4" | "v6";
  label?: string;
}

export type ReservedIpAttributes = {
  id: string;
  subnet: string;
  subnetSize: number;
  instanceId: string;
};

const defined = defineCrudResource<
  "Vultr.ReservedIp.ReservedIp",
  ReservedIpProps,
  ReservedIpAttributes
>({
  type: "Vultr.ReservedIp.ReservedIp",
  aliases: ["Vultr.ReservedIp"],
  description: "A reserved (floating) IP address.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/reserved-ips",
  listKey: "reserved_ips",
  wrapKey: "reserved_ip",
  getPath: (id) => `/reserved-ips/${id}`,
  
  
  
  replaceOnChange: ["region", "ipType"],
  toCreateBody: (props) =>
    compact({
    region: props.region,
    ip_type: props.ipType,
    label: props.label,
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
    subnet: live.subnet as string,
    subnetSize: live.subnet_size as number,
    instanceId: live.instance_id as string,
  }),
});

/**
 * A reserved (floating) IP address.
 * @resource
 */
export const ReservedIp = defined.Resource;
export const ReservedIpProvider = defined.Provider;
