import * as Redacted from "effect/Redacted";
import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";
import { redact } from "../internal/redacted.ts";

export interface DatabaseProps {
  databaseEngine: string;
  databaseEngineVersion?: string;
  region: string;
  plan: string;
  label?: string;
  tag?: string;
  vpcId?: string;
  maintenanceDow?: string;
  maintenanceTime?: string;
  clusterTimeZone?: string;
  trustedIps?: ReadonlyArray<string>;
  mysqlSqlModes?: ReadonlyArray<string>;
  mysqlRequirePrimaryKey?: boolean;
  mysqlSlowQueryLog?: boolean;
  mysqlLongQueryTime?: number;
}

export type DatabaseAttributes = {
  id: string;
  status: string;
  dateCreated: string;
  host: string;
  port: string;
  user: string;
  password: Redacted.Redacted<string>;
  dbname: string;
};

const defined = defineCrudResource<
  "Vultr.Database.Database",
  DatabaseProps,
  DatabaseAttributes
>({
  type: "Vultr.Database.Database",
  aliases: ["Vultr.Database"],
  description: "A Vultr Managed Database.",
  stables: ["id"],
  idAttribute: "id",
  listPath: "/databases",
  listKey: "databases",
  wrapKey: "database",
  getPath: (id) => `/databases/${id}`,
  
  
  
  replaceOnChange: ["databaseEngine", "region", "vpcId"],
  toCreateBody: (props) =>
    compact({
    database_engine: props.databaseEngine,
    database_engine_version: props.databaseEngineVersion,
    region: props.region,
    plan: props.plan,
    label: props.label,
    tag: props.tag,
    vpc_id: props.vpcId,
    maintenance_dow: props.maintenanceDow,
    maintenance_time: props.maintenanceTime,
    cluster_time_zone: props.clusterTimeZone,
    trusted_ips: props.trustedIps,
    mysql_sql_modes: props.mysqlSqlModes,
    mysql_require_primary_key: props.mysqlRequirePrimaryKey,
    mysql_slow_query_log: props.mysqlSlowQueryLog,
    mysql_long_query_time: props.mysqlLongQueryTime,
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
      database_engine_version: props.databaseEngineVersion,
      plan: props.plan,
      label: props.label,
      tag: props.tag,
      maintenance_dow: props.maintenanceDow,
      maintenance_time: props.maintenanceTime,
      cluster_time_zone: props.clusterTimeZone,
      trusted_ips: props.trustedIps,
      mysql_sql_modes: props.mysqlSqlModes,
      mysql_require_primary_key: props.mysqlRequirePrimaryKey,
      mysql_slow_query_log: props.mysqlSlowQueryLog,
      mysql_long_query_time: props.mysqlLongQueryTime,
      },
      live,
      ["database_engine_version", "plan", "label", "tag", "maintenance_dow", "maintenance_time", "cluster_time_zone", "trusted_ips", "mysql_sql_modes", "mysql_require_primary_key", "mysql_slow_query_log", "mysql_long_query_time"],
    ),
  toAttributes: (live, props) => ({
    id: live.id as string,
    status: live.status as string,
    dateCreated: live.date_created as string,
    host: live.host as string,
    port: live.port as string,
    user: live.user as string,
    password: redact(live.password),
    dbname: live.dbname as string,
  }),
});

/**
 * A Vultr Managed Database.
 * @resource
 */
export const Database = defined.Resource;
export const DatabaseProvider = defined.Provider;
