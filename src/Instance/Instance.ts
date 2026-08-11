import { Resource, Stack, Stage } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import { catchNotFound, VultrClient } from "../internal/Client.ts";
import { compact, type JsonObject, pickChanged } from "../internal/defineResource.ts";
import { normalizeDurationInput } from "../internal/duration.ts";
import { VultrCreateOnlyChange } from "../internal/Error.ts";
import { redact } from "../internal/redacted.ts";
import type { Providers } from "../Providers.ts";
import {
  createInstanceOnce,
  createOnlyChanges,
  createOnlyChangesAtPlan,
  DEFAULT_READINESS_POLL_INTERVAL,
  DEFAULT_READINESS_TIMEOUT,
  findOwnedInstance,
  mergeRecoveryTag,
  recoveryTag,
  replacementProps,
  replacesOnBootstrapChange,
  waitForInstanceReady,
} from "./internal.ts";

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
  /**
   * Replace the instance when a create-only ("first boot") input changes —
   * `userData`, `sshKeyIds`, `scriptId`, `disablePublicIpv4`, `reservedIpv4`,
   * `userScheme`, `appVariables`, `bootstrapVersion`.
   *
   * Vultr consumes these only while the VM boots, so an in-place update would
   * report convergence while the running VM still has the old cloud-init,
   * startup script, keys, and credentials. Defaults to `true`, matching the
   * `ForceNew` semantics of the official Terraform provider.
   *
   * Set to `false` only when you manage first-boot state out of band. The
   * provider then logs a warning instead of replacing, and never claims to
   * have applied the change.
   *
   * @default true
   */
  replaceOnBootstrapChange?: boolean;
  /**
   * Opaque version token for first-boot content Vultr does not expose as an
   * instance input — most often the *body* of a startup script, which can
   * change while `scriptId` stays the same.
   *
   * Treated as a create-only input: bumping it replaces the VM. Prefer this
   * over smuggling a digest into `hostname`.
   *
   * @example
   * ```typescript
   * bootstrapVersion: createHash("sha256").update(startupScript).digest("hex"),
   * ```
   */
  bootstrapVersion?: string;
  /**
   * How long reconcile waits for Vultr to assign a public IPv4 address before
   * failing with `VultrNotReady`. Ignored when `disablePublicIpv4` is set.
   *
   * @default "15 minutes"
   */
  readinessTimeout?: Duration.Input;
  /**
   * Cap on the readiness poll backoff (the first retry always waits ≤ 1s).
   *
   * @default "5 seconds"
   */
  readinessPollInterval?: Duration.Input;
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
    defaultPassword: Redacted.Redacted<string>;
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
  defaultPassword: redact(live.default_password),
  dateCreated: String(live.date_created ?? ""),
  kvm: String(live.kvm ?? ""),
  tags: (live.tags as string[] | undefined) ?? [],
  firewallGroupId: String(live.firewall_group_id ?? ""),
  internalIp: String(live.internal_ip ?? ""),
});

/**
 * Reject an in-place update that carries a create-only change.
 *
 * `diff` normally turns these into replacements, but reconcile also runs on
 * paths that never consulted it (cold-start adoption, `--force`). Vultr cannot
 * re-run cloud-init, a startup script, or key injection on a live VM, so the
 * only honest outcomes are "replace" or "fail" — never "converged".
 */
