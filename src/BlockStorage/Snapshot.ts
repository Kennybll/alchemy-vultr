import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface BlockStorageSnapshotProps {
  blockStorage: string | { readonly id: string };
  description?: string;
}

export type BlockStorageSnapshotAttributes = {
  id: string;
  blockStorageId: string;
  description: string;
  status: string;
  size: number;
  dateCreated: string;
};

const defined = defineNestedCrudResource<
  "Vultr.BlockStorage.Snapshot",
  BlockStorageSnapshotProps,
  BlockStorageSnapshotAttributes
>({
  type: "Vultr.BlockStorage.Snapshot",
  aliases: ["Vultr.BlockStorageSnapshot"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "blockStorageId",
  wrapKey: "snapshot",
  listKey: "snapshots",
  resolveParentId: (props) => resourceId(props.blockStorage),
  listPath: () => `/blocks/snapshots`,
  getPath: (_parent, id) => `/blocks/snapshots/${id}`,
  immutable: true,
  toCreateBody: (props) =>
    compact({
      block_id: resourceId(props.blockStorage),
      description: props.description,
    }),
  toUpdateBody: (props, live) =>
    pickChanged({ description: props.description }, live, ["description"]),
  toAttributes: (live, blockStorageId, props) => ({
    id: String(live.id ?? ""),
    blockStorageId: String(live.block_id ?? blockStorageId),
    description: String(live.description ?? props.description ?? ""),
    status: String(live.status ?? ""),
    size: Number(live.size ?? 0),
    dateCreated: String(live.date_created ?? ""),
  }),
});

/** A snapshot of a Vultr block storage volume. @resource */
export const Snapshot = defined.Resource;
export const SnapshotProvider = defined.Provider;
