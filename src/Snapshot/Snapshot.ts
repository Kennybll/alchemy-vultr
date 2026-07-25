import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

export interface SnapshotProps {
  instanceId: string;
  description?: string;
}

export type SnapshotAttributes = {
  id: string;
  dateCreated: string;
  size: number;
  compressedSize: number;
  status: string;
  osId: number;
  appId: number;
};

const defined = defineCrudResource<
  "Vultr.Snapshot.Snapshot",
  SnapshotProps,
  SnapshotAttributes
>({
  type: "Vultr.Snapshot.Snapshot",
  aliases: ["Vultr.Snapshot"],
  description: "A snapshot of a Vultr instance.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/snapshots",
  listKey: "snapshots",
  wrapKey: "snapshot",
  getPath: (id) => `/snapshots/${id}`,
  
  
  
  replaceOnChange: ["instanceId"],
  toCreateBody: (props) =>
    compact({
    instance_id: props.instanceId,
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
    size: live.size as number,
    compressedSize: live.compressed_size as number,
    status: live.status as string,
    osId: live.os_id as number,
    appId: live.app_id as number,
  }),
});

/**
 * A snapshot of a Vultr instance.
 * @resource
 */
export const Snapshot = defined.Resource;
export const SnapshotProvider = defined.Provider;
