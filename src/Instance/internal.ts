/**
 * Instance lifecycle helpers that are unit-tested directly.
 *
 * Not re-exported from `src/Instance/index.ts` — this is provider-internal.
 */
import { createHash } from "node:crypto";
import { isResolved } from "alchemy/Diff";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type { VultrClientService } from "../internal/Client.ts";
import type { JsonObject } from "../internal/defineResource.ts";
import { VultrAmbiguousRecovery, type VultrError, VultrNotReady } from "../internal/Error.ts";
import { isPublicIpv4 } from "../internal/ipv4.ts";
import type { InstanceProps } from "./Instance.ts";

const RESOURCE_TYPE = "Vultr.Instance.Instance";

/**
 * Inputs that identify the physical VM. Vultr cannot move a running instance
 * to another region, hostname, or image, so a change replaces it — the same
 * fields the official Terraform provider marks `ForceNew`.
 */
export const IDENTITY_PROPS = [
  "region",
  "hostname",
  "osId",
  "appId",
  "imageId",
  "snapshotId",
  "isoId",
] as const satisfies ReadonlyArray<keyof InstanceProps>;

/**
 * Inputs Vultr only consumes while the VM is being provisioned (cloud-init,
 * first-boot startup script, injected SSH keys, IPv4 layout, marketplace app
 * variables). There is no API that re-applies them to a running instance:
 * `PATCH /instances/{id}` either ignores them or stores them for the *next*
 * rebuild, so converging them in place would claim a convergence that never
 * physically happened.
 *
 * Terraform's `vultr` provider marks every one of these `ForceNew`:
 * https://github.com/vultr/terraform-provider-vultr/blob/main/vultr/resource_vultr_instance.go
 */
export const BOOTSTRAP_PROPS = [
  "userData",
  "sshKeyIds",
  "scriptId",
  "disablePublicIpv4",
  "reservedIpv4",
  "userScheme",
  "appVariables",
  "bootstrapVersion",
] as const satisfies ReadonlyArray<keyof InstanceProps>;

export const CREATE_ONLY_PROPS = [...IDENTITY_PROPS, ...BOOTSTRAP_PROPS];

export type CreateOnlyProp = (typeof CREATE_ONLY_PROPS)[number];

/** Props whose element order carries no meaning (Terraform models them as sets). */
const SET_LIKE_PROPS = new Set<string>(["sshKeyIds", "vpcIds"]);

const canonicalize = (value: unknown, sortArrays: boolean): unknown => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item, sortArrays));
    return sortArrays
      ? [...items].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
      : items;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, entry]) => [key, canonicalize(entry, sortArrays)]),
    );
  }
  return value;
};

/**
 * Deterministic JSON for comparison and hashing: object keys sorted, and
 * (optionally) array order normalized. `undefined` and `null` collapse so an
 * omitted prop compares equal to an explicit `null`.
 */
export const canonicalJson = (
  value: unknown,
  options?: { readonly sortArrays?: boolean },
): string => JSON.stringify(canonicalize(value, options?.sortArrays ?? false));

const sameCreateOnlyValue = (prop: string, next: unknown, prev: unknown): boolean => {
  const sortArrays = SET_LIKE_PROPS.has(prop);
  return canonicalJson(next, { sortArrays }) === canonicalJson(prev, { sortArrays });
};

/**
 * Whether create-only inputs plan a replacement for this instance.
 *
 * Reads defensively: during `diff` the flag itself may still be an unresolved
 * Output, and the conservative answer is "yes, replace" — never "converge in
 * place with an input we cannot apply".
 */
export const replacesOnBootstrapChange = (replaceOnBootstrapChange: unknown): boolean =>
  isResolved(replaceOnBootstrapChange) ? replaceOnBootstrapChange !== false : true;

/** The create-only props this instance treats as replacement inputs. */
export const replacementProps = (
  replaceOnBootstrapChange: unknown,
): ReadonlyArray<CreateOnlyProp> =>
  replacesOnBootstrapChange(replaceOnBootstrapChange) ? CREATE_ONLY_PROPS : IDENTITY_PROPS;

/**
 * Create-only props that differ between resolved desired props and the
 * previously deployed props.
 */
export const createOnlyChanges = (
  props: ReadonlyArray<CreateOnlyProp>,
  news: Record<string, unknown>,
  olds: Record<string, unknown>,
): CreateOnlyProp[] => props.filter((prop) => !sameCreateOnlyValue(prop, news[prop], olds[prop]));

