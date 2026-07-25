# alchemy-vultr

[Alchemy Effect](https://alchemy.run) provider for [Vultr](https://www.vultr.com/api/) — typed Infrastructure-as-Effects resources for Vultr primitives, built on Effect.

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
    const key = yield* Vultr.SshKey("deploy", {
      name: "deploy",
      sshKey: "ssh-ed25519 AAAA...",
    });

    const vpc = yield* Vultr.Vpc("net", {
      region: "ewr",
      description: "app network",
    });

    const server = yield* Vultr.Instance("web", {
      region: "ewr",
      plan: "vc2-1c-1gb",
      osId: 2284,
      label: "web",
      sshKeyIds: [key.id],
      vpcIds: [vpc.id],
      enableIpv6: true,
    });

    return {
      instanceId: server.id,
      mainIp: server.mainIp,
    };
  }),
);
```

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

Include `Vultr.providers()` in your stack. Every resource below is registered.

### Compute
`Instance`, `InstanceIpv4`, `InstanceTemplate`, `BareMetal`, `Snapshot`, `SnapshotFromUrl`, `Iso`, `ReservedIp`, `ReverseIpv4`, `ReverseIpv6`

### Networking
`Vpc`, `NatGateway`, `NatGatewayFirewallRule`, `NatGatewayPortForwardingRule`, `FirewallGroup`, `FirewallRule`, `LoadBalancer`

### Kubernetes
`Kubernetes`, `KubernetesNodePool`

### Data
`BlockStorage`, `BlockStorageSnapshot`, `ObjectStorage`, `ObjectStorageBucket`, `VirtualFileSystemStorage`, `Database`, `DatabaseUser`, `DatabaseDb`, `DatabaseReplica`, `DatabaseConnectionPool`, `DatabaseTopic`, `DatabaseQuota`, `DatabaseConnector`

### DNS & CDN
`DnsDomain`, `DnsRecord`, `CdnPullZone`, `CdnPushZone`

### Platform
`SshKey`, `StartupScript`, `User`, `ApiKey`, `ContainerRegistry`, `Inference`, `Organization`, `OrganizationGroup`, `OrganizationInvitation`, `OrganizationPolicy`, `OrganizationRole`, `OrganizationRoleTrust`, `OidcIssuer`, `OidcProvider`, `OidcToken`

### Catalog helpers

Read-only lookups (not stack resources) live under `Vultr.Catalog`:

```typescript
const regions = yield* Vultr.Catalog.listRegions();
const plans = yield* Vultr.Catalog.listPlans({ type: "vhf" });
```

## Development

This repo vendors Alchemy and Effect as git submodules under `repos/` for local reference:

```bash
git submodule update --init --recursive
bun install
bun run typecheck
bun run test
bun run build
```

Regenerate the CRUD resource modules from the catalog:

```bash
bun run generate:resources
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
