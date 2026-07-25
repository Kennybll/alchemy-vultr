import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface OidcIssuerProps {
  name: string;
}

export type OidcIssuerAttributes = {
  id: string;
  issuerUrl: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Oidc.Issuer",
  OidcIssuerProps,
  OidcIssuerAttributes
>({
  type: "Vultr.Oidc.Issuer",
  aliases: ["Vultr.OidcIssuer"],
  description: "A Vultr OIDC issuer.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/oidc/issuers",
  listKey: "issuers",
  wrapKey: "issuer",
  getPath: (id) => `/oidc/issuers/${id}`,
  
  
  
  replaceOnChange: [],
  toCreateBody: (props) =>
    compact({
    name: props.name,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
      name: props.name,
      },
      live,
      ["name"],
    ),
  toAttributes: (live, props) => ({
    id: live.id as string,
    issuerUrl: live.issuer_url as string,
    dateCreated: live.date_created as string,
  }),
});

/**
 * A Vultr OIDC issuer.
 * @resource
 */
export const Issuer = defined.Resource;
export const IssuerProvider = defined.Provider;
