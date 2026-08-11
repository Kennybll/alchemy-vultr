/**
 * Alchemy Effect provider for Vultr.
 *
 * Layout mirrors Alchemy's AWS / Cloudflare providers: cross-cutting auth and
 * registration live at the root; each Vultr API surface is a namespaced service
 * (`Vultr.Instance.Instance`, `Vultr.Firewall.Group`, …).
 *
 * @example
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Vultr from "alchemy-vultr";
 * import * as Effect from "effect/Effect";
 *
 * export default Alchemy.Stack(
 *   "App",
 *   { providers: Vultr.providers(), state: Alchemy.localState() },
 *   Effect.gen(function* () {
 *     const vpc = yield* Vultr.Vpc.Vpc("net", {
 *       region: "ewr",
 *       description: "app network",
 *     });
 *     const server = yield* Vultr.Instance.Instance("web", {
 *       region: "ewr",
 *       plan: "vc2-1c-1gb",
 *       osId: 2284,
 *       label: "web",
 *       vpcIds: [vpc.id],
 *     });
 *     return { vpcId: vpc.id, instanceId: server.id };
 *   }),
 * );
 * ```
 */

// ── services (namespaced) ──
export * as ApiKey from "./ApiKey/index.ts";
// ── cross-cutting utilities (flat) ──
export * from "./AuthProvider.ts";
export * as BareMetal from "./BareMetal/index.ts";
export * as BlockStorage from "./BlockStorage/index.ts";
export * as Catalog from "./Catalog/index.ts";
export * as CDN from "./CDN/index.ts";
export * as ContainerRegistry from "./ContainerRegistry/index.ts";
export * from "./Credentials.ts";
export * as Database from "./Database/index.ts";
export * as DNS from "./DNS/index.ts";
export * as Firewall from "./Firewall/index.ts";
export * as Inference from "./Inference/index.ts";
export * as Instance from "./Instance/index.ts";
export * as Iso from "./Iso/index.ts";
export type { VultrClientService } from "./internal/Client.ts";
export { DEFAULT_BASE_URL, VultrClient } from "./internal/Client.ts";
export type { VultrError, VultrLifecycleError } from "./internal/Error.ts";
export {
  VultrAmbiguousRecovery,
  VultrApiError,
  VultrConflict,
  VultrCreateOnlyChange,
  VultrDecodeError,
  VultrInvalidToken,
  VultrNotFound,
  VultrNotReady,
  VultrRateLimited,
  VultrUnauthorizedIp,
  VultrUnavailable,
} from "./internal/Error.ts";
export * as Kubernetes from "./Kubernetes/index.ts";
export * as LoadBalancer from "./LoadBalancer/index.ts";
export * as ObjectStorage from "./ObjectStorage/index.ts";
export * as Oidc from "./Oidc/index.ts";
export * as Organization from "./Organization/index.ts";
export * from "./Providers.ts";
export * as ReservedIp from "./ReservedIp/index.ts";
export * as ReverseDns from "./ReverseDns/index.ts";
export * as Snapshot from "./Snapshot/index.ts";
export * as SshKey from "./SshKey/index.ts";
export * as StartupScript from "./StartupScript/index.ts";
export * as User from "./User/index.ts";
export * as Vfs from "./Vfs/index.ts";
export * as Vpc from "./Vpc/index.ts";
