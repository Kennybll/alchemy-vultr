import * as Redacted from "effect/Redacted";
import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";
import { redact, reveal } from "../internal/redacted.ts";

export interface DatabaseUserProps {
  database: string | { readonly id: string };
  username: string;
  password?: string | Redacted.Redacted<string>;
  encryption?: "legacy" | "caching_sha2_password";
  permission?: string;
}

export type DatabaseUserAttributes = {
  id: string;
  databaseId: string;
  username: string;
  password: Redacted.Redacted<string>;
};

const defined = defineNestedCrudResource<
  "Vultr.Database.User",
  DatabaseUserProps,
  DatabaseUserAttributes
>({
  type: "Vultr.Database.User",
  aliases: ["Vultr.DatabaseUser"],
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "user",
  listKey: "users",
  parentList: { path: "/databases", key: "databases" },
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/users`,
  getPath: (databaseId, id) => `/databases/${databaseId}/users/${id}`,
  replaceOnChange: ["username"],
  toCreateBody: (props) =>
    compact({
      username: props.username,
      password: reveal(props.password),
      encryption: props.encryption,
      permission: props.permission,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        password: reveal(props.password),
        encryption: props.encryption,
        permission: props.permission,
      },
      live,
      ["password", "encryption", "permission"],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.username ?? props.username),
    databaseId,
    username: String(live.username ?? props.username),
    password: redact(live.password ?? reveal(props.password) ?? ""),
  }),
});

/** A user on a Vultr Managed Database. @resource */
export const User = defined.Resource;
export const UserProvider = defined.Provider;
