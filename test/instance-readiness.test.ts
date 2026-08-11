/**
 * Readiness and create-recovery for `Vultr.Instance.Instance`.
 *
 * Vultr reports `main_ip: "0.0.0.0"` while an instance is provisioning, and a
 * create whose response is lost must never provision a second VM. See issue #2.
 */
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { instanceLifecycle } from "../src/Instance/Instance.ts";
import { RECOVERY_TAG_PREFIX, recoveryTag } from "../src/Instance/internal.ts";
import {
  VultrAmbiguousRecovery,
  VultrApiError,
  VultrCreateUncertain,
  VultrNotFound,
  VultrNotReady,
} from "../src/internal/Error.ts";
import { isPublicIpv4 } from "../src/internal/ipv4.ts";
import { type FakeResponse, fakeVultrApi, type RecordedRequest } from "./helpers/fakeClient.ts";

const BASE = {
  region: "ewr",
  plan: "vc2-4c-8gb",
  osId: 2284,
  label: "example-app",
  // Keep unit tests in the millisecond range; production defaults are
  // 15 minutes / 5 seconds for readiness and 2 minutes / 5 seconds for
  // ambiguous-create recovery.
  readinessTimeout: "200 millis",
  readinessPollInterval: "1 millis",
  createRecoveryTimeout: "100 millis",
  createRecoveryPollInterval: "1 millis",
} as const;

const TAG = recoveryTag({
  stack: "test-stack",
  stage: "test",
  fqn: "App",
  props: BASE as never,
});

const instance = (overrides: Record<string, unknown> = {}) => ({
  id: "vm-1",
  region: "ewr",
  plan: "vc2-4c-8gb",
  os_id: 2284,
  label: "example-app",
  main_ip: "0.0.0.0",
  status: "pending",
  server_status: "none",
  tags: [TAG],
  ...overrides,
});

const ACTIVE = instance({ main_ip: "149.28.225.185", status: "active", server_status: "ok" });

const isList = (request: RecordedRequest) =>
  request.method === "GET" && request.path.startsWith("/instances?");

const run = (
  respond: (request: RecordedRequest, index: number) => FakeResponse,
  input: Record<string, unknown> = {},
) => {
  const api = fakeVultrApi(respond);
  const effect = (instanceLifecycle.reconcile as any)({
    id: "App",
    fqn: "App",
    instanceId: "gen-1",
    news: BASE,
    olds: undefined,
    output: undefined,
    session: {},
    bindings: [],
    ...input,
  }).pipe(Effect.provide(api.layer));
  return {
    api,
    attributes: () => Effect.runPromise(effect) as Promise<Record<string, any>>,
    failure: () => Effect.runPromise(Effect.flip(effect)),
  };
};

describe("isPublicIpv4", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.4",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.9",
    "192.0.2.5",
    "192.168.1.10",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "1.2.3",
    "1.2.3.4.5",
    "1.2.3.256",
    "010.0.0.1",
    " 1.2.3.4",
    "2001:db8::1",
    "",
    "not-an-ip",
    undefined,
    null,
    12345,
  ])("rejects %s", (value) => {
    expect(isPublicIpv4(value)).toBe(false);
  });

  it.each(["149.28.225.185", "8.8.8.8", "1.1.1.1", "45.63.1.2"])("accepts %s", (value) => {
    expect(isPublicIpv4(value)).toBe(true);
  });
});

