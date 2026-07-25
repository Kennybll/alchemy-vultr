# Vultr API: OpenAPI / docs vs live behavior

Notes from live probes against `https://api.vultr.com/v2` while bringing up
`alchemy-vultr` (factory-style deploy → out-of-band verify → destroy).

Sources compared: [Vultr API docs](https://www.vultr.com/api/), generated
OpenAPI clients (e.g. vultr-csharp), and live responses from this environment
(2026-07-25).

## Authentication

| Behavior | OpenAPI / docs | Live |
| --- | --- | --- |
| Missing/invalid token | Generic `401` | `{ "error": "Invalid API token.", "status": 401 }` |
| Token OK, IP not allowlisted | Often undocumented as a distinct case; looks like generic `401` | `{ "error": "Unauthorized IP address: <ip>", "status": 401 }` |
| Account API access control | Portal setting; not modeled as a typed error in most OpenAPI exports | Distinct message — we map it to `VultrUnauthorizedIp` (with parsed `ip`) vs `VultrInvalidToken` |

### IP allowlisting + ephemeral egress

Cloud agent / CI runners rotate public egress IPs (this environment observed
many different AWS addresses in one session). If the Vultr API key has IP
allowlisting enabled, authenticated calls intermittently fail with
`Unauthorized IP address: …` even when the key is valid.

**For live tests:** either disable IP allowlisting on the key, or allowlist
every egress address the runner may use (impractical for cloud agents).

Public catalog endpoints (`/regions`, `/plans`, `/os`, …) succeed without a
usable allowlisted IP.

Env credentials for Alchemy auth require `CI=1` (or an interactive
`alchemy login`) — see `Credentials.fromAuthProvider`.

## Catalog / meta endpoints

| Topic | OpenAPI / docs | Live |
| --- | --- | --- |
| `GET /regions` | Region objects with id/city/country/options | Also returns `connectivity: string[]` (e.g. `public_ip`, `private_ip`) |
| `GET /plans` | Plan cost fields | Includes `hourly_cost`, `monthly_cost_preemptible`, `hourly_cost_preemptible`, `invoice_type` |
| `GET /plans-metal` | Collection name varies in older clients | Wire key is **`plans_metal`** (not `plans`) |
| `GET /kubernetes/versions` | Often shown as semver strings | Strings include a build suffix: `v1.36.1+3` |
| `GET /object-storage/clusters` | Auth assumed | **Public** (200 without token) |
| `GET /object-storage/tiers?cluster_id=` | Same auth as clusters | **Requires auth** (401 `Invalid API token` without Bearer) |
| `GET /backups` | Listed beside other account resources | Requires auth + allowlisted IP |

## Resource wire shapes (provider-relevant)

| Topic | Docs / OpenAPI tendency | Live / provider notes |
| --- | --- | --- |
| List pagination | `meta.links.next` cursor URL | Confirmed; empty next is `""` not omitted |
| SSH keys | CRUD under `/ssh-keys` | Create/list/get/patch/delete behaved as documented in live lifecycle |
| Startup scripts — encoding | Some OpenAPI/clients accept or omit encoding details; prop docs often say “script contents” | **`POST /startup-scripts` requires base64.** Plain text → `400 Script must be base64 encoded`. Provider accepts plain `script` props and base64-encodes on create/update. GET returns `script` already base64. |
| Startup scripts — wrap key | `/startup-scripts` | Wrap key `startup_script`; list key `startup_scripts` |
| VPCs — update verb | Generated CRUD / many OpenAPI exports imply `PATCH /vpcs/{vpc-id}` (same as SSH keys) | **Live: `PATCH` → `405 Method not allowed. Must be one of: DELETE, GET, PUT`.** Provider uses **`PUT`** for VPC description updates. |
| VPCs — wrap key | `/vpcs` | Wrap key `vpc`; create/list/get/delete OK |
| Firewalls | Groups under `/firewalls`; rules nested | List key for groups is **`firewall_groups`**; rules **`firewall_rules`** |
| Nested list for nuke | Not an OpenAPI concern | Parent-scoped resources must fan out (VPCs→NAT→rules, domains→records, …) — empty `list()` is wrong for nuke |
| DNS domain update | Some generated clients show `PUT /domains/{domain}` | Confirm before relying on PUT vs PATCH in providers — same class of bug as VPC |
| Block storage snapshots | Nested under volume in some docs | Account list is `GET /blocks/snapshots` with parent id on the item (`block_id`) |

### Confirmed live failures (2026-07-25)

These were reproduced with factory-style deploy against a real account:

1. **StartupScript create without base64** — `POST /startup-scripts` with
   `"script": "#!/bin/bash\necho hi"` → HTTP 400
   `Script must be base64 encoded`.
2. **VPC update via PATCH** — `PATCH /vpcs/{id}` with
   `{"description":"..."}` → HTTP 405
   `Method not allowed. Must be one of: DELETE, GET, PUT`.

## Error classification we rely on

Beyond OpenAPI’s coarse HTTP status enums, live messages we treat as typed:

- **Not found** — `404`, or `400` whose message matches
  `/not found|does not exist|invalid .*id|could not find|no such/i`
  → `VultrNotFound` (idempotent delete / missing read)
- **Conflict** — `409` or already-exists style message → `VultrConflict`
- **Rate limit** — `429` → `VultrRateLimited` (bounded retry)
- **Unauthorized IP** — `401` + `Unauthorized IP address:` → `VultrUnauthorizedIp`
- **Invalid token** — `401` + `Invalid API token.` → `VultrInvalidToken`

When a new live mismatch appears, prefer extending classification in
`src/internal/Client.ts` (this provider’s “SDK patch”) over untyped catches in
resources — same doctrine as Alchemy’s distilled flywheel.

## Live test commands

```bash
# Catalog + lifecycle (SSH, startup script, VPC, firewall)
CI=1 VULTR_API_KEY=... bun run test:live
```

If authenticated tests skip with `VultrUnauthorizedIp`, adjust the key’s IP
allowlist (or disable it) and re-run.
