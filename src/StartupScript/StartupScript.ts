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

/** UTF-8 script body → base64 for Vultr's wire format. */
const encodeScript = (script: string): string =>
  Buffer.from(script, "utf8").toString("base64");

export interface StartupScriptProps {
  /**
   * Script name. If omitted, a unique name is generated with
   * {@link createPhysicalName}.
   */
  name?: string;
  /**
   * Plain-text script body. The provider base64-encodes this for
   * `POST`/`PATCH` — Vultr rejects unencoded scripts with HTTP 400.
   */
  script: string;
  type?: "boot" | "pxe";
}

export type StartupScript = Resource<
  "Vultr.StartupScript.StartupScript",
  StartupScriptProps,
  {
    id: string;
    name: string;
    dateCreated: string;
    dateModified: string;
  },
  never,
  Providers
>;

const resolveName = (id: string, name: string | undefined) =>
  Effect.gen(function* () {
    return name ?? (yield* createPhysicalName({ id, lowercase: true }));
  });

/**
 * A startup script executed on first boot of an instance.
 *
 * @resource
 * @section Creating a Startup Script
 * @example Basic
 * ```typescript
 * const script = yield* Vultr.StartupScript.StartupScript("boot", {
 *   script: "#!/bin/bash\\necho hello",
 *   type: "boot",
 * });
 * ```
 */
export const StartupScript = Resource<StartupScript>(
  "Vultr.StartupScript.StartupScript",
  { aliases: ["Vultr.StartupScript"] },
);

export const StartupScriptProvider = () =>
  Provider.succeed(
    StartupScript,
    StartupScript.Provider.of({
      stables: ["id"],
      list: Effect.fn(function* () {
        const client = yield* yield* VultrClient;
        const items = yield* client.listAll<JsonObject>(
          "/startup-scripts",
          "startup_scripts",
        );
        return items.map((live) => ({
          id: String(live.id ?? ""),
          name: String(live.name ?? ""),
          dateCreated: String(live.date_created ?? ""),
          dateModified: String(live.date_modified ?? ""),
        }));
      }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if ((news.type ?? "boot") !== (olds.type ?? "boot")) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(`/startup-scripts/${output.id}`),
        );
        if (!response) return undefined;
        const live = (response.startup_script ?? response) as JsonObject;
        return {
          id: String(live.id ?? ""),
          name: String(live.name ?? ""),
          dateCreated: String(live.date_created ?? ""),
          dateModified: String(live.date_modified ?? ""),
        };
      }),
      reconcile: Effect.fn(function* ({ id, news, output }) {
        const client = yield* yield* VultrClient;
        const name = yield* resolveName(id, news.name);

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(
            client.get<JsonObject>(`/startup-scripts/${output.id}`),
          );
          if (response) {
            live = (response.startup_script ?? response) as JsonObject;
          }
        }

        const scriptB64 = encodeScript(news.script);

        if (!live) {
          const created = yield* client
            .post<JsonObject>("/startup-scripts", {
              body: compact({
                name,
                script: scriptB64,
                type: news.type,
              }),
            })
            .pipe(
              Effect.catchTag("VultrConflict", (error) => {
                if (!output?.id) return Effect.fail(error);
                return client.get<JsonObject>(
                  `/startup-scripts/${output.id}`,
                );
              }),
            );
          live = (created.startup_script ?? created) as JsonObject;
        } else {
          // Live `script` is base64; compare encoded desired to avoid churn.
          const body = pickChanged(
            { name, script: scriptB64 },
            live,
            ["name", "script"],
          );
          if (Object.keys(body).length > 0) {
            const path = `/startup-scripts/${String(live.id)}`;
            const updated = yield* client.patch<JsonObject>(path, { body });
            if (updated) {
              live = (updated.startup_script ?? updated ?? live) as JsonObject;
            } else {
              const refreshed = yield* client.get<JsonObject>(path);
              live = (refreshed.startup_script ?? refreshed) as JsonObject;
            }
          }
        }

        return {
          id: String(live.id ?? ""),
          name: String(live.name ?? name),
          dateCreated: String(live.date_created ?? ""),
          dateModified: String(live.date_modified ?? ""),
        };
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output?.id) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(client.del(`/startup-scripts/${output.id}`));
      }),
    }),
  );
