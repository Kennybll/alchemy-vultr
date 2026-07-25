import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "./Client.ts";
import type { JsonObject } from "./defineResource.ts";
import { listAcrossParents } from "./listAcross.ts";

export interface NestedCrudConfig<
  Type extends string,
  Props extends object,
  Attributes extends object,
> {
  readonly type: Type;
  readonly aliases?: ReadonlyArray<string>;
  readonly stables: ReadonlyArray<keyof Attributes & string>;
  readonly idAttribute: keyof Attributes & string;
  readonly parentIdAttribute: keyof Attributes & string;
  readonly wrapKey: string;
  readonly listKey: string;
  readonly resolveParentId: (props: Props) => string;
  readonly listPath: (parentId: string) => string;
  readonly getPath: (parentId: string, id: string) => string;
  /**
   * When set, `list` fans out across every parent (required for nuke).
   * Omit for account-scoped child lists where `listPath` ignores the parent
   * (e.g. block storage snapshots).
   */
  readonly parentList?: {
    readonly path: string;
    readonly key: string;
    readonly idField?: string;
  };
  /** For global lists: which live field holds the parent id. */
  readonly parentIdFromItem?: string;
  readonly replaceOnChange?: ReadonlyArray<keyof Props & string>;
  readonly toCreateBody: (props: Props) => JsonObject;
  readonly toUpdateBody?: (props: Props, live: JsonObject) => JsonObject | undefined;
  readonly toAttributes: (live: JsonObject, parentId: string, props: Props) => Attributes;
  readonly updateMethod?: "PATCH" | "PUT" | "POST";
  readonly immutable?: boolean;
  readonly nuke?: {
    readonly singleton?: boolean;
    readonly skip?: boolean;
  };
}

/**
 * Define a nested Vultr CRUD resource (child of another resource).
 *
 * Implements the provider contract from
 * https://alchemy.run/infrastructure-as-code/provider/ —
 * `reconcile` / `delete` / `list` required; `diff` / `read` for plan + adoption.
 */
export const defineNestedCrudResource = <
  Type extends string,
  Props extends object,
  Attributes extends object,
>(
  config: NestedCrudConfig<Type, Props, Attributes>,
) => {
  const ResourceTag = (Resource as any)(
    config.type,
    config.aliases ? { aliases: config.aliases } : undefined,
  ) as ReturnType<typeof Resource<Resource<Type, Props, Attributes>>>;

  const ProviderLayer = () =>
    Provider.succeed(
      ResourceTag,
      ResourceTag.Provider.of({
        stables: [...config.stables] as string[],
        ...(config.nuke ? { nuke: config.nuke } : {}),
        list: Effect.fn(function* () {
          if (config.parentList) {
            return yield* listAcrossParents({
              parentPath: config.parentList.path,
              parentKey: config.parentList.key,
              parentIdField: config.parentList.idField,
              childPath: config.listPath,
              childKey: config.listKey,
              map: (item, parentId) => config.toAttributes(item, parentId, {} as Props),
            });
          }
          // Account-scoped nested list (path independent of parent).
          const client = yield* yield* VultrClient;
          const items = yield* client.listAll<JsonObject>(config.listPath(""), config.listKey);
          const parentField = config.parentIdFromItem ?? "id";
          return items.map((item) =>
            config.toAttributes(item, String(item[parentField] ?? ""), {} as Props),
          );
        }),
        diff: Effect.fn(function* ({ news, olds }: any) {
          if (!isResolved(news)) return undefined;
          if (config.immutable) return { action: "replace" as const };
          if (config.resolveParentId(news) !== config.resolveParentId(olds)) {
            return { action: "replace" as const };
          }
          for (const key of config.replaceOnChange ?? []) {
            if (news[key] !== olds[key]) {
              return { action: "replace" as const };
            }
          }
          return undefined;
        }),
        read: Effect.fn(function* ({ output }: any) {
          const id = output?.[config.idAttribute];
          const parentId = output?.[config.parentIdAttribute];
          if (typeof id !== "string" || typeof parentId !== "string") {
            return undefined;
          }
          const client = yield* yield* VultrClient;
          const response = yield* catchNotFound(
            client.get<JsonObject>(config.getPath(parentId, id)),
          );
          if (!response) return undefined;
          const live = (response[config.wrapKey] ?? response) as JsonObject;
          return config.toAttributes(live, parentId, {} as Props);
        }),
        reconcile: Effect.fn(function* ({ news, output }: any) {
          const client = yield* yield* VultrClient;
          const props = news as Props;
          const parentId = config.resolveParentId(props);

          let live: JsonObject | undefined;
          const existingId =
            output && typeof output[config.idAttribute] === "string"
              ? (output[config.idAttribute] as string)
              : undefined;

          if (existingId) {
            const response = yield* catchNotFound(
              client.get<JsonObject>(config.getPath(parentId, existingId)),
            );
            if (response) {
              live = (response[config.wrapKey] ?? response) as JsonObject;
            }
          }

          if (!live) {
            const created = yield* client
              .post<JsonObject>(config.listPath(parentId), {
                body: config.toCreateBody(props),
              })
              .pipe(
                Effect.catchTag("VultrConflict", (error) => {
                  if (!existingId) return Effect.fail(error);
                  return client.get<JsonObject>(config.getPath(parentId, existingId));
                }),
              );
            live = (created[config.wrapKey] ?? created) as JsonObject;
          } else if (config.toUpdateBody && !config.immutable) {
            const body = config.toUpdateBody(props, live);
            if (body && Object.keys(body).length > 0) {
              const id = String(live.id ?? existingId);
              const path = config.getPath(parentId, id);
              const method = config.updateMethod ?? "PATCH";
              const updated =
                method === "PUT"
                  ? yield* client.put<JsonObject>(path, { body })
                  : method === "POST"
                    ? yield* client.post<JsonObject>(path, { body })
                    : yield* client.patch<JsonObject>(path, { body });
              if (updated) {
                live = (updated[config.wrapKey] ?? updated ?? live) as JsonObject;
              } else {
                const refreshed = yield* client.get<JsonObject>(path);
                live = (refreshed[config.wrapKey] ?? refreshed) as JsonObject;
              }
            }
          }

          return config.toAttributes(live, parentId, props);
        }),
        delete: Effect.fn(function* ({ output }: any) {
          const id = output[config.idAttribute];
          const parentId = output[config.parentIdAttribute];
          if (typeof id !== "string" || typeof parentId !== "string") return;
          const client = yield* yield* VultrClient;
          yield* catchNotFound(client.del(config.getPath(parentId, id)));
        }),
      } as any),
    );

  return {
    Resource: ResourceTag,
    Provider: ProviderLayer,
    type: config.type,
  };
};

export type { JsonObject } from "./defineResource.ts";
export { compact, pickChanged, resourceId } from "./defineResource.ts";
