# alchemy-vultr

Alchemy Effect provider for [Vultr](https://www.vultr.com/api/). Layout and lifecycle rules mirror Alchemy’s AWS / Cloudflare providers and the [resource factory](https://alchemy.run/blog/2026-07-02-cloudflare-resource-factory) / [beta.64](https://alchemy.run/blog/2026-07-22-beta-64/) doctrine.

## Layout

```
src/
  AuthProvider.ts / Credentials.ts / Providers.ts / index.ts
  internal/          # VultrClient, typed errors, CRUD helpers
  Catalog/           # read-only lookups (not stack resources)
  {Service}/         # one folder per Vultr API surface
    index.ts
    {Resource}.ts    # props + attrs + Resource + Provider (co-located)
test/
  client.test.ts     # unit tests (vitest)
  live/              # provider lifecycle tests (bun:test + alchemy/Test/Bun)
processes/Vultr/     # factory catalog / order book
```

Type IDs are `Vultr.<Service>.<Resource>` (e.g. `Vultr.Instance.Instance`). Root exports are namespaced: `export * as Instance from "./Instance"`.

## Reconciler doctrine

`reconcile` is one observe → ensure → sync flow. Do **not** branch `if (output === undefined) create else update`.

1. **Observe** — read live cloud state (treat `output` as a cache for ids only).
2. **Ensure** — if missing, create; catch `VultrConflict` and continue when an id is known.
3. **Sync** — diff observed vs desired; apply only deltas.
4. **Return** — fresh attributes (re-read when needed).

`diff` must guard with `isResolved(news)`. Delete must be idempotent via `Effect.catchTag("VultrNotFound", …)` / `catchNotFound`.

## Typed error doctrine

`VultrClient` classifies HTTP failures into tagged errors:

| Tag | When |
| --- | --- |
| `VultrNotFound` | 404 / “not found” style 400 |
| `VultrConflict` | 409 / already-exists races |
| `VultrRateLimited` | 429 (retried) |
| `VultrUnavailable` | 5xx / transport (retried) |
| `VultrApiError` | other non-2xx |
| `VultrDecodeError` | malformed JSON |

**Required:** `Effect.catchTag("VultrNotFound", …)`.  
**Forbidden:** regex/`status === 404` predicates in resource code. Extend classification in `src/internal/Client.ts` when the API surprises you — that is this provider’s “SDK patch”.

## beta.64 prop conventions

- Sensitive props/attrs (`password`, `apiKey`, `clientSecret`, `token`, `s3SecretKey`, `defaultPassword`, …) are `Redacted.Redacted<string>` (or `string | Redacted` on inputs with `reveal()` at the wire boundary).
- Duration-like props accept `Duration.Input` (`"30 seconds"`, `Duration.hours(1)`) and convert with `src/internal/duration.ts`.
- Optional names/labels use `createPhysicalName` from `alchemy` when the API allows omission.

## Tests

- Unit: `bun run test` (vitest) — client + helpers.
- Live: `bun run test:live` — requires `VULTR_API_KEY`. Shape: `stack.destroy()` → deploy → out-of-band `VultrClient` verify → update → destroy → prove gone. Bound retries; skipIf-gate expensive entitlements.

## Factory catalog

Track coverage under `processes/Vultr/`. Statuses: `implemented | partial | missing | out-of-scope`. Prefer improving the client’s typed errors over untyped catches in resources.
