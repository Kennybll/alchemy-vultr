import {
  AuthError,
  AuthProviderLayer,
  type ConfigureContext,
} from "alchemy/Auth/AuthProvider";
import { CredentialsStore, displayRedacted } from "alchemy/Auth/Credentials";
import { getEnvRedacted, retryOnce } from "alchemy/Auth/Env";
import { AlchemyProfile } from "alchemy/Auth/Profile";
import * as Clank from "alchemy/Util/Clank";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Redacted from "effect/Redacted";

export const VULTR_AUTH_PROVIDER_NAME = "Vultr";
const STORAGE_KEY = "vultr-stored";

export type VultrAuthConfig = { method: "env" } | { method: "stored" };

export type VultrStoredCredentials = {
  type: "apiKey";
  apiKey: string;
};

export type VultrResolvedCredentials = {
  type: "apiKey";
  apiKey: Redacted.Redacted<string>;
  source: { type: VultrAuthConfig["method"]; details?: string };
};

const options: Array<{
  value: VultrAuthConfig["method"];
  label: string;
  hint?: string;
}> = [
  {
    value: "env",
    label: "Environment Variable",
    hint: "VULTR_API_KEY",
  },
  {
    value: "stored",
    label: "API Key",
    hint: "enter interactively, stored in ~/.alchemy/credentials",
  },
];

/**
 * Layer that registers the Vultr {@link AuthProvider} into the
 * Alchemy AuthProviders registry for `alchemy login`.
 */
export const VultrAuth = AuthProviderLayer<
  VultrAuthConfig,
  VultrResolvedCredentials
>()(
  VULTR_AUTH_PROVIDER_NAME,
  Effect.gen(function* () {
    const profiles = yield* AlchemyProfile;
    const store = yield* CredentialsStore;

    const loginStored = Effect.fn(function* (profileName: string) {
      const apiKey = yield* Clank.password({
        message: "Vultr API Key",
        validate: (v) => (v.length === 0 ? "Required" : undefined),
      }).pipe(retryOnce);

      yield* store.write<VultrStoredCredentials>(profileName, STORAGE_KEY, {
        type: "apiKey",
        apiKey,
      });
      yield* Clank.success("Vultr: credentials saved.");
      return { method: "stored" as const };
    });

    const configureInteractive = (profileName: string) =>
      Clank.select({
        message: "Vultr authentication method",
        options,
      }).pipe(
        Effect.flatMap((method) =>
          Match.value(method).pipe(
            Match.when("env", () => Effect.succeed({ method: "env" as const })),
            Match.when("stored", () => loginStored(profileName)),
            Match.exhaustive,
          ),
        ),
      );

    const configureCredentials = (profileName: string, ctx: ConfigureContext) =>
      Effect.gen(function* () {
        if (ctx.ci) {
          return { method: "env" as const };
        }
        return yield* configureInteractive(profileName);
      }).pipe(
        Effect.mapError(
          (e) =>
            new AuthError({
              message: "failed to configure credentials",
              cause: e,
            }),
        ),
      );

    const resolveCredentials = (
      profileName: string,
      config: VultrAuthConfig,
    ): Effect.Effect<VultrResolvedCredentials, AuthError> =>
      Match.value(config).pipe(
        Match.when(
          { method: "env" },
          Effect.fn(function* () {
            const apiKey = yield* getEnvRedacted("VULTR_API_KEY");
            if (!apiKey) {
              return yield* new AuthError({
                message: "Vultr env credentials not found. Set VULTR_API_KEY.",
              });
            }
            return {
              type: "apiKey" as const,
              apiKey,
              source: { type: "env" as const, details: "VULTR_API_KEY" },
            };
          }),
        ),
        Match.when({ method: "stored" }, () =>
          store.read<VultrStoredCredentials>(profileName, STORAGE_KEY).pipe(
            Effect.flatMap((creds) =>
              creds == null
                ? Effect.fail(
                    new AuthError({
                      message:
                        "Vultr stored credentials not found. Run: alchemy login --configure",
                    }),
                  )
                : Effect.succeed({
                    type: "apiKey" as const,
                    apiKey: Redacted.make(creds.apiKey),
                    source: { type: "stored" as const },
                  }),
            ),
          ),
        ),
        Match.exhaustive,
      );

    const logout = (profileName: string, config: VultrAuthConfig) =>
      Match.value(config).pipe(
        Match.when({ method: "env" }, () => Effect.void),
        Match.when({ method: "stored" }, () =>
          store
            .delete(profileName, STORAGE_KEY)
            .pipe(
              Effect.andThen(
                Clank.success("Vultr: stored credentials removed"),
              ),
            ),
        ),
        Match.exhaustive,
      );

    const login = (profileName: string, config: VultrAuthConfig) =>
      Match.value(config)
        .pipe(
          Match.when({ method: "env" }, () =>
            getEnvRedacted("VULTR_API_KEY").pipe(
              Effect.flatMap((apiKey) =>
                apiKey
                  ? Effect.void
                  : Effect.gen(function* () {
                      const next = yield* configureInteractive(profileName);
                      const existing = yield* profiles.getProfile(profileName);
                      yield* profiles.setProfile(profileName, {
                        ...existing,
                        [VULTR_AUTH_PROVIDER_NAME]: next,
                      });
                    }),
              ),
            ),
          ),
          Match.when({ method: "stored" }, () =>
            store
              .read<VultrStoredCredentials>(profileName, STORAGE_KEY)
              .pipe(
                Effect.flatMap((creds) =>
                  creds == null ? loginStored(profileName) : Effect.void,
                ),
              ),
          ),
          Match.exhaustive,
        )
        .pipe(
          Effect.mapError(
            (e) => new AuthError({ message: "login failed", cause: e }),
          ),
        );

    const prettyPrint = (profileName: string, config: VultrAuthConfig) =>
      resolveCredentials(profileName, config).pipe(
        Effect.tap((creds) => {
          const sourceStr = creds.source.details
            ? `${creds.source.type} - ${creds.source.details}`
            : creds.source.type;
          return Effect.all([
            Console.log(`  apiKey: ${displayRedacted(creds.apiKey, 8)}`),
            Console.log(`  source: ${sourceStr}`),
          ]);
        }),
        Effect.catch((e) =>
          Console.error(`  Failed to retrieve credentials: ${e}`),
        ),
      );

    return {
      configure: configureCredentials,
      logout,
      login,
      prettyPrint,
      read: resolveCredentials,
    };
  }),
);
