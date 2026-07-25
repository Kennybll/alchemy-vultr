import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface OrganizationRoleTrustProps {
  roleId: string;
  trustedEntity: string;
  externalId?: string;
}

export type OrganizationRoleTrustAttributes = {
  id: string;
  roleId: string;
  trustedEntity: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Organization.RoleTrust",
  OrganizationRoleTrustProps,
  OrganizationRoleTrustAttributes
>({
  type: "Vultr.Organization.RoleTrust",
  aliases: ["Vultr.OrganizationRoleTrust"],
  stables: ["id"],
  idAttribute: "id",
  listPath: "/role-trusts",
  listKey: "role_trusts",
  wrapKey: "role_trust",
  getPath: (id) => `/role-trusts/${id}`,
  replaceOnChange: ["roleId", "trustedEntity"],
  toCreateBody: (props) =>
    compact({
      role_id: props.roleId,
      trusted_entity: props.trustedEntity,
      external_id: props.externalId,
    }),
  toUpdateBody: (props, live) =>
    pickChanged({ external_id: props.externalId }, live, ["external_id"]),
  toAttributes: (live, props) => ({
    id: String(live.id ?? ""),
    roleId: String(live.role_id ?? props.roleId),
    trustedEntity: String(live.trusted_entity ?? props.trustedEntity),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A Vultr IAM role trust policy. @resource */
export const RoleTrust = defined.Resource;
export const RoleTrustProvider = defined.Provider;
