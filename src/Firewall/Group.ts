import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface FirewallGroupProps {
  description?: string;
}

export type FirewallGroupAttributes = {
  id: string;
  dateCreated: string;
  dateModified: string;
  instanceCount: number;
  ruleCount: number;
  maxRuleCount: number;
};

const defined = defineCrudResource<
  "Vultr.Firewall.Group",
  FirewallGroupProps,
  FirewallGroupAttributes
>({
  type: "Vultr.Firewall.Group",
  aliases: ["Vultr.FirewallGroup"],
  description: "A Vultr firewall group that holds firewall rules.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/firewalls",
  listKey: "firewall_groups",
  wrapKey: "firewall_group",
  getPath: (id) => `/firewalls/${id}`,
  
  
  
  replaceOnChange: [],
  toCreateBody: (props) =>
    compact({
    description: props.description,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
      description: props.description,
      },
      live,
      ["description"],
    ),
  toAttributes: (live, props) => ({
    id: live.id as string,
    dateCreated: live.date_created as string,
    dateModified: live.date_modified as string,
    instanceCount: live.instance_count as number,
    ruleCount: live.rule_count as number,
    maxRuleCount: live.max_rule_count as number,
  }),
});

/**
 * A Vultr firewall group that holds firewall rules.
 * @resource
 */
export const Group = defined.Resource;
export const GroupProvider = defined.Provider;