/**
 * Plan-time variant of {@link createOnlyChanges}.
 *
 * A replacement-sensitive input that is still an unresolved Output counts as
 * changed. Alchemy falls back to `havePropsChanged` (→ `update`) whenever
 * `diff` returns nothing, so short-circuiting on unresolved inputs is exactly
 * how a create-only change silently downgrades to an in-place update. This
 * mirrors Terraform, where a `ForceNew` attribute that is "known after apply"
 * plans a replacement.
 */
export const createOnlyChangesAtPlan = (
  props: ReadonlyArray<CreateOnlyProp>,
  news: Record<string, unknown>,
  olds: Record<string, unknown>,
): CreateOnlyProp[] =>
  props.filter((prop) =>
    isResolved(news[prop]) ? !sameCreateOnlyValue(prop, news[prop], olds[prop]) : true,
  );

// ── create recovery ───────────────────────────────────────────────────────────

/**
 * Prefix of the provider-owned tag that lets a restarted deployment find an
 * instance whose `POST /instances` was accepted but never recorded.
 */
export const RECOVERY_TAG_PREFIX = "alchemy-vultr-recover-";

/**
 * Tag identifying *this logical create attempt*.
 *
 * Derived from stack + stage + resource FQN + the resolved create-only props,
 * deliberately **not** from Alchemy's `instanceId`: a replacement that is
 * interrupted and re-planned mints a fresh generation id, and recovery keyed to
 * the old generation would miss the VM Vultr already accepted. Mutable props
 * (label, tags, plan, …) are excluded so ordinary drift never invalidates the
 * key — the update path converges those against the recovered instance.
 */
export const recoveryTag = (input: {
  readonly stack: string;
  readonly stage: string;
  readonly fqn: string;
  readonly props: InstanceProps;
}): string => {
  const props = input.props as unknown as Record<string, unknown>;
  const identity = Object.fromEntries(
    replacementProps(props.replaceOnBootstrapChange).map((prop) => [prop, props[prop] ?? null]),
  );
  const digest = createHash("sha256")
    .update(
      canonicalJson(
        { stack: input.stack, stage: input.stage, fqn: input.fqn, identity },
        { sortArrays: true },
      ),
    )
    .digest("hex")
    .slice(0, 32);
  return `${RECOVERY_TAG_PREFIX}${digest}`;
};

/** Desired tag set: everything the user asked for, plus the ownership marker. */
export const mergeRecoveryTag = (
  tags: ReadonlyArray<string> | undefined,
  tag: string,
): string[] => {
  const merged = (tags ?? []).filter(
    (existing) => existing === tag || !existing.startsWith(RECOVERY_TAG_PREFIX),
  );
  return merged.includes(tag) ? [...merged] : [...merged, tag];
};

/**
 * Find the instance this resource already created, if any.
 *
 * Fails closed when several instances carry the marker: silently picking one
 * would orphan a running VM, or hand the engine an id that garbage collection
 * then deletes.
 */
export const findOwnedInstance = Effect.fn(function* (
  client: VultrClientService,
  tag: string,
  fqn: string,
) {
  // The `tag` filter is server-side, but re-check locally so an ignored or
  // fuzzy-matched query parameter can never widen adoption.
  const items = yield* client.listAll<JsonObject>("/instances", "instances", { query: { tag } });
  const owned = items.filter(
    (item) => Array.isArray(item.tags) && (item.tags as string[]).includes(tag),
  );
  if (owned.length > 1) {
    return yield* new VultrAmbiguousRecovery({
      resourceType: RESOURCE_TYPE,
      fqn,
      tag,
      candidateIds: owned.map((item) => String(item.id ?? "")),
      message:
        `${owned.length} Vultr instances carry the ownership tag ${tag} for ${fqn} ` +
        `(${owned.map((item) => String(item.id ?? "")).join(", ")}). Delete or retag the ` +
        "instances that are not managed by this resource, then deploy again.",
    });
  }
  return owned[0];
});

/** Create failures that leave it unknown whether Vultr accepted the request. */
const isAmbiguousCreateFailure = (error: VultrError): boolean =>
  error._tag === "VultrUnavailable" ||
  error._tag === "VultrRateLimited" ||
  error._tag === "VultrConflict";

/**
 * Create an instance at most once per accepted request.
 *
 * `client.post` retries transient failures internally, which for a create can
 * provision several VMs from one reconcile. This uses the single-attempt
 * `postOnce` and, after every ambiguous failure, looks for the instance the
 * lost request may already have created before it considers posting again.
 */
