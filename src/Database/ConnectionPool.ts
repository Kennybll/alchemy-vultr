import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseConnectionPoolProps {
  database: string | { readonly id: string };
  name: string;
  databaseName: string;
  username: string;
  mode: "session" | "transaction";
  size: number;
}

export type DatabaseConnectionPoolAttributes = {
  id: string;
  databaseId: string;
  name: string;
  databaseName: string;
  username: string;
  mode: string;
  size: number;
};

const defined = defineNestedCrudResource<
  "Vultr.Database.ConnectionPool",
  DatabaseConnectionPoolProps,
  DatabaseConnectionPoolAttributes
>({
  type: "Vultr.Database.ConnectionPool",
  aliases: ["Vultr.DatabaseConnectionPool"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "connection_pool",
  listKey: "connection_pools",
  parentList: { path: "/databases", key: "databases" },
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/connection-pools`,
  getPath: (databaseId, id) =>
    `/databases/${databaseId}/connection-pools/${id}`,
  replaceOnChange: ["name"],
  toCreateBody: (props) =>
    compact({
      name: props.name,
      database: props.databaseName,
      username: props.username,
      mode: props.mode,
      size: props.size,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        database: props.databaseName,
        username: props.username,
        mode: props.mode,
        size: props.size,
      },
      live,
      ["database", "username", "mode", "size"],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.name ?? props.name),
    databaseId,
    name: String(live.name ?? props.name),
    databaseName: String(live.database ?? props.databaseName),
    username: String(live.username ?? props.username),
    mode: String(live.mode ?? props.mode),
    size: Number(live.size ?? props.size),
  }),
});

/** A connection pool on a Vultr Managed Database. @resource */
export const ConnectionPool = defined.Resource;
export const ConnectionPoolProvider = defined.Provider;
