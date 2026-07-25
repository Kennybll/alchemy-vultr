import type * as Duration from "effect/Duration";
import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";
import { toWireHours } from "../internal/duration.ts";

export interface DatabaseTopicProps {
  database: string | { readonly id: string };
  name: string;
  partitions: number;
  replication: number;
  /**
   * Message retention. Prefer `Duration.Input` (`"24 hours"`); a bare number
   * is treated as hours for backward compatibility.
   */
  retention?: Duration.Input;
  /** @deprecated Prefer `retention`. */
  retentionHours?: number;
  retentionBytes?: number;
}

export type DatabaseTopicAttributes = {
  id: string;
  databaseId: string;
  name: string;
  partitions: number;
  replication: number;
};

const defined = defineNestedCrudResource<
  "Vultr.Database.Topic",
  DatabaseTopicProps,
  DatabaseTopicAttributes
>({
  type: "Vultr.Database.Topic",
  aliases: ["Vultr.DatabaseTopic"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "topic",
  listKey: "topics",
  parentList: { path: "/databases", key: "databases" },
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/topics`,
  getPath: (databaseId, id) => `/databases/${databaseId}/topics/${id}`,
  replaceOnChange: ["name"],
  toCreateBody: (props) =>
    compact({
      name: props.name,
      partitions: props.partitions,
      replication: props.replication,
      retention_hours:
        props.retentionHours ?? toWireHours(props.retention),
      retention_bytes: props.retentionBytes,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        partitions: props.partitions,
        replication: props.replication,
        retention_hours: props.retentionHours,
        retention_bytes: props.retentionBytes,
      },
      live,
      ["partitions", "replication", "retention_hours", "retention_bytes"],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.name ?? props.name),
    databaseId,
    name: String(live.name ?? props.name),
    partitions: Number(live.partitions ?? props.partitions),
    replication: Number(live.replication ?? props.replication),
  }),
});

/** A Kafka topic on a Vultr Managed Database. @resource */
export const Topic = defined.Resource;
export const TopicProvider = defined.Provider;
