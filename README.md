# alchemy-vultr

[Alchemy Effect](https://alchemy.run) provider for [Vultr](https://www.vultr.com/api/) — typed Infrastructure-as-Effects resources for Vultr primitives, built on Effect.

Layout matches Alchemy’s AWS / Cloudflare providers: root exports for auth and registration, plus one namespaced service folder per API surface (`Vultr.Instance.Instance`, `Vultr.Firewall.Group`, …).

## Requirements

- [Bun](https://bun.sh) ≥ 1.2
- TypeScript 7
- `alchemy` `2.0.0-beta.64+`
- `effect` `4.0.0-beta.100+` (the beta Alchemy peers)

## Install

```bash
bun add alchemy-vultr alchemy effect
```

## Quick start

```typescript
import * as Alchemy from "alchemy";
import * as Vultr from "alchemy-vultr";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "VultrApp",
  {
    providers: Vultr.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    // Omit `name` so createPhysicalName embeds the stage (multi-stage safe).
    const key = yield* Vultr.SshKey.SshKey("deploy", {
      sshKey: "ssh-ed25519 AAAA...",
    });

    const vpc = yield* Vultr.Vpc.Vpc("net", {
      region: "ewr",
      description: `app-network-${stage}`,
    });

    const server = yield* Vultr.Instance.Instance("web", {
      region: "ewr",
      plan: "vc2-1c-1gb",
      osId: 2284,
      label: `web-${stage}`,
      sshKeyIds: [key.id],
      vpcIds: [vpc.id],
      enableIpv6: true,
    });

    return {
      stage,
      instanceId: server.id,
      mainIp: server.mainIp,
    };
  }),
);
```

### Stages

Same program, isolated environments (`dev_$USER`, `staging`, `prod`, `pr-42`):

```bash
bun alchemy deploy --stage staging
bun alchemy destroy --stage pr-42
```

Vultr accounts are shared across stages — omit hard-coded `name` on SSH keys /
startup scripts so Alchemy’s physical names stay unique. See
[`docs/stages.md`](docs/stages.md).

Service namespaces can also be imported directly (same pattern as `alchemy/AWS/S3`):

```typescript
import * as Instance from "alchemy-vultr/Instance";
import * as Vpc from "alchemy-vultr/Vpc";
```

Mix with another Alchemy cloud via `Layer.mergeAll`:

```typescript
import * as Layer from "effect/Layer";
import * as Cloudflare from "alchemy/Cloudflare";

providers: Layer.mergeAll(Vultr.providers(), Cloudflare.providers()),
```

See `examples/basic.ts` and Alchemy’s [Custom Provider](https://alchemy.run/infrastructure-as-code/custom-provider/) / [Providers](https://alchemy.run/infrastructure-as-code/provider/) guides for the full lifecycle contract (`reconcile`, `delete`, `list`, `diff`, `read`, nuke).

```bash
export VULTR_API_KEY=...
bun alchemy deploy
```

Or run `bun alchemy login` and choose the Vultr auth provider (env or stored API key).

## Authentication

| Method | How |
| --- | --- |
| Environment | `VULTR_API_KEY` (used automatically in CI) |
| Stored | `alchemy login` → Vultr → API Key |
| Tests / overrides | `Credentials.fromApiKey("...")` |

## Resources

Include `Vultr.providers()` in your stack. Type IDs are `Vultr.<Service>.<Resource>` (with aliases for the previous flat names).

### Compute
`Instance.Instance`, `Instance.Ipv4`, `Instance.Template`, `BareMetal.Server`, `Snapshot.Snapshot`, `Snapshot.FromUrl`, `Iso.Iso`, `ReservedIp.ReservedIp`, `ReverseDns.Ipv4`, `ReverseDns.Ipv6`

Vultr only consumes an instance's first-boot inputs while the VM is being
provisioned, so `Instance.Instance` treats them as replacement inputs — the same
fields Vultr's Terraform provider marks `ForceNew`:

| Replaces the VM | Updates in place |
| --- | --- |
| `region`, `hostname`, `osId`, `appId`, `imageId`, `snapshotId`, `isoId`, `userData`, `sshKeyIds`, `scriptId`, `disablePublicIpv4`, `reservedIpv4`, `userScheme`, `appVariables`, `bootstrapVersion` | `label`, `tags`, `plan`, `backups`, `enableIpv6`, `ddosProtection`, `firewallGroupId`, `vpcIds` |

A startup script whose *contents* change keeps the same `scriptId`, so pass a
digest as `bootstrapVersion` when the script body should rebuild the VM. Set
`replaceOnBootstrapChange: false` to manage first-boot state out of band — the
provider then warns rather than replacing, and still never reports a first-boot
change as applied.

`instance.mainIp` is only returned once Vultr has assigned a routable public
IPv4 — reconcile polls past the `0.0.0.0` provisioning placeholder (bounded by
`readinessTimeout`, default 15 minutes) so downstream DNS records never publish
it. VPC-only instances (`disablePublicIpv4: true`) do not wait. Every instance
also carries an `alchemy-vultr-recover-…` tag alongside your own tags: it is how
a deployment that was interrupted mid-create finds the VM Vultr already accepted
instead of provisioning a second one. If create returns an ambiguous transport,
5xx, rate-limit, conflict, or response-decoding failure, reconcile sends no
second create request; it polls only that tag, bounded by
`createRecoveryTimeout` (default 2 minutes) and
`createRecoveryPollInterval` (default 5 seconds), then fails closed with
`VultrCreateUncertain` if visibility never catches up.

### Networking
`Vpc.Vpc`, `Vpc.NatGateway`, `Vpc.NatGatewayFirewallRule`, `Vpc.NatGatewayPortForwardingRule`, `Firewall.Group`, `Firewall.Rule`, `LoadBalancer.LoadBalancer`

### Kubernetes
`Kubernetes.Cluster`, `Kubernetes.NodePool`

### Data
`BlockStorage.Volume`, `BlockStorage.Snapshot`, `ObjectStorage.Subscription`, `ObjectStorage.Bucket`, `Vfs.Storage`, `Database.Database`, `Database.User`, `Database.Db`, `Database.Replica`, `Database.ConnectionPool`, `Database.Topic`, `Database.Quota`, `Database.Connector`

### DNS & CDN
`DNS.Domain`, `DNS.Record`, `CDN.PullZone`, `CDN.PushZone`

### Platform
`SshKey.SshKey`, `StartupScript.StartupScript`, `User.User`, `ApiKey.ApiKey`, `ContainerRegistry.Registry`, `Inference.Subscription`, `Organization.Organization`, `Organization.Group`, `Organization.Invitation`, `Organization.Policy`, `Organization.Role`, `Organization.RoleTrust`, `Oidc.Issuer`, `Oidc.Provider`, `Oidc.Token`

### Catalog helpers

Read-only lookups (not stack resources) live under `Vultr.Catalog`:

```typescript
const regions = yield* Vultr.Catalog.listRegions();
const plans = yield* Vultr.Catalog.listPlans({ type: "vhf" });
```

## Development

This repo vendors Alchemy and Effect as git submodules under `repos/` for local reference. Provider work follows Alchemy’s [resource factory](https://alchemy.run/blog/2026-07-02-cloudflare-resource-factory) and [beta.64](https://alchemy.run/blog/2026-07-22-beta-64/) conventions — see `AGENTS.md` and `processes/Vultr/`.

```bash
git submodule update --init --recursive
bun install
bun run typecheck
bun run lint        # biome check (lint + format)
bun run format      # biome format --write
bun run test
bun run build
```

Live provider tests (factory shape: deploy → out-of-band verify → update → destroy).
Requires `VULTR_API_KEY`. If the key has IP allowlisting, allow this runner’s
egress IP or disable the allowlist — see `docs/api-discrepancies.md`.

```bash
export VULTR_API_KEY=...
bun run test:live   # sets CI=1 so AuthProvider reads the env key
```

## Publishing

Versioning and release notes use [Changesets](https://github.com/changesets/changesets). npm publish uses [Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/) — no `NPM_TOKEN` ([GAT deprecation](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)).

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | PRs / pushes | typecheck, lint, test, build |
| `publish.yml` | push to `main` | open/update **Version Packages** PR, or publish + **GitHub Release** |

### Contributor flow

```bash
# On your feature branch, after meaningful changes:
bun run changeset
# pick patch | minor | major, write a short summary → commit the new .changeset/*.md
```

Merging to `main` with pending changesets opens a **Version Packages** PR that bumps `package.json`, updates `CHANGELOG.md` (with GitHub PR links), and deletes consumed changesets. Merging that PR:

1. Publishes to npm via OIDC (`changeset publish`)
2. Creates a **GitHub Release** whose body is the new changelog entry
3. Pushes the `vX.Y.Z` git tag

### One-time npmjs.com setup

1. Ensure the package exists on npm (first version can be a manual `npm publish` if Trusted Publisher UI requires it).
2. Package **Settings → Trusted Publisher → GitHub Actions**:
   - Organization/user: `Kennybll`
   - Repository: `alchemy-vultr`
   - Workflow filename: `publish.yml` (filename only — must match exactly)
   - Allowed actions: `npm publish`
3. After a successful Actions publish, revoke any old automation tokens and prefer **Require two-factor authentication and disallow tokens** under Publishing access.

## License

MIT
