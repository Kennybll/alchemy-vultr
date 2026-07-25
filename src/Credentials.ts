import { AuthError, getAuthProvider } from "alchemy/Auth/AuthProvider";
import { ALCHEMY_PROFILE, AlchemyProfile } from "alchemy/Auth/Profile";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import {
  VULTR_AUTH_PROVIDER_NAME,
  VultrAuth,
  type VultrAuthConfig,
  type VultrResolvedCredentials,
} from "./AuthProvider.ts";
import { DEFAULT_BASE_URL } from "./internal/constants.ts";

export interface VultrCredentialsService {
  readonly apiKey: Redacted.Redacted<string>;
  readonly baseUrl: string;
}

/**
 * Lazy Vultr credentials. Double-yield in handlers:
 * `const { apiKey } = yield* yield* VultrCredentials`.
 */
export class VultrCredentials extends Context.Service<
  VultrCredentials,
  Effect.Effect<VultrCredentialsService>
>()("Vultr/Credentials") {}

/**
 * Build credentials from a literal API key (tests / CI overrides).
 */
export const fromApiKey = (
  apiKey: string | Redacted.Redacted<string>,
  options?: { readonly baseUrl?: string },
) =>
  Layer.succeed(
    VultrCredentials,
    Effect.succeed({
      apiKey: typeof apiKey === "string" ? Redacted.make(apiKey) : apiKey,
      baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
    }),
  );

/**
 * Build credentials from `VULTR_API_KEY` at resolution time.
 */
export const fromEnv = (options?: { readonly baseUrl?: string }) =>
  Layer.succeed(
    VultrCredentials,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("VULTR_API_KEY");
      return {
        apiKey,
        baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
      };
    }).pipe(Effect.orDie),
  );

/**
 * Resolve credentials through the Alchemy AuthProvider / Profile system.
 */
export const fromAuthProvider = (options?: { readonly baseUrl?: string }) =>
  Layer.effect(
    VultrCredentials,
    Effect.gen(function* () {
      const profile = yield* AlchemyProfile;
      const auth = yield* getAuthProvider<VultrAuthConfig, VultrResolvedCredentials>(
        VULTR_AUTH_PROVIDER_NAME,
      );
      const profileName = yield* ALCHEMY_PROFILE;
      const ci = yield* Config.boolean("CI").pipe(Config.withDefault(false));

      return yield* profile.loadOrConfigure(auth, profileName, { ci }).pipe(
        Effect.flatMap((config) => auth.read(profileName, config as VultrAuthConfig)),
        Effect.map((creds) => ({
          apiKey: creds.apiKey,
          baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
        })),
        Effect.mapError(
          (e) =>
            new AuthError({
              message: `Failed to resolve Vultr credentials for profile '${profileName}': ${(e as { message?: string }).message ?? String(e)}`,
            }),
        ),
        Effect.orDie,
        Effect.cached,
      );
    }),
  );

export { VultrAuth };
