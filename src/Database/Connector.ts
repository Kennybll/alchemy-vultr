import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseConnectorProps {
  database: string | { readonly id: string };
  name: string;
  class: string;
  topics: string;
  config?: Record<string, unknown>;
}

export type DatabaseConnectorAttributes = {
  id: string;
  databaseId: string;
  name: string;
  class: string;
  topics: string;
};

const defined = defineNestedCrudResource<
  "Vultr.Database.Connector",
  DatabaseConnectorProps,
  DatabaseConnectorAttributes
>({
  type: "Vultr.Database.Connector",
  aliases: ["Vultr.DatabaseConnector"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "connector",
  listKey: "connectors",
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/connectors`,
  getPath: (databaseId, id) => `/databases/${databaseId}/connectors/${id}`,
  replaceOnChange: ["name", "class"],
  toCreateBody: (props) =>
    compact({
      name: props.name,
      class: props.class,
      topics: props.topics,
      config: props.config,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        topics: props.topics,
        config: props.config,
      },
      live,
      ["topics", "config"],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.name ?? props.name),
    databaseId,
    name: String(live.name ?? props.name),
    class: String(live.class ?? props.class),
    topics: String(live.topics ?? props.topics),
  }),
});

/** A Kafka Connect connector on a Vultr Managed Database. @resource */
export const Connector = defined.Resource;
export const ConnectorProvider = defined.Provider;
