import {
  compact,
  defineCrudResource,
} from "../internal/defineResource.ts";

export interface OidcTokenProps {
  issuerId: string;
  name: string;
  ttl?: number;
}

export type OidcTokenAttributes = {
  id: string;
  issuerId: string;
  name: string;
  token: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.OidcToken",
  OidcTokenProps,
  OidcTokenAttributes
>({
  type: "Vultr.OidcToken",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/oidc/tokens",
  listKey: "tokens",
  wrapKey: "token",
  getPath: (id) => `/oidc/tokens/${id}`,
  immutable: true,
  replaceOnChange: ["issuerId", "name"],
  toCreateBody: (props) =>
    compact({
      issuer_id: props.issuerId,
      name: props.name,
      ttl: props.ttl,
    }),
  toAttributes: (live, props) => ({
    id: String(live.id ?? ""),
    issuerId: String(live.issuer_id ?? props.issuerId),
    name: String(live.name ?? props.name),
    token: String(live.token ?? ""),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A Vultr OIDC token. @resource */
export const OidcToken = defined.Resource;
export const OidcTokenProvider = defined.Provider;
