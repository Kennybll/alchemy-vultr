import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseReplicaProps {
  database: string | { readonly id: string };
  region: string;
  plan: string;
  label?: string;
}

export type DatabaseReplicaAttributes = {
  id: string;
  databaseId: string;
  region: string;
  plan: string;
  label: string;
  status: string;
  host: string;
  port: string;
};

const defined = defineNestedCrudResource<
  "Vultr.DatabaseReplica",
  DatabaseReplicaProps,
  DatabaseReplicaAttributes
>({
  type: "Vultr.DatabaseReplica",
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "database",
  listKey: "databases",
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/read-replica`,
  getPath: (_databaseId, id) => `/databases/${id}`,
  replaceOnChange: ["region"],
  toCreateBody: (props) =>
    compact({
      region: props.region,
      plan: props.plan,
      label: props.label,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        plan: props.plan,
        label: props.label,
      },
      live,
      ["plan", "label"],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.id ?? ""),
    databaseId,
    region: String(live.region ?? props.region),
    plan: String(live.plan ?? props.plan),
    label: String(live.label ?? props.label ?? ""),
    status: String(live.status ?? ""),
    host: String(live.host ?? ""),
    port: String(live.port ?? ""),
  }),
});

/** A read replica of a Vultr Managed Database. @resource */
export const DatabaseReplica = defined.Resource;
export const DatabaseReplicaProvider = defined.Provider;
