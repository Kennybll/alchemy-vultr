/**
 * In-memory Vultr API double for provider unit tests.
 *
 * Requests go through the real {@link makeClient} so error classification and
 * transient-retry behaviour are exercised; only the transport is faked.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { makeClient, VultrClient, type VultrClientService } from "../../src/internal/Client.ts";

export interface RecordedRequest {
  readonly method: string;
  /** Path + query, e.g. `/instances?tag=alchemy-vultr-recover-abc`. */
  readonly path: string;
  readonly body: any;
}

export interface FakeResponse {
  readonly status: number;
  readonly body?: unknown;
}

export type Responder = (request: RecordedRequest, callIndex: number) => FakeResponse;

const BASE_URL = "https://api.vultr.com/v2";

const decodeBody = (body: unknown): any => {
  if (body == null || typeof body !== "object") return undefined;
  const inner = (body as { body?: unknown }).body;
  if (typeof inner === "string") {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  if (inner instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(inner));
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export interface FakeVultrApi {
  readonly client: VultrClientService;
  readonly layer: Layer.Layer<VultrClient>;
  readonly requests: RecordedRequest[];
  /** Requests matching a method (and optionally a path prefix). */
  readonly calls: (method: string, pathPrefix?: string) => RecordedRequest[];
}

/**
 * Build a fake Vultr API from a responder. The responder receives every
 * request plus the number of preceding requests, so tests can script
 * sequences ("first GET reports 0.0.0.0, the next one reports a real IP").
 */
export const fakeVultrApi = (respond: Responder): FakeVultrApi => {
  const requests: RecordedRequest[] = [];
  const http = {
    execute: (request: { method: string; url: string; body?: unknown }) => {
      const url = new URL(request.url);
      const recorded: RecordedRequest = {
        method: request.method,
        path: `${url.pathname.replace("/v2", "")}${url.search}`,
        body: decodeBody(request.body),
      };
      const index = requests.length;
      requests.push(recorded);
      const response = respond(recorded, index);
      const text = response.body === undefined ? "" : JSON.stringify(response.body);
      return Effect.succeed({
        status: response.status,
        text: Effect.succeed(text),
        json: Effect.succeed(response.body ?? {}),
      });
    },
  };

  const client = makeClient(http as never, Redacted.make("test-key"), BASE_URL);
  return {
    client,
    layer: Layer.succeed(VultrClient, Effect.succeed(client)),
    requests,
    calls: (method, pathPrefix) =>
      requests.filter(
        (request) =>
          request.method === method && (!pathPrefix || request.path.startsWith(pathPrefix)),
      ),
  };
};
