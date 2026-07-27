import { compact, defineCrudResource } from "../internal/defineResource.ts";

export interface OrganizationInvitationProps {
  email: string;
  roleIds?: ReadonlyArray<string>;
}

export type OrganizationInvitationAttributes = {
  id: string;
  email: string;
  status: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Organization.Invitation",
  OrganizationInvitationProps,
  OrganizationInvitationAttributes
>({
  type: "Vultr.Organization.Invitation",
  aliases: ["Vultr.OrganizationInvitation"],
  stables: ["id"],
  idAttribute: "id",
  listPath: "/invitations",
  listKey: "invitations",
  wrapKey: "invitation",
  getPath: (id) => `/invitations/${id}`,
  immutable: true,
  replaceOnChange: ["email"],
  toCreateBody: (props) =>
    compact({
      email: props.email,
      role_ids: props.roleIds,
    }),
  toAttributes: (live, props) => ({
    id: String(live.id ?? ""),
    email: String(live.email ?? props.email),
    status: String(live.status ?? ""),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A Vultr organization invitation. @resource */
export const Invitation = defined.Resource;
export const InvitationProvider = defined.Provider;
