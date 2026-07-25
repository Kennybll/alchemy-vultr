import type * as Duration from "effect/Duration";
import * as Redacted from "effect/Redacted";
import {
  compact,
  defineCrudResource,
} from "../internal/defineResource.ts";
import { toWireSeconds } from "../internal/duration.ts";
import { redact } from "../internal/redacted.ts";

export interface OidcTokenProps {
  issuerId: string;
  name: string;
  /** Token lifetime. Accepts `"1 hour"`, `Duration.hours(1)`, or seconds. */
  ttl?: Duration.Input | number;
}

export type OidcTokenAttributes = {
  id: string;
  issuerId: string;
  name: string;
  token: Redacted.Redacted<string>;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Oidc.Token",
  OidcTokenProps,
  OidcTokenAttributes
>({
  type: "Vultr.Oidc.Token",
  aliases: ["Vultr.OidcToken"],
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
      ttl:
        typeof props.ttl === "number" ? props.ttl : toWireSeconds(props.ttl),
    }),
  toAttributes: (live, props) => ({
    id: String(live.id ?? ""),
    issuerId: String(live.issuer_id ?? props.issuerId),
    name: String(live.name ?? props.name),
    token: redact(live.token),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/**
 * A Vultr OIDC token.
 * @resource
 */
export const Token = defined.Resource;
export const TokenProvider = defined.Provider;
