import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileLive } from "alchemy/Auth/Profile";
import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { VultrAuth } from "./AuthProvider.ts";
import * as Credentials from "./Credentials.ts";
import * as ApiKey from "./ApiKey/index.ts";
import * as BareMetal from "./BareMetal/index.ts";
import * as BlockStorage from "./BlockStorage/index.ts";
import * as CDN from "./CDN/index.ts";
import * as ContainerRegistry from "./ContainerRegistry/index.ts";
import * as Database from "./Database/index.ts";
import * as DNS from "./DNS/index.ts";
import * as Firewall from "./Firewall/index.ts";
import * as Inference from "./Inference/index.ts";
import * as Instance from "./Instance/index.ts";
import * as Iso from "./Iso/index.ts";
import * as Kubernetes from "./Kubernetes/index.ts";
import * as LoadBalancer from "./LoadBalancer/index.ts";
import * as ObjectStorage from "./ObjectStorage/index.ts";
import * as Oidc from "./Oidc/index.ts";
import * as Organization from "./Organization/index.ts";
import * as ReservedIp from "./ReservedIp/index.ts";
import * as ReverseDns from "./ReverseDns/index.ts";
import * as Snapshot from "./Snapshot/index.ts";
import * as SshKey from "./SshKey/index.ts";
import * as StartupScript from "./StartupScript/index.ts";
import * as User from "./User/index.ts";
import * as Vfs from "./Vfs/index.ts";
import * as Vpc from "./Vpc/index.ts";
import { VultrClientLive } from "./internal/Client.ts";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Vultr",
) {}

export type ProviderRequirements = Layer.Services<ReturnType<typeof providers>>;

export interface ProvidersOptions {
  /** Override the Vultr API base URL (default `https://api.vultr.com/v2`). */
  readonly baseUrl?: string;
}

const resourceClasses = [
  ApiKey.ApiKey,
  BareMetal.Server,
  BlockStorage.Volume,
  BlockStorage.Snapshot,
  CDN.PullZone,
  CDN.PushZone,
  ContainerRegistry.Registry,
  Database.Database,
  Database.ConnectionPool,
  Database.Connector,
  Database.Db,
  Database.Quota,
  Database.Replica,
  Database.Topic,
  Database.User,
  DNS.Domain,
  DNS.Record,
  Firewall.Group,
  Firewall.Rule,
  Inference.Subscription,
  Instance.Instance,
  Instance.Ipv4,
  Instance.Template,
  Iso.Iso,
  Kubernetes.Cluster,
  Kubernetes.NodePool,
  LoadBalancer.LoadBalancer,
  ObjectStorage.Subscription,
  ObjectStorage.Bucket,
  Oidc.Issuer,
  Oidc.Provider,
  Oidc.Token,
  Organization.Organization,
  Organization.Group,
  Organization.Invitation,
  Organization.Policy,
  Organization.Role,
  Organization.RoleTrust,
  ReservedIp.ReservedIp,
  ReverseDns.Ipv4,
  ReverseDns.Ipv6,
  Snapshot.Snapshot,
  Snapshot.FromUrl,
  SshKey.SshKey,
  StartupScript.StartupScript,
  User.User,
  Vfs.Storage,
  Vpc.Vpc,
  Vpc.NatGateway,
  Vpc.NatGatewayFirewallRule,
  Vpc.NatGatewayPortForwardingRule,
] as const;

/**
 * Build a layer that registers every Vultr resource provider, the Vultr
 * AuthProvider (for `alchemy login`), resolved credentials, the Effect
 * HTTP client, and the typed Vultr API client.
 *
 * @example
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Vultr from "alchemy-vultr";
 * import * as Effect from "effect/Effect";
 *
 * export default Alchemy.Stack(
 *   "VultrApp",
 *   {
 *     providers: Vultr.providers(),
 *     state: Alchemy.localState(),
 *   },
 *   Effect.gen(function* () {
 *     const key = yield* Vultr.SshKey.SshKey("deploy", {
 *       name: "deploy",
 *       sshKey: "ssh-ed25519 AAAA...",
 *     });
 *     return { sshKeyId: key.id };
 *   }),
 * );
 * ```
 */
export const providers = (options?: ProvidersOptions) =>
  Layer.effect(Providers, Provider.collection([...resourceClasses])).pipe(
    Layer.provide(
      Layer.mergeAll(
        ApiKey.ApiKeyProvider(),
        BareMetal.ServerProvider(),
        BlockStorage.VolumeProvider(),
        BlockStorage.SnapshotProvider(),
        CDN.PullZoneProvider(),
        CDN.PushZoneProvider(),
        ContainerRegistry.RegistryProvider(),
        Database.DatabaseProvider(),
        Database.ConnectionPoolProvider(),
        Database.ConnectorProvider(),
        Database.DbProvider(),
        Database.QuotaProvider(),
        Database.ReplicaProvider(),
        Database.TopicProvider(),
        Database.UserProvider(),
        DNS.DomainProvider(),
        DNS.RecordProvider(),
        Firewall.GroupProvider(),
        Firewall.RuleProvider(),
        Inference.SubscriptionProvider(),
        Instance.InstanceProvider(),
        Instance.Ipv4Provider(),
        Instance.TemplateProvider(),
        Iso.IsoProvider(),
        Kubernetes.ClusterProvider(),
        Kubernetes.NodePoolProvider(),
        LoadBalancer.LoadBalancerProvider(),
        ObjectStorage.SubscriptionProvider(),
        ObjectStorage.BucketProvider(),
        Oidc.IssuerProvider(),
        Oidc.ProviderProvider(),
        Oidc.TokenProvider(),
        Organization.OrganizationProvider(),
        Organization.GroupProvider(),
        Organization.InvitationProvider(),
        Organization.PolicyProvider(),
        Organization.RoleProvider(),
        Organization.RoleTrustProvider(),
        ReservedIp.ReservedIpProvider(),
        ReverseDns.Ipv4Provider(),
        ReverseDns.Ipv6Provider(),
        Snapshot.SnapshotProvider(),
        Snapshot.FromUrlProvider(),
        SshKey.SshKeyProvider(),
        StartupScript.StartupScriptProvider(),
        User.UserProvider(),
        Vfs.StorageProvider(),
        Vpc.VpcProvider(),
        Vpc.NatGatewayProvider(),
        Vpc.NatGatewayFirewallRuleProvider(),
        Vpc.NatGatewayPortForwardingRuleProvider(),
      ),
    ),
    Layer.provideMerge(VultrClientLive),
    Layer.provideMerge(Credentials.fromAuthProvider(options)),
    Layer.provideMerge(VultrAuth),
    Layer.provideMerge(ProfileLive),
    Layer.provideMerge(CredentialsStoreLive),
    Layer.provideMerge(FetchHttpClient.layer),
    Layer.orDie,
  );

export { VultrCredentials } from "./Credentials.ts";
