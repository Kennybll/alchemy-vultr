import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface ContainerRegistryProps {
  name: string;
  public?: boolean;
  region: string;
  plan: string;
}

export type ContainerRegistryAttributes = {
  id: string;
  urn: string;
  storage: unknown;
  rootUser: unknown;
  dateCreated: string;
};

const defined = defineCrudResource<
  "Vultr.Registry.Registry",
  ContainerRegistryProps,
  ContainerRegistryAttributes
>({
  type: "Vultr.Registry.Registry",
  aliases: ["Vultr.ContainerRegistry"],
  description: "A Vultr Container Registry.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/registries",
  listKey: "registries",
  wrapKey: "registry",
  getPath: (id) => `/registries/${id}`,

  replaceOnChange: ["name", "region", "plan"],
  toCreateBody: (props) =>
    compact({
      name: props.name,
      public: props.public,
      region: props.region,
      plan: props.plan,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        public: props.public,
      },
      live,
      ["public"],
    ),
  toAttributes: (live, _props) => ({
    id: live.id as string,
    urn: live.urn as string,
    storage: live.storage as unknown,
    rootUser: live.root_user as unknown,
    dateCreated: live.date_created as string,
  }),
});

/**
 * A Vultr Container Registry.
 * @resource
 */
export const Registry = defined.Resource;
export const RegistryProvider = defined.Provider;
