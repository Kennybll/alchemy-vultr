import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface OrganizationGroupProps {
  name: string;
  description?: string;
}

export type OrganizationGroupAttributes = {
  id: string;
  name: string;
  description: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Organization.Group",
  OrganizationGroupProps,
  OrganizationGroupAttributes
>({
  type: "Vultr.Organization.Group",
  aliases: ["Vultr.OrganizationGroup"],
  stables: ["id"],
  idAttribute: "id",
  listPath: "/groups",
  listKey: "groups",
  wrapKey: "group",
  getPath: (id) => `/groups/${id}`,
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

/** A Vultr IAM group. @resource */
export const Group = defined.Resource;
export const GroupProvider = defined.Provider;
