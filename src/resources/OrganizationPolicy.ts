import {
  compact,
  defineCrudResource,
  pickChanged,
} from "../internal/defineResource.ts";

export interface OrganizationPolicyProps {
  name: string;
  description?: string;
  policy: string | Record<string, unknown>;
}

export type OrganizationPolicyAttributes = {
  id: string;
  name: string;
  description: string;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.OrganizationPolicy",
  OrganizationPolicyProps,
  OrganizationPolicyAttributes
>({
  type: "Vultr.OrganizationPolicy",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/policies",
  listKey: "policies",
  wrapKey: "policy",
  getPath: (id) => `/policies/${id}`,
  toCreateBody: (props) =>
    compact({
      name: props.name,
      description: props.description,
      policy:
        typeof props.policy === "string"
          ? props.policy
          : JSON.stringify(props.policy),
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        name: props.name,
        description: props.description,
        policy:
          typeof props.policy === "string"
            ? props.policy
            : JSON.stringify(props.policy),
      },
      live,
      ["name", "description", "policy"],
    ),
  toAttributes: (live) => ({
    id: String(live.id ?? ""),
    name: String(live.name ?? ""),
    description: String(live.description ?? ""),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A Vultr IAM policy. @resource */
export const OrganizationPolicy = defined.Resource;
export const OrganizationPolicyProvider = defined.Provider;
