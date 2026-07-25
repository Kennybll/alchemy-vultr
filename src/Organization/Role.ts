import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface OrganizationRoleProps {
  name: string;
  description?: string;
}

export type OrganizationRoleAttributes = {
  id: string;
  name: string;
  description: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Organization.Role",
  OrganizationRoleProps,
  OrganizationRoleAttributes
>({
  type: "Vultr.Organization.Role",
  aliases: ["Vultr.OrganizationRole"],
  stables: ["id"],
  idAttribute: "id",
  listPath: "/roles",
  listKey: "roles",
  wrapKey: "role",
  getPath: (id) => `/roles/${id}`,
  toCreateBody: (props) =>
    compact({
      name: props.name,
      description: props.description,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        name: props.name,
        description: props.description,
      },
      live,
      ["name", "description"],
    ),
  toAttributes: (live) => ({
    id: String(live.id ?? ""),
    name: String(live.name ?? ""),
    description: String(live.description ?? ""),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A Vultr IAM role. @resource */
export const Role = defined.Resource;
export const RoleProvider = defined.Provider;
