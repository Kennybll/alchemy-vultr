/**
 * Instance lifecycle helpers that are unit-tested directly.
 *
 * Not re-exported from `src/Instance/index.ts` — this is provider-internal.
 */
import { isResolved } from "alchemy/Diff";
import type { InstanceProps } from "./Instance.ts";

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
