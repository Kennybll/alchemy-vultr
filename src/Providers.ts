import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileLive } from "alchemy/Auth/Profile";
import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { VultrAuth } from "./AuthProvider.ts";
import * as Credentials from "./Credentials.ts";
import { VultrClientLive } from "./internal/Client.ts";
import {
  ApiKey,
  ApiKeyProvider,
  BareMetal,
  BareMetalProvider,
  BlockStorage,
  BlockStorageProvider,
  CdnPullZone,
  CdnPullZoneProvider,
  CdnPushZone,
  CdnPushZoneProvider,
  ContainerRegistry,
  ContainerRegistryProvider,
  Database,
  DatabaseConnectionPool,
  DatabaseConnectionPoolProvider,
  DatabaseDb,
  DatabaseDbProvider,
  DatabaseProvider,
  DatabaseQuota,
  DatabaseQuotaProvider,
  DatabaseReplica,
  DatabaseReplicaProvider,
  DatabaseTopic,
  DatabaseTopicProvider,
  DatabaseUser,
  DatabaseUserProvider,
  DnsDomain,
  DnsDomainProvider,
  DnsRecord,
  DnsRecordProvider,
  FirewallGroup,
  FirewallGroupProvider,
  FirewallRule,
  FirewallRuleProvider,
  Inference,
  InferenceProvider,
  Instance,
  InstanceIpv4,
  InstanceIpv4Provider,
  InstanceProvider,
  InstanceTemplate,
  InstanceTemplateProvider,
  Iso,
  IsoProvider,
  Kubernetes,
  KubernetesNodePool,
  KubernetesNodePoolProvider,
  KubernetesProvider,
  LoadBalancer,
  LoadBalancerProvider,
  NatGateway,
  NatGatewayProvider,
  ObjectStorage,
  ObjectStorageBucket,
  ObjectStorageBucketProvider,
  ObjectStorageProvider,
  OidcIssuer,
  OidcIssuerProvider,
  OidcProvider,
  OidcProviderProvider,
  Organization,
  OrganizationGroup,
  OrganizationGroupProvider,
  OrganizationPolicy,
  OrganizationPolicyProvider,
  OrganizationProvider,
  OrganizationRole,
  OrganizationRoleProvider,
  OrganizationRoleTrust,
  OrganizationRoleTrustProvider,
  ReservedIp,
  ReservedIpProvider,
  ReverseIpv4,
  ReverseIpv4Provider,
  ReverseIpv6,
  ReverseIpv6Provider,
  Snapshot,
  SnapshotFromUrl,
  SnapshotFromUrlProvider,
  SnapshotProvider,
  SshKey,
  SshKeyProvider,
  StartupScript,
  StartupScriptProvider,
  User,
  UserProvider,
  VirtualFileSystemStorage,
  VirtualFileSystemStorageProvider,
  Vpc,
  VpcProvider,
} from "./resources/index.ts";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Vultr",
) {}

export type ProviderRequirements = Layer.Services<ReturnType<typeof providers>>;

export interface ProvidersOptions {
  /** Override the Vultr API base URL (default `https://api.vultr.com/v2`). */
  readonly baseUrl?: string;
}

const resourceClasses = [
  ApiKey,
  BareMetal,
  BlockStorage,
  CdnPullZone,
  CdnPushZone,
  ContainerRegistry,
  Database,
  DatabaseConnectionPool,
  DatabaseDb,
  DatabaseQuota,
  DatabaseReplica,
  DatabaseTopic,
  DatabaseUser,
  DnsDomain,
  DnsRecord,
  FirewallGroup,
  FirewallRule,
  Inference,
  Instance,
  InstanceIpv4,
  InstanceTemplate,
  Iso,
  Kubernetes,
  KubernetesNodePool,
  LoadBalancer,
  NatGateway,
  ObjectStorage,
  ObjectStorageBucket,
  OidcIssuer,
  OidcProvider,
  Organization,
  OrganizationGroup,
  OrganizationPolicy,
  OrganizationRole,
  OrganizationRoleTrust,
  ReservedIp,
  ReverseIpv4,
  ReverseIpv6,
  Snapshot,
  SnapshotFromUrl,
  SshKey,
  StartupScript,
  User,
  VirtualFileSystemStorage,
  Vpc,
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
 *     const key = yield* Vultr.SshKey("deploy", {
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
        ApiKeyProvider(),
        BareMetalProvider(),
        BlockStorageProvider(),
        CdnPullZoneProvider(),
        CdnPushZoneProvider(),
        ContainerRegistryProvider(),
        DatabaseProvider(),
        DatabaseConnectionPoolProvider(),
        DatabaseDbProvider(),
        DatabaseQuotaProvider(),
        DatabaseReplicaProvider(),
        DatabaseTopicProvider(),
        DatabaseUserProvider(),
        DnsDomainProvider(),
        DnsRecordProvider(),
        FirewallGroupProvider(),
        FirewallRuleProvider(),
        InferenceProvider(),
        InstanceProvider(),
        InstanceIpv4Provider(),
        InstanceTemplateProvider(),
        IsoProvider(),
        KubernetesProvider(),
        KubernetesNodePoolProvider(),
        LoadBalancerProvider(),
        NatGatewayProvider(),
        ObjectStorageProvider(),
        ObjectStorageBucketProvider(),
        OidcIssuerProvider(),
        OidcProviderProvider(),
        OrganizationProvider(),
        OrganizationGroupProvider(),
        OrganizationPolicyProvider(),
        OrganizationRoleProvider(),
        OrganizationRoleTrustProvider(),
        ReservedIpProvider(),
        ReverseIpv4Provider(),
        ReverseIpv6Provider(),
        SnapshotProvider(),
        SnapshotFromUrlProvider(),
        SshKeyProvider(),
        StartupScriptProvider(),
        UserProvider(),
        VirtualFileSystemStorageProvider(),
        VpcProvider(),
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