describe("Instance reconcile — readiness", () => {
  it("waits for a public IPv4 instead of returning the provisioning placeholder", async () => {
    let gets = 0;
    const { api, attributes } = run((request) => {
      if (request.method === "POST") return { status: 202, body: { instance: instance() } };
      if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
      gets++;
      // Vultr assigns the address on the third poll.
      return { status: 200, body: { instance: gets < 3 ? instance() : ACTIVE } };
    });

    const result = await attributes();
    expect(result.mainIp).toBe("149.28.225.185");
    expect(gets).toBe(3);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
  });

  it("returns after a single GET when the address is already assigned", async () => {
    const { api, attributes } = run((request) => {
      if (request.method === "POST") return { status: 202, body: { instance: ACTIVE } };
      if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
      return { status: 200, body: { instance: ACTIVE } };
    });

    expect((await attributes()).mainIp).toBe("149.28.225.185");
    expect(api.requests.filter((request) => request.path === "/instances/vm-1")).toHaveLength(1);
  });

  it("does not wait for public IPv4 on a VPC-only instance", async () => {
    const vpcOnly = instance({ internal_ip: "10.1.96.3" });
    const { api, attributes } = run(
      (request) => {
        if (request.method === "POST") return { status: 202, body: { instance: vpcOnly } };
        if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
        return { status: 200, body: { instance: vpcOnly } };
      },
      { news: { ...BASE, disablePublicIpv4: true } },
    );

    const result = await attributes();
    expect(result.mainIp).toBe("0.0.0.0");
    expect(result.internalIp).toBe("10.1.96.3");
    expect(api.calls("GET", "/instances/vm-1")).toHaveLength(1);
  });

  it("fails with a typed, actionable timeout when the address never arrives", async () => {
    const { failure } = run((request) => {
      if (request.method === "POST") return { status: 202, body: { instance: instance() } };
      if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
      return { status: 200, body: { instance: instance() } };
    });

    const error = (await failure()) as VultrNotReady;
    expect(error).toBeInstanceOf(VultrNotReady);
    expect(error.id).toBe("vm-1");
    expect(error.attempts).toBeGreaterThan(1);
    expect(error.lastIp).toBe("0.0.0.0");
    expect(error.status).toBe("pending");
    expect(error.serverStatus).toBe("none");
    expect(error.message).toContain("vm-1");
  });

  it("does not treat a deleted instance as provisioning state", async () => {
    const { failure } = run((request) => {
      if (request.method === "POST") return { status: 202, body: { instance: instance() } };
      if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
      return { status: 404, body: { error: "Instance not found" } };
    });

    expect(await failure()).toBeInstanceOf(VultrNotFound);
  });
});

