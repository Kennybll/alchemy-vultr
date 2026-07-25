import {
  compact,
  defineNestedCrudResource,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseDbProps {
  database: string | { readonly id: string };
  name: string;
}

export type DatabaseDbAttributes = {
  id: string;
  databaseId: string;
  name: string;
};

const defined = defineNestedCrudResource<
  "Vultr.Database.Db",
  DatabaseDbProps,
  DatabaseDbAttributes
>({
  type: "Vultr.Database.Db",
  aliases: ["Vultr.DatabaseDb"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "db",
  listKey: "dbs",
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/dbs`,
  getPath: (databaseId, id) => `/databases/${databaseId}/dbs/${id}`,
  immutable: true,
  replaceOnChange: ["name"],
  toCreateBody: (props) => compact({ name: props.name }),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.name ?? props.name),
    databaseId,
    name: String(live.name ?? props.name),
  }),
});

/** A logical database inside a Vultr Managed Database. @resource */
export const Db = defined.Resource;
export const DbProvider = defined.Provider;
