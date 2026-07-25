import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import {
  catchNotFound,
  VultrClient,
} from "../internal/Client.ts";
import {
  compact,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";
import type { Providers } from "../Providers.ts";

export interface InstanceProps {
  /** Region slug, e.g. `ewr`. Changing region replaces the instance. */
  region: string;
  /** Plan id, e.g. `vc2-1c-1gb`. */
  plan: string;
  /** Operating system id. Mutually exclusive with app/image/snapshot/iso. */
  osId?: number;
  /** Marketplace app id. */
  appId?: number;
  /** Image id. */
  imageId?: string;
  /** Snapshot id to restore from. */
  snapshotId?: string;
  /** ISO id to install from. */
  isoId?: string;
  /** Optional hostname (immutable after create). */
  hostname?: string;
  /** Display label. */
  label?: string;
  /** Tags applied to the instance. */
  tags?: ReadonlyArray<string>;
  /** Enable IPv6. */
  enableIpv6?: boolean;
  /** Disable public IPv4 (VPC-only). */
  disablePublicIpv4?: boolean;
  /** Attach DDOS protection. */
  ddosProtection?: boolean;
  /** Enable automatic backups. */
  backups?: "enabled" | "disabled";
  /** User data (cloud-init), base64-encoded by Vultr if needed. */
  userData?: string;
  /** SSH key ids to install. */
  sshKeyIds?: ReadonlyArray<string>;
  /** Startup script id. */
  scriptId?: string;
  /** Firewall group id. */
  firewallGroupId?: string;
  /** Reserved IPv4 to assign. */
  reservedIpv4?: string;
  /** VPC ids to attach. */
  vpcIds?: ReadonlyArray<string>;
  /** User scheme (`root` or `limited`). */
  userScheme?: "root" | "limited";
  /** Optional app variables for marketplace apps. */
  appVariables?: Record<string, string>;
}

export type Instance = Resource<
  "Vultr.Instance.Instance",
  InstanceProps,
  {
    id: string;
    mainIp: string;
    v6MainIp: string;
    status: string;
    powerStatus: string;
    serverStatus: string;
    label: string;
    region: string;
    plan: string;
    osId: number;
    appId: number;
    hostname: string;
    defaultPassword: string;
    dateCreated: string;
    kvm: string;
    tags: ReadonlyArray<string>;
    firewallGroupId: string;
    internalIp: string;
  },
  never,
  Providers
>;

const toAttributes = (live: JsonObject) => ({
  id: String(live.id ?? ""),
  mainIp: String(live.main_ip ?? ""),
  v6MainIp: String(live.v6_main_ip ?? ""),
  status: String(live.status ?? ""),
  powerStatus: String(live.power_status ?? ""),
  serverStatus: String(live.server_status ?? ""),
  label: String(live.label ?? ""),
  region: String(live.region ?? ""),
  plan: String(live.plan ?? ""),
  osId: Number(live.os_id ?? 0),
  appId: Number(live.app_id ?? 0),
  hostname: String(live.hostname ?? ""),
  defaultPassword: String(live.default_password ?? ""),
  dateCreated: String(live.date_created ?? ""),
  kvm: String(live.kvm ?? ""),
  tags: (live.tags as string[] | undefined) ?? [],
  firewallGroupId: String(live.firewall_group_id ?? ""),
  internalIp: String(live.internal_ip ?? ""),
});

/**
 * A Vultr Cloud Compute instance (VPS).
 *
 * @resource
 * @example
 * ```typescript
 * const key = yield* Vultr.SshKey("deploy", {
 *   name: "deploy",
 *   sshKey: "ssh-ed25519 AAAA...",
 * });
 *
 * const server = yield* Vultr.Instance("web", {
 *   region: "ewr",
 *   plan: "vc2-1c-1gb",
 *   osId: 2284,
 *   label: "web",
 *   sshKeyIds: [key.id],
 *   enableIpv6: true,
 * });
 * ```
 */
export const Instance = Resource<Instance>("Vultr.Instance.Instance", {
  aliases: ["Vultr.Instance"],
});

export const InstanceProvider = () =>
  Provider.succeed(
    Instance,
    Instance.Provider.of({
      stables: ["id"],
      list: Effect.fn(function* () {
        const client = yield* yield* VultrClient;
        const items = yield* client.listAll<JsonObject>(
          "/instances",
          "instances",
        );
        return items.map(toAttributes);
      }),
      diff: Effect.fn(function* ({ news, olds }) {
        if (!isResolved(news)) return undefined;
        if (
          news.region !== olds.region ||
          news.hostname !== olds.hostname ||
          news.osId !== olds.osId ||
          news.appId !== olds.appId ||
          news.imageId !== olds.imageId ||
          news.snapshotId !== olds.snapshotId ||
          news.isoId !== olds.isoId
        ) {
          return { action: "replace" as const };
        }
        return undefined;
      }),
      read: Effect.fn(function* ({ output }) {
        if (!output?.id) return undefined;
        const client = yield* yield* VultrClient;
        const response = yield* catchNotFound(
          client.get<JsonObject>(`/instances/${output.id}`),
        );
        if (!response) return undefined;
        return toAttributes((response.instance ?? response) as JsonObject);
      }),
      reconcile: Effect.fn(function* ({ news, output }) {
        const client = yield* yield* VultrClient;

        let live: JsonObject | undefined;
        if (output?.id) {
          const response = yield* catchNotFound(
            client.get<JsonObject>(`/instances/${output.id}`),
          );
          if (response) {
            live = (response.instance ?? response) as JsonObject;
          }
        }

        if (!live) {
          const created = yield* client.post<JsonObject>("/instances", {
            body: compact({
              region: news.region,
              plan: news.plan,
              os_id: news.osId,
              app_id: news.appId,
              image_id: news.imageId,
              snapshot_id: news.snapshotId,
              iso_id: news.isoId,
              hostname: news.hostname,
              label: news.label,
              tags: news.tags,
              enable_ipv6: news.enableIpv6,
              disable_public_ipv4: news.disablePublicIpv4,
              ddos_protection: news.ddosProtection,
              backups: news.backups,
              user_data: news.userData,
              sshkey_id: news.sshKeyIds,
              script_id: news.scriptId,
              firewall_group_id: news.firewallGroupId,
              reserved_ipv4: news.reservedIpv4,
              vpc_ids: news.vpcIds,
              user_scheme: news.userScheme,
              app_variables: news.appVariables,
            }),
          });
          live = (created.instance ?? created) as JsonObject;
        } else {
          const body = pickChanged(
            {
              plan: news.plan,
              label: news.label,
              tags: news.tags,
              enable_ipv6: news.enableIpv6,
              backups: news.backups,
              firewall_group_id: news.firewallGroupId,
              user_scheme: news.userScheme,
              ddos_protection: news.ddosProtection,
              user_data: news.userData,
            },
            live,
            [
              "plan",
              "label",
              "tags",
              "enable_ipv6",
              "backups",
              "firewall_group_id",
              "user_scheme",
              "ddos_protection",
              "user_data",
            ],
          );
          if (Object.keys(body).length > 0) {
            const updated = yield* client.patch<JsonObject>(
              `/instances/${live.id}`,
              { body },
            );
            live = (updated?.instance ?? updated ?? live) as JsonObject;
          }

          // Converge VPC attachments when specified.
          if (news.vpcIds) {
            const attached = yield* client.listAll<{ id: string }>(
              `/instances/${live.id}/vpcs`,
              "vpcs",
            );
            const attachedIds = new Set(attached.map((v) => v.id));
            const desired = new Set(news.vpcIds);
            for (const vpcId of desired) {
              if (!attachedIds.has(vpcId)) {
                yield* client.post(`/instances/${live.id}/vpcs/attach`, {
                  body: { vpc_id: vpcId },
                });
              }
            }
            for (const vpcId of attachedIds) {
              if (!desired.has(vpcId)) {
                yield* client.post(`/instances/${live.id}/vpcs/detach`, {
                  body: { vpc_id: vpcId },
                });
              }
            }
          }
        }

        // Refresh for latest status / IPs.
        const refreshed = yield* client.get<JsonObject>(
          `/instances/${String(live.id)}`,
        );
        return toAttributes((refreshed.instance ?? refreshed) as JsonObject);
      }),
      delete: Effect.fn(function* ({ output }) {
        if (!output.id) return;
        const client = yield* yield* VultrClient;
        yield* catchNotFound(client.del(`/instances/${output.id}`));
      }),
    }),
  );
