import { Resource, createPhysicalName } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import {
  compact,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface SshKeyProps {
  /**
   * Label for the SSH key. If omitted, a unique name is generated with
   * {@link createPhysicalName}.
   */
  name?: string;
  /** SSH public key contents. */
  sshKey: string;
}

export type SshKey = Resource<
  "Vultr.SshKey.SshKey",
  SshKeyProps,
  {
    id: string;
    name: string;
    dateCreated: string;
  },
  never,
  Providers
>;

const resolveName = (id: string, name: string | undefined) =>
  Effect.gen(function* () {
    return name ?? (yield* createPhysicalName({ id, lowercase: true }));
  });

/**
 * An SSH public key registered on your Vultr account.
 *
 * @resource
 * @section Creating an SSH Key
 * @example Basic
 * ```typescript
 * const key = yield* Vultr.SshKey.SshKey("deploy", {
 *   sshKey: "ssh-ed25519 AAAA...",
 * });
 * ```
 *
 * @example Named
 * ```typescript
 * const key = yield* Vultr.SshKey.SshKey("deploy", {
 *   name: "deploy",
 *   sshKey: "ssh-ed25519 AAAA...",
 * });
 * ```
 */
export const SshKey = Resource<SshKey>("Vultr.SshKey.SshKey", {
  aliases: ["Vultr.SshKey"],
});

export const SshKeyProvider = () =>
  Provider.succeed(
    SshKey,
    SshKey.Provider.of({
      stables: ["id"],
      list: Effect.fn(function* () {
        const client = yield* yield* VultrClient;
        const items = yield* client.listAll<JsonObject>(
          "/ssh-keys",
          "ssh_keys",
        );
        return items.map((live) => ({
          id: String(live.id ?? ""),
          name: String(live.name ?? ""),
          dateCreated: String(live.date_created ?? ""),
        }));
      }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (news.sshKey !== olds.sshKey) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(`/ssh-keys/${output.id}`),
        );
        if (!response) return undefined;
        const live = (response.ssh_key ?? response) as JsonObject;
        return {
          id: String(live.id ?? ""),
          name: String(live.name ?? ""),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ id, news, output }) {
        const client = yield* yield* VultrClient;
        const name = yield* resolveName(id, news.name);

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(
            client.get<JsonObject>(`/ssh-keys/${output.id}`),
          );
          if (response) {
            live = (response.ssh_key ?? response) as JsonObject;
          }
        }

        if (!live) {
          const created = yield* client
            .post<JsonObject>("/ssh-keys", {
              body: compact({ name, ssh_key: news.sshKey }),
            })
            .pipe(
              Effect.catchTag("VultrConflict", (error) => {
                if (!output?.id) return Effect.fail(error);
                return client.get<JsonObject>(`/ssh-keys/${output.id}`);
              }),
            );
          live = (created.ssh_key ?? created) as JsonObject;
        } else {
          const body = pickChanged(
            { name, ssh_key: news.sshKey },
            live,
            ["name", "ssh_key"],
          );
          if (Object.keys(body).length > 0) {
            const path = `/ssh-keys/${String(live.id)}`;
            const updated = yield* client.patch<JsonObject>(path, { body });
            if (updated) {
              live = (updated.ssh_key ?? updated ?? live) as JsonObject;
            } else {
              const refreshed = yield* client.get<JsonObject>(path);
              live = (refreshed.ssh_key ?? refreshed) as JsonObject;
            }
          }
        }

        return {
          id: String(live.id ?? ""),
          name: String(live.name ?? name),
          dateCreated: String(live.date_created ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output?.id) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(client.del(`/ssh-keys/${output.id}`));
      }),
    }),
  );
