import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseUserProps {
  database: string | { readonly id: string };
  username: string;
  password?: string;
  encryption?: "legacy" | "caching_sha2_password";
  permission?: string;
}

export type DatabaseUserAttributes = {
  id: string;
  databaseId: string;
  username: string;
  password: string;
};

const defined = defineNestedCrudResource<
  "Vultr.DatabaseUser",
  DatabaseUserProps,
  DatabaseUserAttributes
>({
  type: "Vultr.DatabaseUser",
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "user",
  listKey: "users",
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/users`,
  getPath: (databaseId, id) => `/databases/${databaseId}/users/${id}`,
  replaceOnChange: ["username"],
  toCreateBody: (props) =>
    compact({
      username: props.username,
      password: props.password,
      encryption: props.encryption,
      permission: props.permission,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        password: props.password,
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
    password: String(live.password ?? props.password ?? ""),
  }),
});

/** A user on a Vultr Managed Database. @resource */
export const DatabaseUser = defined.Resource;
export const DatabaseUserProvider = defined.Provider;