describe("Instance reconcile — create recovery", () => {
  it("performs exactly one POST while waiting for a lost create to become visible", async () => {
    let created = false;
    let recoveryLists = 0;
    const { api, attributes } = run((request) => {
      if (request.method === "POST" && request.path === "/instances") {
        // Vultr accepted the create; the response never made it back.
        created = true;
        return { status: 503, body: { error: "Service unavailable" } };
      }
      if (isList(request)) {
        if (!created) return { status: 200, body: { instances: [], meta: {} } };
        recoveryLists++;
        // Simulate eventual consistency: several successful tag-filtered lists
        // remain empty after Vultr has accepted the create.
        return {
          status: 200,
          body: { instances: recoveryLists < 4 ? [] : [ACTIVE], meta: {} },
        };
      }
      return { status: 200, body: { instance: ACTIVE } };
    });

    const result = await attributes();
    expect(result.id).toBe("vm-1");
    expect(result.mainIp).toBe("149.28.225.185");
    expect(recoveryLists).toBe(4);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
  });

  it.each([
    [503, "Service unavailable", "VultrUnavailable"],
    [429, "Rate limit exceeded", "VultrRateLimited"],
    [409, "Instance create conflict", "VultrConflict"],
  ] as const)(
    "fails closed after an ambiguous %s response without re-POSTing",
    async (status, message, errorTag) => {
      const { api, failure } = run(
        (request) => {
          if (request.method === "POST") return { status, body: { error: message } };
          return { status: 200, body: { instances: [], meta: {} } };
        },
        {
          news: {
            ...BASE,
            createRecoveryTimeout: "50 millis",
            createRecoveryPollInterval: "1 millis",
          },
        },
      );

      const error = (await failure()) as VultrCreateUncertain;
      expect(error).toBeInstanceOf(VultrCreateUncertain);
      expect(error.fqn).toBe("App");
      expect(error.tag).toBe(TAG);
      expect(error.attempts).toBeGreaterThan(1);
      expect(error.elapsedMillis).toBeGreaterThan(0);
      expect(error.originalError._tag).toBe(errorTag);
      expect(api.calls("POST", "/instances")).toHaveLength(1);
    },
  );

  it("enforces the recovery deadline while ownership lookups retry transient errors", async () => {
    let posted = false;
    const { api, failure } = run(
      (request) => {
        if (request.method === "POST") {
          posted = true;
          return { status: 503, body: { error: "Create response lost" } };
        }
        if (isList(request)) {
          return posted
            ? { status: 503, body: { error: "List unavailable" } }
            : { status: 200, body: { instances: [], meta: {} } };
        }
        return { status: 200, body: { instance: ACTIVE } };
      },
      {
        news: {
          ...BASE,
          createRecoveryTimeout: "50 millis",
          createRecoveryPollInterval: "1 millis",
        },
      },
    );

    const error = (await failure()) as VultrCreateUncertain;
    expect(error).toBeInstanceOf(VultrCreateUncertain);
    expect(error.originalError._tag).toBe("VultrUnavailable");
    // listAll's normal transient retries take several seconds; the recovery
    // deadline interrupts that retry cycle instead of losing create context.
    expect(error.elapsedMillis).toBeLessThan(1_000);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
  });

  it("fails a definite rejection immediately without entering recovery polling", async () => {
    const { api, failure } = run((request) => {
      if (request.method === "POST") {
        return { status: 400, body: { error: "Invalid region" } };
      }
      return { status: 200, body: { instances: [], meta: {} } };
    });

    expect(await failure()).toBeInstanceOf(VultrApiError);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
    // The only list is reconcile's pre-create ownership check. A definite
    // rejection does not start ambiguous-create recovery.
    expect(api.requests.filter(isList)).toHaveLength(1);
  });

  it("treats a successful response without an instance id as accepted-or-unknown", async () => {
    let posted = false;
    let recoveryLists = 0;
    const { api, attributes } = run((request) => {
      if (request.method === "POST") {
        posted = true;
        return { status: 202 };
      }
      if (isList(request)) {
        if (!posted) return { status: 200, body: { instances: [], meta: {} } };
        recoveryLists++;
        return {
          status: 200,
          body: { instances: recoveryLists < 2 ? [] : [ACTIVE], meta: {} },
        };
      }
      return { status: 200, body: { instance: ACTIVE } };
    });

    expect((await attributes()).id).toBe("vm-1");
    expect(recoveryLists).toBe(2);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
  });

  it("fails closed if multiple instances appear during post-create recovery", async () => {
    let posted = false;
    const { api, failure } = run((request) => {
      if (request.method === "POST") {
        posted = true;
        return { status: 503, body: { error: "Service unavailable" } };
      }
      if (isList(request)) {
        return {
          status: 200,
          body: {
            instances: posted ? [ACTIVE, instance({ id: "vm-2" })] : [],
            meta: {},
          },
        };
      }
      return { status: 200, body: { instance: ACTIVE } };
    });

    const error = (await failure()) as VultrAmbiguousRecovery;
    expect(error).toBeInstanceOf(VultrAmbiguousRecovery);
    expect(error.candidateIds).toEqual(["vm-1", "vm-2"]);
    expect(api.calls("POST", "/instances")).toHaveLength(1);
  });

  it("recovers an interrupted create from a later Alchemy generation", async () => {
    // The engine mints a fresh instanceId when it restarts a replacement, so
    // the ownership marker must not be derived from it.
    let posts = 0;
    const { api, attributes } = run(
      (request) => {
        if (request.method === "POST" && request.path === "/instances") {
          posts++;
          return { status: 202, body: { instance: instance() } };
        }
        if (isList(request)) return { status: 200, body: { instances: [ACTIVE], meta: {} } };
        return { status: 200, body: { instance: ACTIVE } };
      },
      { instanceId: "gen-2-after-restart", output: undefined },
    );

    expect((await attributes()).id).toBe("vm-1");
    expect(posts).toBe(0);
    expect(api.calls("POST", "/instances")).toHaveLength(0);
  });

  it("keys recovery on stack/stage/fqn/create-only props, not the generation id", () => {
    const key = (props: Record<string, unknown>, fqn = "App", stage = "test") =>
      recoveryTag({ stack: "test-stack", stage, fqn, props: props as never });

    expect(key({ ...BASE })).toBe(key({ ...BASE, label: "renamed", tags: ["extra"] }));
    expect(key({ ...BASE })).toBe(
      key({
        ...BASE,
        createRecoveryTimeout: "10 minutes",
        createRecoveryPollInterval: "30 seconds",
      }),
    );
    expect(key({ ...BASE })).not.toBe(key({ ...BASE, userData: "changed" }));
    expect(key({ ...BASE })).not.toBe(key({ ...BASE }, "Other"));
    expect(key({ ...BASE })).not.toBe(key({ ...BASE }, "App", "prod"));
  });

  it("fails closed when several instances claim the ownership tag", async () => {
    const { api, failure } = run((request) => {
      if (isList(request)) {
        return {
          status: 200,
          body: { instances: [ACTIVE, instance({ id: "vm-2" })], meta: {} },
        };
      }
      return { status: 200, body: { instance: ACTIVE } };
    });

    const error = (await failure()) as VultrAmbiguousRecovery;
    expect(error).toBeInstanceOf(VultrAmbiguousRecovery);
    expect(error.candidateIds).toEqual(["vm-1", "vm-2"]);
    expect(api.calls("POST", "/instances")).toHaveLength(0);
  });

  it("never adopts an instance that merely matches the server-side tag filter", async () => {
    // A filter the API ignored (or matched loosely) must not widen adoption.
    let posts = 0;
    const { attributes } = run((request) => {
      if (isList(request)) {
        return { status: 200, body: { instances: [instance({ id: "vm-9", tags: [] })], meta: {} } };
      }
      if (request.method === "POST" && request.path === "/instances") {
        posts++;
        return { status: 202, body: { instance: ACTIVE } };
      }
      return { status: 200, body: { instance: ACTIVE } };
    });

    expect((await attributes()).id).toBe("vm-1");
    expect(posts).toBe(1);
  });

  it("keeps user tags alongside the ownership tag", async () => {
    const { api, attributes } = run(
      (request) => {
        if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
        if (request.method === "POST") return { status: 202, body: { instance: ACTIVE } };
        return { status: 200, body: { instance: ACTIVE } };
      },
      { news: { ...BASE, tags: ["team:platform", "env:prod"] } },
    );

    await attributes();
    const tags: string[] = api.calls("POST", "/instances")[0]?.body.tags;
    expect(tags).toContain("team:platform");
    expect(tags).toContain("env:prod");
    expect(tags.filter((tag) => tag.startsWith(RECOVERY_TAG_PREFIX))).toHaveLength(1);
  });

  it("keeps operating on the same physical id for updates and deletes", async () => {
    const { api, attributes } = run(
      (request) => {
        if (isList(request)) return { status: 200, body: { instances: [], meta: {} } };
        return { status: 200, body: { instance: { ...ACTIVE, label: "example-app" } } };
      },
      {
        news: { ...BASE, label: "renamed" },
        olds: BASE,
        output: { id: "vm-1" },
      },
    );

    expect((await attributes()).id).toBe("vm-1");
    expect(api.calls("PATCH", "/instances/vm-1")).toHaveLength(1);
    // An id in state means no discovery list and no create.
    expect(api.calls("POST", "/instances")).toHaveLength(0);
    expect(api.requests.filter(isList)).toHaveLength(0);

    const deleted = fakeVultrApi(() => ({ status: 204 }));
    await Effect.runPromise(
      (instanceLifecycle.delete as any)({
        id: "App",
        fqn: "App",
        instanceId: "gen-1",
        olds: BASE,
        output: { id: "vm-1" },
        session: {},
        bindings: [],
      }).pipe(Effect.provide(deleted.layer)),
    );
    expect(deleted.calls("DELETE")).toEqual([
      { method: "DELETE", path: "/instances/vm-1", body: undefined },
    ]);
  });
});
