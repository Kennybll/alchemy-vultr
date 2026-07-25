import {
  compact,
  defineNestedCrudResource,
  pickChanged,
  resourceId,
} from "../internal/nestedResource.ts";

export interface DatabaseQuotaProps {
  database: string | { readonly id: string };
  clientId: number;
  consumerByteRate?: number;
  producerByteRate?: number;
  requestPercentage?: number;
  user?: string;
}

export type DatabaseQuotaAttributes = {
  id: string;
  databaseId: string;
  clientId: number;
};

const defined = defineNestedCrudResource<
  "Vultr.DatabaseQuota",
  DatabaseQuotaProps,
  DatabaseQuotaAttributes
>({
  type: "Vultr.DatabaseQuota",
  stables: ["id"],
  idAttribute: "id",
  parentIdAttribute: "databaseId",
  wrapKey: "quota",
  listKey: "quotas",
  resolveParentId: (props) => resourceId(props.database),
  listPath: (databaseId) => `/databases/${databaseId}/quotas`,
  getPath: (databaseId, id) => `/databases/${databaseId}/quotas/${id}`,
  replaceOnChange: ["clientId"],
  toCreateBody: (props) =>
    compact({
      client_id: props.clientId,
      consumer_byte_rate: props.consumerByteRate,
      producer_byte_rate: props.producerByteRate,
      request_percentage: props.requestPercentage,
      user: props.user,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
        consumer_byte_rate: props.consumerByteRate,
        producer_byte_rate: props.producerByteRate,
        request_percentage: props.requestPercentage,
        user: props.user,
      },
      live,
      [
        "consumer_byte_rate",
        "producer_byte_rate",
        "request_percentage",
        "user",
      ],
    ),
  toAttributes: (live, databaseId, props) => ({
    id: String(live.client_id ?? props.clientId),
    databaseId,
    clientId: Number(live.client_id ?? props.clientId),
  }),
});

/** A Kafka quota on a Vultr Managed Database. @resource */
export const DatabaseQuota = defined.Resource;
export const DatabaseQuotaProvider = defined.Provider;
