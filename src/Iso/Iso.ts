import { compact, defineCrudResource, pickChanged } from "../internal/defineResource.ts";

export interface IsoProps {
  url: string;
}

export type IsoAttributes = {
  id: string;
  filename: string;
  size: number;
  status: string;
  md5sum: string;
  sha512sum: string;
  dateCreated: string;
};

const defined = defineCrudResource<"Vultr.Iso.Iso", IsoProps, IsoAttributes>({
  type: "Vultr.Iso.Iso",
  aliases: ["Vultr.Iso"],
  description: "A private ISO image uploaded to Vultr.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/iso",
  listKey: "isos",
  wrapKey: "iso",
  getPath: (id) => `/iso/${id}`,

  replaceOnChange: ["url"],
  toCreateBody: (props) =>
    compact({
      url: props.url,
    }),
  toUpdateBody: (_props, live) => pickChanged({}, live, []),
  toAttributes: (live, _props) => ({
    id: live.id as string,
    filename: live.filename as string,
    size: live.size as number,
    status: live.status as string,
    md5sum: live.md5sum as string,
    sha512sum: live.sha512sum as string,
    dateCreated: live.date_created as string,
  }),
});

/**
 * A private ISO image uploaded to Vultr.
 * @resource
 */
export const Iso = defined.Resource;
export const IsoProvider = defined.Provider;
