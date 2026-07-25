import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { VultrCredentials } from "../Credentials.ts";
import { DEFAULT_BASE_URL } from "./constants.ts";
import {
  VultrApiError,
  VultrConflict,
  VultrDecodeError,
  VultrNotFound,
  VultrRateLimited,
  VultrUnavailable,
  type VultrError,
} from "./Error.ts";
import { withTransientRetry } from "./retry.ts";

export { DEFAULT_BASE_URL };

export interface VultrMeta {
  readonly total?: number;
  readonly links?: {
    readonly next?: string;
    readonly prev?: string;
  };
}

export interface VultrRequestOptions {
  readonly query?: Record<string, string | number | boolean | undefined | null>;
  readonly body?: unknown;
  readonly acceptEmpty?: boolean;
}

export type VultrClientError = VultrError;

export interface VultrClientService {
  readonly baseUrl: string;
  readonly get: <A = unknown>(
    path: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<A, VultrClientError>;
  readonly post: <A = unknown>(
    path: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<A, VultrClientError>;
  readonly put: <A = unknown>(
    path: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<A, VultrClientError>;
  readonly patch: <A = unknown>(
    path: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<A, VultrClientError>;
  readonly del: (
    path: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<void, VultrClientError>;
  readonly listAll: <A>(
    path: string,
    collectionKey: string,
    options?: VultrRequestOptions,
  ) => Effect.Effect<A[], VultrClientError>;
}

/**
 * Lazy Vultr API client. Double-yield in handlers:
 * `const client = yield* yield* VultrClient`.
 */
export class VultrClient extends Context.Service<
  VultrClient,
  Effect.Effect<VultrClientService>
>()("Vultr/Client") {}

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: VultrRequestOptions["query"],
): string => {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const NOT_FOUND_MESSAGE =
  /not found|does not exist|invalid .*id|could not find|no such/i;
const CONFLICT_MESSAGE = /already exists|duplicate|conflict/i;

const classifyHttpError = (input: {
  method: string;
  path: string;
  status: number;
  message: string;
  body?: unknown;
}): VultrClientError => {
  const { method, path, status, message, body } = input;
  if (
    status === 404 ||
    (status === 400 && NOT_FOUND_MESSAGE.test(message))
  ) {
    return new VultrNotFound({ method, path, status, message, body });
  }
  if (status === 409 || CONFLICT_MESSAGE.test(message)) {
    return new VultrConflict({ method, path, status, message, body });
  }
  if (status === 429) {
    return new VultrRateLimited({ method, path, status, message, body });
  }
  if (status === 0 || status >= 500) {
    return new VultrUnavailable({ method, path, status, message, body });
  }
  return new VultrApiError({ method, path, status, message, body });
};

export const makeClient = (
  http: HttpClient.HttpClient,
  apiKey: Redacted.Redacted<string>,
  baseUrl: string,
): VultrClientService => {
  const executeOnce = <A>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: VultrRequestOptions,
  ): Effect.Effect<A, VultrClientError> =>
    Effect.gen(function* () {
      const url = buildUrl(baseUrl, path, options?.query);
      let request = HttpClientRequest.make(method)(url).pipe(
        HttpClientRequest.setHeader(
          "Authorization",
          `Bearer ${Redacted.value(apiKey)}`,
        ),
        HttpClientRequest.acceptJson,
      );

      if (options?.body !== undefined) {
        request = yield* HttpClientRequest.bodyJson(request, options.body).pipe(
          Effect.mapError(
            (cause) =>
              new VultrDecodeError({
                method,
                path,
                message: "Failed to encode request body as JSON",
                cause,
              }),
          ),
        );
      }

      const response = yield* http.execute(request).pipe(
        Effect.mapError(
          (cause) =>
            new VultrUnavailable({
              method,
              path,
              status: 0,
              message: `Transport error calling Vultr API: ${String(cause)}`,
            }),
        ),
      );

      if (response.status < 200 || response.status >= 300) {
        const bodyText = yield* response.text.pipe(
          Effect.catch(() => Effect.succeed("")),
        );
        let body: unknown = bodyText;
        try {
          body = bodyText ? JSON.parse(bodyText) : undefined;
        } catch {
          // keep text
        }
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : bodyText || `Vultr API returned ${response.status}`;

        return yield* classifyHttpError({
          method,
          path,
          status: response.status,
          message,
          body,
        });
      }

      if (method === "DELETE" || response.status === 204) {
        return undefined as A;
      }

      const text = yield* response.text.pipe(
        Effect.mapError(
          (cause) =>
            new VultrDecodeError({
              method,
              path,
              message: "Failed to read Vultr response body",
              cause,
            }),
        ),
      );

      if (text.trim().length === 0) {
        return undefined as A;
      }

      try {
        return JSON.parse(text) as A;
      } catch (cause) {
        return yield* new VultrDecodeError({
          method,
          path,
          message: "Failed to decode Vultr JSON response",
          cause,
        });
      }
    });

  const execute = <A>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: VultrRequestOptions,
  ): Effect.Effect<A, VultrClientError> =>
    withTransientRetry(executeOnce<A>(method, path, options));

  return {
    baseUrl,
    get: (path, options) => execute("GET", path, options),
    post: (path, options) => execute("POST", path, options),
    put: (path, options) => execute("PUT", path, options),
    patch: (path, options) => execute("PATCH", path, options),
    del: (path, options) =>
      execute("DELETE", path, { ...options, acceptEmpty: true }),
    listAll: (path, collectionKey, options) =>
      Effect.gen(function* () {
        const items: unknown[] = [];
        let cursor: string | undefined;
        for (;;) {
          const page = yield* execute<{
            meta?: VultrMeta;
            [key: string]: unknown;
          }>("GET", path, {
            ...options,
            query: {
              ...options?.query,
              per_page: options?.query?.per_page ?? 100,
              ...(cursor ? { cursor } : {}),
            },
          });
          const batch = page[collectionKey];
          if (Array.isArray(batch)) {
            items.push(...batch);
          }
          const next = page.meta?.links?.next;
          if (!next) break;
          try {
            const nextUrl = new URL(next, baseUrl);
            cursor = nextUrl.searchParams.get("cursor") ?? undefined;
          } catch {
            cursor = undefined;
          }
          if (!cursor) break;
        }
        return items as never;
      }),
  };
};

/**
 * Live Vultr client layer. The service value is a cached Effect so
 * credentials resolve lazily on first use (never at Layer construction).
 */
export const VultrClientLive = Layer.effect(
  VultrClient,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const credentialsEffect = yield* VultrCredentials;
    return yield* credentialsEffect.pipe(
      Effect.map((credentials) =>
        makeClient(http, credentials.apiKey, credentials.baseUrl),
      ),
      Effect.orDie,
      Effect.cached,
    );
  }),
);

/**
 * Convenience: catch typed `VultrNotFound` and succeed with `undefined`.
 * Prefer this (or `Effect.catchTag("VultrNotFound", ...)`) over status checks.
 */
export const catchNotFound = <A, R>(
  effect: Effect.Effect<A, VultrClientError, R>,
): Effect.Effect<
  A | undefined,
  Exclude<VultrClientError, VultrNotFound>,
  R
> =>
  effect.pipe(
    Effect.catchTag("VultrNotFound", () => Effect.succeed(undefined)),
  );

/**
 * Convenience: catch typed `VultrConflict` (create races) and succeed with
 * `undefined` so reconcile can fall through to observe.
 */
export const catchConflict = <A, R>(
  effect: Effect.Effect<A, VultrClientError, R>,
): Effect.Effect<
  A | undefined,
  Exclude<VultrClientError, VultrConflict>,
  R
> =>
  effect.pipe(
    Effect.catchTag("VultrConflict", () => Effect.succeed(undefined)),
  );