export const createInstanceOnce = Effect.fn(function* (
  client: VultrClientService,
  input: {
    readonly body: JsonObject;
    readonly tag: string;
    readonly fqn: string;
    readonly attempts?: number;
    readonly backoff?: Duration.Duration;
  },
) {
  const attempts = input.attempts ?? 3;
  const backoff = input.backoff ?? Duration.seconds(2);
  let lastError: VultrError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = yield* client.postOnce<JsonObject>("/instances", { body: input.body }).pipe(
      Effect.map((created) => ({ created, error: undefined as VultrError | undefined })),
      Effect.catch((error: VultrError) =>
        Effect.succeed({ created: undefined as JsonObject | undefined, error }),
      ),
    );
    if (outcome.created) {
      return (outcome.created.instance ?? outcome.created) as JsonObject;
    }
    const error = outcome.error as VultrError;
    if (!isAmbiguousCreateFailure(error)) return yield* error;
    lastError = error;

    yield* Effect.logWarning("Vultr instance create failed ambiguously — checking for a VM").pipe(
      Effect.annotateLogs({ fqn: input.fqn, attempt, tag: input.tag, error: error._tag }),
    );
    const recovered = yield* findOwnedInstance(client, input.tag, input.fqn);
    if (recovered) return recovered;
    if (attempt < attempts) yield* Effect.sleep(backoff);
  }
  return yield* lastError as VultrError;
});

// ── readiness ─────────────────────────────────────────────────────────────────

export interface ReadinessOptions {
  /** Wait for a routable public IPv4 (false for `disablePublicIpv4` VMs). */
  readonly requirePublicIpv4: boolean;
  /** Hard bound on the total wait. */
  readonly timeout: Duration.Duration;
  /** Cap on the exponential poll backoff. */
  readonly pollInterval: Duration.Duration;
}

export const DEFAULT_READINESS_TIMEOUT = Duration.minutes(15);
export const DEFAULT_READINESS_POLL_INTERVAL = Duration.seconds(5);

const getInstance = (client: VultrClientService, id: string) =>
  client
    .get<JsonObject>(`/instances/${id}`)
    .pipe(Effect.map((response) => (response.instance ?? response) as JsonObject));

/**
 * Poll `GET /instances/{id}` until Vultr reports a usable address.
 *
 * Only the "still provisioning" condition is retried here — authentication,
 * authorization, not-found, and decode failures fail immediately, and the
 * client owns retries for transient HTTP failures.
 */
export const waitForInstanceReady = Effect.fn(function* (
  client: VultrClientService,
  id: string,
  options: ReadinessOptions,
) {
  const timeoutMillis = Duration.toMillis(options.timeout);
  const capMillis = Math.max(1, Duration.toMillis(options.pollInterval));
  let delayMillis = Math.min(1_000, capMillis);
  let waitedMillis = 0;
  let attempt = 0;

  while (true) {
    attempt++;
    const live = yield* getInstance(client, id);
    const mainIp = String(live.main_ip ?? "");
    if (!options.requirePublicIpv4 || isPublicIpv4(mainIp)) return live;

    const annotations = {
      instanceId: id,
      attempt,
      mainIp,
      status: String(live.status ?? ""),
      serverStatus: String(live.server_status ?? ""),
      waitedMillis,
    };
    if (waitedMillis + delayMillis > timeoutMillis) {
      return yield* new VultrNotReady({
        resourceType: RESOURCE_TYPE,
        id,
        attempts: attempt,
        waitedMillis,
        lastIp: mainIp,
        status: annotations.status,
        serverStatus: annotations.serverStatus,
        message:
          `Vultr instance ${id} still reports main_ip "${mainIp}" after ${attempt} checks over ` +
          `${Duration.format(Duration.millis(waitedMillis))} (status ${annotations.status}, ` +
          `server_status ${annotations.serverStatus}). Publishing that address would break every ` +
          "consumer of mainIp; raise readinessTimeout, or set disablePublicIpv4 for a VPC-only VM.",
      });
    }
    yield* Effect.logInfo("Waiting for Vultr to assign a public IPv4").pipe(
      Effect.annotateLogs(annotations),
    );
    yield* Effect.sleep(Duration.millis(delayMillis));
    waitedMillis += delayMillis;
    delayMillis = Math.min(capMillis, delayMillis * 2);
  }
});