const guardCreateOnlyDrift = Effect.fn(function* (
  news: InstanceProps,
  olds: InstanceProps | undefined,
  id: string,
) {
  if (!olds) return;
  const drift = createOnlyChanges(
    replacementProps(news.replaceOnBootstrapChange),
    news as unknown as Record<string, unknown>,
    olds as unknown as Record<string, unknown>,
  );
  if (drift.length === 0) return;
  if (!replacesOnBootstrapChange(news.replaceOnBootstrapChange)) {
    yield* Effect.logWarning(
      "Vultr instance kept its original first-boot inputs (replaceOnBootstrapChange: false)",
    ).pipe(Effect.annotateLogs({ instanceId: id, createOnlyProps: drift }));
    return;
  }
  return yield* new VultrCreateOnlyChange({
    resourceType: "Vultr.Instance.Instance",
    id,
    props: drift,
    message:
      `Instance ${id} cannot apply create-only ${drift.length === 1 ? "input" : "inputs"} ` +
      `[${drift.join(", ")}] to a running VM — Vultr consumes them only while the ` +
      "instance is provisioned. Replace the instance (the default plan for these props), " +
      "or set replaceOnBootstrapChange: false to manage first-boot state out of band.",
  });
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

/**
 * Instance lifecycle handlers.
 *
 * @internal exported so unit tests can drive `diff`/`reconcile` directly;
 * stacks should register {@link InstanceProvider}.
 */
export const instanceLifecycle = Instance.Provider.of({
  stables: ["id"],
  list: Effect.fn(function* () {
    const client = yield* yield* VultrClient;
    const items = yield* client.listAll<JsonObject>("/instances", "instances");
    return items.map(toAttributes);
  }),
  diff: Effect.fn(function* ({ news, olds }) {
    // Deliberately no `isResolved(news)` short-circuit: bailing out here
    // hands the decision back to the engine, which defaults to `update` —
    // the exact path that lets an unresolved create-only Output converge
    // in place. Replacement inputs are inspected one prop at a time.
    // `news` is an `Input<InstanceProps>`: individual props — and in the
    // limit the whole object — may still be unresolved expressions. Prop
    // access on an expression yields `undefined`, which compares as
    // changed, so the conservative answer survives either shape.
    const newProps = news as unknown as Record<string, unknown>;
    const changed = createOnlyChangesAtPlan(
      replacementProps(newProps.replaceOnBootstrapChange),
      newProps,
      olds as unknown as Record<string, unknown>,
    );
    if (changed.length > 0) {
      yield* Effect.logDebug("Vultr instance replacement planned").pipe(
        Effect.annotateLogs({ createOnlyProps: changed }),
      );
      return { action: "replace" as const };
    }
    // Mutable inputs only — let the engine's own prop diff decide.
    return undefined;
  }),
  read: Effect.fn(function* ({ output }) {
    if (!output?.id) return undefined;
    const client = yield* yield* VultrClient;
    const response = yield* catchNotFound(client.get<JsonObject>(`/instances/${output.id}`));
    if (!response) return undefined;
    return toAttributes((response.instance ?? response) as JsonObject);
  }),
  reconcile: Effect.fn(function* ({ fqn, news, olds, output }) {
    const client = yield* yield* VultrClient;
    const stack = yield* Stack;
    const stage = yield* Stage;

    // Ownership marker for this logical create attempt. Written on create so a
    // deployment interrupted between `POST /instances` and the state commit can
    // find the VM Vultr already accepted instead of provisioning another one.
    const tag = recoveryTag({ stack: stack.name, stage, fqn, props: news });
    const desiredTags = mergeRecoveryTag(news.tags, tag);

    let live: JsonObject | undefined;
    if (output?.id) {
      const response = yield* catchNotFound(client.get<JsonObject>(`/instances/${output.id}`));
      if (response) {
        live = (response.instance ?? response) as JsonObject;
      }
    }

    // No usable id: before creating, check whether a previous attempt already
    // created this instance (fails closed if more than one VM claims the tag).
    if (!live) {
      live = yield* findOwnedInstance(client, tag, fqn);
      if (live) {
        yield* Effect.logInfo("Recovered a Vultr instance from an interrupted create").pipe(
          Effect.annotateLogs({ fqn, tag, instanceId: String(live.id ?? "") }),
        );
      }
    }

    if (!live) {
      live = yield* createInstanceOnce(client, {
        fqn,
        tag,
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
          tags: desiredTags,
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
    } else {
      // Backstop for the paths that reach an existing VM without a plan
      // diff (adoption, forced updates). Create-only inputs cannot be
      // applied here, so fail loudly rather than return converged attrs.
      yield* guardCreateOnlyDrift(news, olds, String(live.id ?? ""));

      const body = pickChanged(
        {
          plan: news.plan,
          label: news.label,
          enable_ipv6: news.enableIpv6,
          backups: news.backups,
          firewall_group_id: news.firewallGroupId,
          ddos_protection: news.ddosProtection,
        },
        live,
        ["plan", "label", "enable_ipv6", "backups", "firewall_group_id", "ddos_protection"],
      );
      // Tags compare as a set: Vultr does not preserve order, and the desired
      // set always carries the ownership marker alongside the user's tags.
      const liveTags = new Set((live.tags as string[] | undefined) ?? []);
      if (
        desiredTags.length !== liveTags.size ||
        desiredTags.some((desired) => !liveTags.has(desired))
      ) {
        body.tags = desiredTags;
      }
      if (Object.keys(body).length > 0) {
        const updated = yield* client.patch<JsonObject>(`/instances/${live.id}`, { body });
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

    // Refresh for latest status / IPs. A freshly created VM reports the
    // provisioning placeholder `0.0.0.0` for a while, and returning that would
    // publish an unroutable address to every consumer of `mainIp`.
    const ready = yield* waitForInstanceReady(client, String(live.id), {
      requirePublicIpv4: news.disablePublicIpv4 !== true,
      timeout: news.readinessTimeout
        ? Duration.fromInputUnsafe(normalizeDurationInput(news.readinessTimeout))
        : DEFAULT_READINESS_TIMEOUT,
      pollInterval: news.readinessPollInterval
        ? Duration.fromInputUnsafe(normalizeDurationInput(news.readinessPollInterval))
        : DEFAULT_READINESS_POLL_INTERVAL,
    });
    return toAttributes(ready);
  }),
  delete: Effect.fn(function* ({ output }) {
    if (!output.id) return;
    const client = yield* yield* VultrClient;
    yield* catchNotFound(client.del(`/instances/${output.id}`));
  }),
});

export const InstanceProvider = () => Provider.succeed(Instance, instanceLifecycle);
