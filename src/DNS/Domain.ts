import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface DnsDomainProps {
  domain: string;
  /** Optional IP used to seed default records on create. */
  ip?: string;
  dnsSec?: "enabled" | "disabled";
}

export type DnsDomainAttributes = {
  domain: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.DNS.Domain",
  DnsDomainProps,
  DnsDomainAttributes
>({
  type: "Vultr.DNS.Domain",
  aliases: ["Vultr.DnsDomain"],
  description: "A DNS domain hosted on Vultr.",
  stables: ["domain"],
  idAttribute: "domain",
  listPath: "/domains",
  listKey: "domains",
  wrapKey: "domain",
  getPath: (id) => `/domains/${id}`,
  
  
  
  replaceOnChange: ["domain"],
  toCreateBody: (props) =>
    compact({
    domain: props.domain,
    ip: props.ip,
    dns_sec: props.dnsSec,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
      dns_sec: props.dnsSec,
      },
      live,
      ["dns_sec"],
    ),
  toAttributes: (live, props) => ({
    domain: String(live.domain ?? props.domain ?? ""),
    dateCreated: live.date_created as string,
  }),
});

/**
 * A DNS domain hosted on Vultr.
 * @resource
 */
export const Domain = defined.Resource;
export const DomainProvider = defined.Provider;
