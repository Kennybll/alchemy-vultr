import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "./Client.ts";

export type JsonObject = Record<string, unknown>;

export interface CrudResourceConfig<
  Type extends string,
  Props extends object,
  Attributes extends object,
> {
  readonly type: Type;
  /** Legacy type names for rename / namespace migrations. */
  readonly aliases?: ReadonlyArray<string>;
  readonly description?: string;
  readonly stables: ReadonlyArray<keyof Attributes & string>;
  readonly idAttribute: keyof Attributes & string;
  readonly listPath: string;
  readonly listKey: string;
  readonly wrapKey: string;
  readonly getPath: (id: string, props?: Props) => string;
  readonly deletePath?: (id: string, props?: Props) => string;
  readonly replaceOnChange?: ReadonlyArray<keyof Props & string>;
  readonly toCreateBody: (props: Props) => JsonObject;
  readonly toUpdateBody?: (
    props: Props,
    live: JsonObject,
  ) => JsonObject | undefined;
  readonly toAttributes: (live: JsonObject, props: Props) => Attributes;
  readonly listItemToAttributes?: (live: JsonObject) => Attributes;
  readonly updateMethod?: "PATCH" | "PUT" | "POST";
  readonly immutable?: boolean;
}

/**
 * Define a standard Vultr CRUD resource + provider Layer.
 *
 * Alchemy's Resource generics are intentionally strict; this helper uses a
 * thin cast boundary so call sites stay fully typed while the shared
 * lifecycle implementation remains Effect-idiomatic.
 */
export const defineCrudResource = <
  Type extends string,
  Props extends object,
  Attributes extends object,
>(
  config: CrudResourceConfig<Type, Props, Attributes>,
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
        list: Effect.fn(function* () {
          const client = yield* yield* VultrClient;
          const items = yield* client.listAll<JsonObject>(
            config.listPath,
            config.listKey,
          );
          return items.map((item) =>
            config.listItemToAttributes
              ? config.listItemToAttributes(item)
              : config.toAttributes(item, {} as Props),
          );
        }),
        diff: Effect.fn(function* ({ news, olds }: any) {
          if (!isResolved(news)) return undefined;
          if (config.immutable) {
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
          if (typeof id !== "string" || id.length === 0) return undefined;
          const client = yield* yield* VultrClient;
          const response = yield* catchNotFound(
            client.get<JsonObject>(config.getPath(id)),
          );
          if (!response) return undefined;
          const live = (response[config.wrapKey] ?? response) as JsonObject;
          return config.toAttributes(live, {} as Props);
        }),
        reconcile: Effect.fn(function* ({ news, output }: any) {
          const client = yield* yield* VultrClient;
          const props = news as Props;
          const existingId =
            output && typeof output[config.idAttribute] === "string"
              ? (output[config.idAttribute] as string)
              : undefined;

          let live: JsonObject | undefined;
          if (existingId) {
            const response = yield* catchNotFound(
              client.get<JsonObject>(config.getPath(existingId, props)),
            );
            if (response) {
              live = (response[config.wrapKey] ?? response) as JsonObject;
            }
          }

          if (!live) {
            // Observe → ensure: create; on conflict with a known id, re-read.
            const created = yield* client
              .post<JsonObject>(config.listPath, {
                body: config.toCreateBody(props),
              })
              .pipe(
                Effect.catchTag("VultrConflict", (error) => {
                  if (!existingId) return Effect.fail(error);
                  return client.get<JsonObject>(
                    config.getPath(existingId, props),
                  );
                }),
              );
            live = (created[config.wrapKey] ?? created) as JsonObject;
          } else if (config.toUpdateBody && !config.immutable) {
            const body = config.toUpdateBody(props, live);
            if (body && Object.keys(body).length > 0) {
              const id = String(live.id ?? existingId);
              const method = config.updateMethod ?? "PATCH";
              const path = config.getPath(id, props);
              const updated =
                method === "PUT"
                  ? yield* client.put<JsonObject>(path, { body })
                  : method === "POST"
                    ? yield* client.post<JsonObject>(path, { body })
                    : yield* client.patch<JsonObject>(path, { body });
              if (updated) {
                live = (updated[config.wrapKey] ??
                  updated ??
                  live) as JsonObject;
              } else {
                const refreshed = yield* client.get<JsonObject>(path);
                live = (refreshed[config.wrapKey] ?? refreshed) as JsonObject;
              }
            }
          }

          return config.toAttributes(live, props);
        }),
        delete: Effect.fn(function* ({ output, olds }: any) {
          const id = output[config.idAttribute];
          if (typeof id !== "string" || id.length === 0) return;
          const client = yield* yield* VultrClient;
          const path = (config.deletePath ?? config.getPath)(
            id,
            olds as Props | undefined,
          );
          yield* catchNotFound(client.del(path));
        }),
      } as any),
    );

  return {
    Resource: ResourceTag,
    Provider: ProviderLayer,
    type: config.type,
  };
};

/**
 * Extract a Vultr resource id from a string or a resource-like `{ id }` /
 * attribute object.
 */
export const resourceId = (
  value: string | { readonly id: string } | { readonly [key: string]: unknown },
  key = "id",
): string => {
  if (typeof value === "string") return value;
  const record = value as Record<string, unknown>;
  const candidate = record[key] ?? record.id;
  if (typeof candidate === "string") return candidate;
  throw new Error(`Expected resource id string or object with ${key}`);
};

/**
 * Drop undefined values from a request body.
 */
export const compact = <T extends JsonObject>(body: T): JsonObject => {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
};

/**
 * Shallow compare selected keys between desired props and live API object.
 */
export const pickChanged = (
  desired: JsonObject,
  live: JsonObject,
  keys: ReadonlyArray<string>,
): JsonObject => {
  const body: JsonObject = {};
  for (const key of keys) {
    const next = desired[key];
    if (next === undefined) continue;
    const prev = live[key];
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      body[key] = next;
    }
  }
  return body;
};
