import { createPhysicalName, Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { type JsonObject, pickChanged } from "../internal/defineResource.ts";
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

type SshKeyAttrs = {
  id: string;
  name: string;
  dateCreated: string;
};

/**
 * Vultr silently truncates SSH key names to 128 chars (live-probed).
 * Keep createPhysicalName at that ceiling so the stage segment survives
 * for normal stack ids; the truncation hash still disambiguates extremes.
 */
const resolveName = (id: string, name: string | undefined) =>
  name != null && name.length > 0
    ? Effect.succeed(name)
    : createPhysicalName({ id, lowercase: true, maxLength: 128 });

const unwrap = (response: JsonObject): JsonObject => (response.ssh_key ?? response) as JsonObject;

const toAttrs = (live: JsonObject, fallbackName?: string): SshKeyAttrs => ({
  id: String(live.id ?? ""),
  name: String(live.name ?? fallbackName ?? ""),
  dateCreated: String(live.date_created ?? ""),
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
        const items = yield* client.listAll<JsonObject>("/ssh-keys", "ssh_keys");
        return items.map((live) => toAttrs(live));
      }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (news.sshKey !== olds.sshKey) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ id, output, olds }) {
        const client = yield* yield* VultrClient;
        // Prefer cached id (state recovery); otherwise adopt by physical name.
        if (output?.id) {
          const response = yield* catchNotFound(client.get<JsonObject>(`/ssh-keys/${output.id}`));
          if (!response) return undefined;
          return toAttrs(unwrap(response));
        }
        const name = yield* resolveName(id, olds?.name);
        const items = yield* client.listAll<JsonObject>("/ssh-keys", "ssh_keys");
        const match = items.find((item) => String(item.name ?? "") === name);
        if (!match) return undefined;
        // Vultr SSH keys have no ownership tags — plain attrs = silent adopt.
        return toAttrs(match);
      }),
      reconcile: Effect.fn(function* ({ id, news, output }) {
        const client = yield* yield* VultrClient;
        const name = yield* resolveName(id, news.name);

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(client.get<JsonObject>(`/ssh-keys/${output.id}`));
          if (response) live = unwrap(response);
        }
        if (!live) {
          const items = yield* client.listAll<JsonObject>("/ssh-keys", "ssh_keys");
          const match = items.find((item) => String(item.name ?? "") === name);
          if (match) live = match;
        }

        if (!live) {
          const created = yield* client
            .post<JsonObject>("/ssh-keys", {
              body: { name, ssh_key: news.sshKey },
            })
            .pipe(
              Effect.catchTag("VultrConflict", (error) => {
                if (!output?.id) return Effect.fail(error);
                return client.get<JsonObject>(`/ssh-keys/${output.id}`);
              }),
            );
          live = unwrap(created);
        } else {
          // sshKey changes are replace (diff); only name is patched in place.
          const body = pickChanged({ name }, live, ["name"]);
          if (Object.keys(body).length > 0) {
            const path = `/ssh-keys/${String(live.id)}`;
            const updated = yield* client.patch<JsonObject>(path, { body });
            live = updated ? unwrap(updated) : unwrap(yield* client.get<JsonObject>(path));
          }
        }

        return toAttrs(live, name);
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output?.id) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(client.del(`/ssh-keys/${output.id}`));
      }),
    }),
  );
