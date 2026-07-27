import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { describe, expect, it } from "vitest";
import { fromApiKey } from "../src/Credentials.ts";
import { catchNotFound, makeClient, VultrClient, VultrClientLive } from "../src/internal/Client.ts";
import { compact, pickChanged, resourceId } from "../src/internal/defineResource.ts";
import {
  VultrApiError,
  VultrInvalidToken,
  VultrNotFound,
  VultrRateLimited,
  VultrUnauthorizedIp,
} from "../src/internal/Error.ts";
import { listAcrossParents } from "../src/internal/listAcross.ts";

describe("helpers", () => {
  it("compacts undefined fields", () => {
    expect(compact({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("picks changed fields", () => {
    expect(
      pickChanged({ name: "new", label: "same" }, { name: "old", label: "same" }, [
        "name",
        "label",
      ]),
    ).toEqual({ name: "new" });
  });

  it("extracts resource ids", () => {
    expect(resourceId("abc")).toBe("abc");
    expect(resourceId({ id: "xyz" })).toBe("xyz");
    expect(resourceId({ domain: "example.com" }, "domain")).toBe("example.com");
  });
});

describe("VultrClient", () => {
  it("builds an authenticated client service", async () => {
    const calls: Array<{ url: string; auth?: string }> = [];
    const http = {
      execute: (request: { url: string; headers: Record<string, string> }) => {
        calls.push({
          url: request.url,
          auth: request.headers.authorization ?? request.headers.Authorization,
        });
        return Effect.succeed({
          status: 200,
          text: Effect.succeed(JSON.stringify({ ssh_keys: [], meta: {} })),
          json: Effect.succeed({ ssh_keys: [], meta: {} }),
        });
      },
    };

    const client = makeClient(http as never, Redacted.make("test-key"), "https://api.vultr.com/v2");

    const result = await Effect.runPromise(client.get<{ ssh_keys: unknown[] }>("/ssh-keys"));
    expect(result.ssh_keys).toEqual([]);
    expect(calls[0]?.auth).toBe("Bearer test-key");
    expect(calls[0]?.url).toContain("/ssh-keys");
  });

  it("maps 404 responses to VultrNotFound", async () => {
    const http = {
      execute: () =>
        Effect.succeed({
          status: 404,
          text: Effect.succeed(JSON.stringify({ error: "Not found" })),
          json: Effect.succeed({ error: "Not found" }),
        }),
    };
    const client = makeClient(http as never, Redacted.make("test-key"), "https://api.vultr.com/v2");

    const error = await Effect.runPromise(client.get("/missing").pipe(Effect.flip));
    expect(error).toBeInstanceOf(VultrNotFound);
    expect((error as VultrNotFound).status).toBe(404);

    const missing = await Effect.runPromise(catchNotFound(client.get("/missing")));
    expect(missing).toBeUndefined();
  });

  it("maps 429 responses to VultrRateLimited", async () => {
    const http = {
      execute: () =>
        Effect.succeed({
          status: 429,
          text: Effect.succeed(JSON.stringify({ error: "Slow down" })),
          json: Effect.succeed({ error: "Slow down" }),
        }),
    };
    const client = makeClient(http as never, Redacted.make("test-key"), "https://api.vultr.com/v2");

    // Retries exhaust, then surface the typed tag.
    const error = await Effect.runPromise(client.get("/throttled").pipe(Effect.flip));
    expect(error).toBeInstanceOf(VultrRateLimited);
  });

  it("maps unauthorized IP and invalid token 401s", async () => {
    const ipHttp = {
      execute: () =>
        Effect.succeed({
          status: 401,
          text: Effect.succeed(
            JSON.stringify({
              error: "Unauthorized IP address: 1.2.3.4",
              status: 401,
            }),
          ),
          json: Effect.succeed({}),
        }),
    };
    const ipClient = makeClient(
      ipHttp as never,
      Redacted.make("test-key"),
      "https://api.vultr.com/v2",
    );
    const ipError = await Effect.runPromise(ipClient.get("/account").pipe(Effect.flip));
    expect(ipError).toBeInstanceOf(VultrUnauthorizedIp);
    expect((ipError as VultrUnauthorizedIp).ip).toBe("1.2.3.4");

    const tokenHttp = {
      execute: () =>
        Effect.succeed({
          status: 401,
          text: Effect.succeed(JSON.stringify({ error: "Invalid API token.", status: 401 })),
          json: Effect.succeed({}),
        }),
    };
    const tokenClient = makeClient(
      tokenHttp as never,
      Redacted.make("bad"),
      "https://api.vultr.com/v2",
    );
    const tokenError = await Effect.runPromise(tokenClient.get("/account").pipe(Effect.flip));
    expect(tokenError).toBeInstanceOf(VultrInvalidToken);
  });

  it("maps other non-2xx responses to VultrApiError", async () => {
    const http = {
      execute: () =>
        Effect.succeed({
          status: 400,
          text: Effect.succeed(JSON.stringify({ error: "Bad request" })),
          json: Effect.succeed({ error: "Bad request" }),
        }),
    };
    const client = makeClient(http as never, Redacted.make("test-key"), "https://api.vultr.com/v2");

    const error = await Effect.runPromise(client.get("/bad").pipe(Effect.flip));
    expect(error).toBeInstanceOf(VultrApiError);
    expect((error as VultrApiError).status).toBe(400);
  });

  it("provides a live layer over credentials", async () => {
    const layer = VultrClientLive.pipe(
      Layer.provide(fromApiKey("layer-key")),
      Layer.provide(FetchHttpClient.layer),
    );

    const program = Effect.gen(function* () {
      const client = yield* yield* VultrClient;
      return client.baseUrl;
    }).pipe(Effect.provide(layer));

    await expect(Effect.runPromise(program)).resolves.toBe("https://api.vultr.com/v2");
  });

  it("lists children across parents for nuke", async () => {
    const calls: string[] = [];
    const http = {
      execute: (request: { url: string }) => {
        calls.push(request.url);
        if (request.url.includes("/firewalls?") || request.url.endsWith("/firewalls")) {
          return Effect.succeed({
            status: 200,
            text: Effect.succeed(
              JSON.stringify({
                firewall_groups: [{ id: "g1" }, { id: "g2" }],
                meta: {},
              }),
            ),
            json: Effect.succeed({}),
          });
        }
        if (request.url.includes("/firewalls/g1/rules")) {
          return Effect.succeed({
            status: 200,
            text: Effect.succeed(
              JSON.stringify({
                firewall_rules: [{ id: "r1", action: "accept", port: "22", notes: "" }],
                meta: {},
              }),
            ),
            json: Effect.succeed({}),
          });
        }
        if (request.url.includes("/firewalls/g2/rules")) {
          return Effect.succeed({
            status: 200,
            text: Effect.succeed(JSON.stringify({ firewall_rules: [], meta: {} })),
            json: Effect.succeed({}),
          });
        }
        return Effect.succeed({
          status: 404,
          text: Effect.succeed(JSON.stringify({ error: "Not found" })),
          json: Effect.succeed({}),
        });
      },
    };

    const client = makeClient(http as never, Redacted.make("test-key"), "https://api.vultr.com/v2");

    const items = await Effect.runPromise(
      listAcrossParents({
        parentPath: "/firewalls",
        parentKey: "firewall_groups",
        childPath: (id) => `/firewalls/${id}/rules`,
        childKey: "firewall_rules",
        map: (live, firewallGroupId) => ({
          id: String(live.id),
          firewallGroupId,
        }),
      }).pipe(Effect.provideService(VultrClient, Effect.succeed(client))),
    );

    expect(items).toEqual([{ id: "r1", firewallGroupId: "g1" }]);
    expect(calls.some((url) => url.includes("/firewalls"))).toBe(true);
  });
});
