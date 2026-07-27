# Vultr factory catalog

Order book for the Vultr Alchemy provider. Statuses: `implemented` | `partial` | `missing` | `out-of-scope`.

Aligned with the [Cloudflare resource factory](https://alchemy.run/blog/2026-07-02-cloudflare-resource-factory) flywheel, [beta.64](https://alchemy.run/blog/2026-07-22-beta-64/), and the [Providers](https://alchemy.run/infrastructure-as-code/provider/) / [Custom Provider](https://alchemy.run/infrastructure-as-code/custom-provider/) contracts (`reconcile` / `delete` / `list` / `diff` / `read` / nuke).

| Service | Resource | Type ID | Status | Live test | Notes |
| --- | --- | --- | --- | --- | --- |
| SshKey | SshKey | `Vultr.SshKey.SshKey` | implemented | gated | `createPhysicalName`; exemplar CRUD |
| StartupScript | StartupScript | `Vultr.StartupScript.StartupScript` | implemented | gated | `createPhysicalName` |
| Instance | Instance | `Vultr.Instance.Instance` | implemented | missing | `defaultPassword` redacted |
| Instance | Ipv4 | `Vultr.Instance.Ipv4` | implemented | missing | |
| Instance | Template | `Vultr.Instance.Template` | implemented | missing | |
| BareMetal | Server | `Vultr.BareMetal.Server` | implemented | missing | password redacted |
| Vpc | Vpc | `Vultr.Vpc.Vpc` | implemented | missing | |
| Vpc | NatGateway | `Vultr.Vpc.NatGateway` | implemented | missing | |
| Firewall | Group | `Vultr.Firewall.Group` | implemented | missing | |
| Firewall | Rule | `Vultr.Firewall.Rule` | implemented | missing | |
| DNS | Domain | `Vultr.DNS.Domain` | implemented | missing | |
| DNS | Record | `Vultr.DNS.Record` | implemented | missing | |
| Kubernetes | Cluster | `Vultr.Kubernetes.Cluster` | implemented | missing | slow / paid |
| Kubernetes | NodePool | `Vultr.Kubernetes.NodePool` | implemented | missing | |
| Database | Database | `Vultr.Database.Database` | implemented | missing | password redacted; paid |
| Database | User / Db / … | nested | implemented | missing | |
| ObjectStorage | Subscription | `Vultr.ObjectStorage.Subscription` | implemented | missing | keys redacted |
| ObjectStorage | Bucket | `Vultr.ObjectStorage.Bucket` | partial | missing | observe via get/list |
| LoadBalancer | LoadBalancer | `Vultr.LoadBalancer.LoadBalancer` | implemented | missing | `timeout: Duration.Input` |
| Oidc | Token | `Vultr.Oidc.Token` | implemented | missing | `ttl: Duration.Input`; token redacted |
| ApiKey | ApiKey | `Vultr.ApiKey.ApiKey` | implemented | missing | apiKey redacted |
| Inference | Subscription | `Vultr.Inference.Subscription` | implemented | missing | apiKey redacted |
| Catalog | helpers | n/a | implemented | n/a | read-only |

Billing-only and pure data endpoints stay **out-of-scope** unless they become stack resources.
