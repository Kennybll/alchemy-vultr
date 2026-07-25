/**
 * Alchemy Effect provider for Vultr.
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
 *     const vpc = yield* Vultr.Vpc("net", {
 *       region: "ewr",
 *       description: "app network",
 *     });
 *     return { vpcId: vpc.id };
 *   }),
 * );
 * ```
 */

export * from "./AuthProvider.ts";
export * from "./Credentials.ts";
export * as Catalog from "./data/Catalog.ts";
export { DEFAULT_BASE_URL, VultrClient } from "./internal/Client.ts";
export type { VultrClientService } from "./internal/Client.ts";
export { VultrApiError, VultrDecodeError } from "./internal/Error.ts";
export type { VultrError } from "./internal/Error.ts";
export * from "./Providers.ts";
export * from "./resources/index.ts";
