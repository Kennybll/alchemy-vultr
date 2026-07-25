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

GitHub Actions:

- `.github/workflows/ci.yml` — typecheck, test, build on PRs/pushes
- `.github/workflows/publish.yml` — npm publish on GitHub Release (needs `NPM_TOKEN`)

```bash
npm version patch
git push --follow-tags
# create a GitHub Release for the tag to trigger publish
```

## License

MIT
