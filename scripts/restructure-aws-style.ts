/**
 * Restructure flat Vultr resources into AWS-style service namespaces.
 *
 * Run: bun scripts/restructure-aws-style.ts
 */
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const src = join(root, "src");

/**
 * Map old flat module → new service folder / file / type / export name.
 * Old type `Vultr.Foo` becomes `Vultr.<Service>.<Export>` with alias.
 */
const mapping: Array<{
  oldFile: string;
  service: string;
  file: string;
  exportName: string;
  oldType: string;
  newType: string;
  oldExport: string;
}> = [
  // Instance
  {
    oldFile: "Instance.ts",
    service: "Instance",
    file: "Instance.ts",
    exportName: "Instance",
    oldType: "Vultr.Instance",
    newType: "Vultr.Instance.Instance",
    oldExport: "Instance",
  },
  {
    oldFile: "InstanceIpv4.ts",
    service: "Instance",
    file: "Ipv4.ts",
    exportName: "Ipv4",
    oldType: "Vultr.InstanceIpv4",
    newType: "Vultr.Instance.Ipv4",
    oldExport: "InstanceIpv4",
  },
  {
    oldFile: "InstanceTemplate.ts",
    service: "Instance",
    file: "Template.ts",
    exportName: "Template",
    oldType: "Vultr.InstanceTemplate",
    newType: "Vultr.Instance.Template",
    oldExport: "InstanceTemplate",
  },
  // BareMetal
  {
    oldFile: "BareMetal.ts",
    service: "BareMetal",
    file: "Server.ts",
    exportName: "Server",
    oldType: "Vultr.BareMetal",
    newType: "Vultr.BareMetal.Server",
    oldExport: "BareMetal",
  },
  // BlockStorage
  {
    oldFile: "BlockStorage.ts",
    service: "BlockStorage",
    file: "Volume.ts",
    exportName: "Volume",
    oldType: "Vultr.BlockStorage",
    newType: "Vultr.BlockStorage.Volume",
    oldExport: "BlockStorage",
  },
  {
    oldFile: "BlockStorageSnapshot.ts",
    service: "BlockStorage",
    file: "Snapshot.ts",
    exportName: "Snapshot",
    oldType: "Vultr.BlockStorageSnapshot",
    newType: "Vultr.BlockStorage.Snapshot",
    oldExport: "BlockStorageSnapshot",
  },
  // Vpc
  {
    oldFile: "Vpc.ts",
    service: "Vpc",
    file: "Vpc.ts",
    exportName: "Vpc",
    oldType: "Vultr.Vpc",
    newType: "Vultr.Vpc.Vpc",
    oldExport: "Vpc",
  },
  {
    oldFile: "NatGateway.ts",
    service: "Vpc",
    file: "NatGateway.ts",
    exportName: "NatGateway",
    oldType: "Vultr.NatGateway",
    newType: "Vultr.Vpc.NatGateway",
    oldExport: "NatGateway",
  },
  {
    oldFile: "NatGatewayFirewallRule.ts",
    service: "Vpc",
    file: "NatGatewayFirewallRule.ts",
    exportName: "NatGatewayFirewallRule",
    oldType: "Vultr.NatGatewayFirewallRule",
    newType: "Vultr.Vpc.NatGatewayFirewallRule",
    oldExport: "NatGatewayFirewallRule",
  },
  {
    oldFile: "NatGatewayPortForwardingRule.ts",
    service: "Vpc",
    file: "NatGatewayPortForwardingRule.ts",
    exportName: "NatGatewayPortForwardingRule",
    oldType: "Vultr.NatGatewayPortForwardingRule",
    newType: "Vultr.Vpc.NatGatewayPortForwardingRule",
    oldExport: "NatGatewayPortForwardingRule",
  },
  // Firewall
  {
    oldFile: "FirewallGroup.ts",
    service: "Firewall",
    file: "Group.ts",
    exportName: "Group",
    oldType: "Vultr.FirewallGroup",
    newType: "Vultr.Firewall.Group",
    oldExport: "FirewallGroup",
  },
  {
    oldFile: "FirewallRule.ts",
    service: "Firewall",
    file: "Rule.ts",
    exportName: "Rule",
    oldType: "Vultr.FirewallRule",
    newType: "Vultr.Firewall.Rule",
    oldExport: "FirewallRule",
  },
  // DNS
  {
    oldFile: "DnsDomain.ts",
    service: "DNS",
    file: "Domain.ts",
    exportName: "Domain",
    oldType: "Vultr.DnsDomain",
    newType: "Vultr.DNS.Domain",
    oldExport: "DnsDomain",
  },
  {
    oldFile: "DnsRecord.ts",
    service: "DNS",
    file: "Record.ts",
    exportName: "Record",
    oldType: "Vultr.DnsRecord",
    newType: "Vultr.DNS.Record",
    oldExport: "DnsRecord",
  },
  // Kubernetes
  {
    oldFile: "Kubernetes.ts",
    service: "Kubernetes",
    file: "Cluster.ts",
    exportName: "Cluster",
    oldType: "Vultr.Kubernetes",
    newType: "Vultr.Kubernetes.Cluster",
    oldExport: "Kubernetes",
  },
  {
    oldFile: "KubernetesNodePool.ts",
    service: "Kubernetes",
    file: "NodePool.ts",
    exportName: "NodePool",
    oldType: "Vultr.KubernetesNodePool",
    newType: "Vultr.Kubernetes.NodePool",
    oldExport: "KubernetesNodePool",
  },
  // Database
  {
    oldFile: "Database.ts",
    service: "Database",
    file: "Database.ts",
    exportName: "Database",
    oldType: "Vultr.Database",
    newType: "Vultr.Database.Database",
    oldExport: "Database",
  },
  {
    oldFile: "DatabaseUser.ts",
    service: "Database",
    file: "User.ts",
    exportName: "User",
    oldType: "Vultr.DatabaseUser",
    newType: "Vultr.Database.User",
    oldExport: "DatabaseUser",
  },
  {
    oldFile: "DatabaseDb.ts",
    service: "Database",
    file: "Db.ts",
    exportName: "Db",
    oldType: "Vultr.DatabaseDb",
    newType: "Vultr.Database.Db",
    oldExport: "DatabaseDb",
  },
  {
    oldFile: "DatabaseReplica.ts",
    service: "Database",
    file: "Replica.ts",
    exportName: "Replica",
    oldType: "Vultr.DatabaseReplica",
    newType: "Vultr.Database.Replica",
    oldExport: "DatabaseReplica",
  },
  {
    oldFile: "DatabaseConnectionPool.ts",
    service: "Database",
    file: "ConnectionPool.ts",
    exportName: "ConnectionPool",
    oldType: "Vultr.DatabaseConnectionPool",
    newType: "Vultr.Database.ConnectionPool",
    oldExport: "DatabaseConnectionPool",
  },
  {
    oldFile: "DatabaseTopic.ts",
    service: "Database",
    file: "Topic.ts",
    exportName: "Topic",
    oldType: "Vultr.DatabaseTopic",
    newType: "Vultr.Database.Topic",
    oldExport: "DatabaseTopic",
  },
  {
    oldFile: "DatabaseQuota.ts",
    service: "Database",
    file: "Quota.ts",
    exportName: "Quota",
    oldType: "Vultr.DatabaseQuota",
    newType: "Vultr.Database.Quota",
    oldExport: "DatabaseQuota",
  },
  {
    oldFile: "DatabaseConnector.ts",
    service: "Database",
    file: "Connector.ts",
    exportName: "Connector",
    oldType: "Vultr.DatabaseConnector",
    newType: "Vultr.Database.Connector",
    oldExport: "DatabaseConnector",
  },
  // LoadBalancer
  {
    oldFile: "LoadBalancer.ts",
    service: "LoadBalancer",
    file: "LoadBalancer.ts",
    exportName: "LoadBalancer",
    oldType: "Vultr.LoadBalancer",
    newType: "Vultr.LoadBalancer.LoadBalancer",
    oldExport: "LoadBalancer",
  },
  // ObjectStorage
  {
    oldFile: "ObjectStorage.ts",
    service: "ObjectStorage",
    file: "Subscription.ts",
    exportName: "Subscription",
    oldType: "Vultr.ObjectStorage",
    newType: "Vultr.ObjectStorage.Subscription",
    oldExport: "ObjectStorage",
  },
  {
    oldFile: "ObjectStorageBucket.ts",
    service: "ObjectStorage",
    file: "Bucket.ts",
    exportName: "Bucket",
    oldType: "Vultr.ObjectStorageBucket",
    newType: "Vultr.ObjectStorage.Bucket",
    oldExport: "ObjectStorageBucket",
  },
  // CDN
  {
    oldFile: "CdnPullZone.ts",
    service: "CDN",
    file: "PullZone.ts",
    exportName: "PullZone",
    oldType: "Vultr.CdnPullZone",
    newType: "Vultr.CDN.PullZone",
    oldExport: "CdnPullZone",
  },
  {
    oldFile: "CdnPushZone.ts",
    service: "CDN",
    file: "PushZone.ts",
    exportName: "PushZone",
    oldType: "Vultr.CdnPushZone",
    newType: "Vultr.CDN.PushZone",
    oldExport: "CdnPushZone",
  },
  // ContainerRegistry
  {
    oldFile: "ContainerRegistry.ts",
    service: "ContainerRegistry",
    file: "Registry.ts",
    exportName: "Registry",
    oldType: "Vultr.ContainerRegistry",
    newType: "Vultr.ContainerRegistry.Registry",
    oldExport: "ContainerRegistry",
  },
  // SshKey
  {
    oldFile: "SshKey.ts",
    service: "SshKey",
    file: "SshKey.ts",
    exportName: "SshKey",
    oldType: "Vultr.SshKey",
    newType: "Vultr.SshKey.SshKey",
    oldExport: "SshKey",
  },
  // StartupScript
  {
    oldFile: "StartupScript.ts",
    service: "StartupScript",
    file: "StartupScript.ts",
    exportName: "StartupScript",
    oldType: "Vultr.StartupScript",
    newType: "Vultr.StartupScript.StartupScript",
    oldExport: "StartupScript",
  },
  // Snapshot
  {
    oldFile: "Snapshot.ts",
    service: "Snapshot",
    file: "Snapshot.ts",
    exportName: "Snapshot",
    oldType: "Vultr.Snapshot",
    newType: "Vultr.Snapshot.Snapshot",
    oldExport: "Snapshot",
  },
  {
    oldFile: "SnapshotFromUrl.ts",
    service: "Snapshot",
    file: "FromUrl.ts",
    exportName: "FromUrl",
    oldType: "Vultr.SnapshotFromUrl",
    newType: "Vultr.Snapshot.FromUrl",
    oldExport: "SnapshotFromUrl",
  },
  // ReservedIp
  {
    oldFile: "ReservedIp.ts",
    service: "ReservedIp",
    file: "ReservedIp.ts",
    exportName: "ReservedIp",
    oldType: "Vultr.ReservedIp",
    newType: "Vultr.ReservedIp.ReservedIp",
    oldExport: "ReservedIp",
  },
  // ReverseDns
  {
    oldFile: "ReverseIpv4.ts",
    service: "ReverseDns",
    file: "Ipv4.ts",
    exportName: "Ipv4",
    oldType: "Vultr.ReverseIpv4",
    newType: "Vultr.ReverseDns.Ipv4",
    oldExport: "ReverseIpv4",
  },
  {
    oldFile: "ReverseIpv6.ts",
    service: "ReverseDns",
    file: "Ipv6.ts",
    exportName: "Ipv6",
    oldType: "Vultr.ReverseIpv6",
    newType: "Vultr.ReverseDns.Ipv6",
    oldExport: "ReverseIpv6",
  },
  // Iso
  {
    oldFile: "Iso.ts",
    service: "Iso",
    file: "Iso.ts",
    exportName: "Iso",
    oldType: "Vultr.Iso",
    newType: "Vultr.Iso.Iso",
    oldExport: "Iso",
  },
  // User
  {
    oldFile: "User.ts",
    service: "User",
    file: "User.ts",
    exportName: "User",
    oldType: "Vultr.User",
    newType: "Vultr.User.User",
    oldExport: "User",
  },
  // ApiKey
  {
    oldFile: "ApiKey.ts",
    service: "ApiKey",
    file: "ApiKey.ts",
    exportName: "ApiKey",
    oldType: "Vultr.ApiKey",
    newType: "Vultr.ApiKey.ApiKey",
    oldExport: "ApiKey",
  },
  // Inference
  {
    oldFile: "Inference.ts",
    service: "Inference",
    file: "Subscription.ts",
    exportName: "Subscription",
    oldType: "Vultr.Inference",
    newType: "Vultr.Inference.Subscription",
    oldExport: "Inference",
  },
  // Organization
  {
    oldFile: "Organization.ts",
    service: "Organization",
    file: "Organization.ts",
    exportName: "Organization",
    oldType: "Vultr.Organization",
    newType: "Vultr.Organization.Organization",
    oldExport: "Organization",
  },
  {
    oldFile: "OrganizationGroup.ts",
    service: "Organization",
    file: "Group.ts",
    exportName: "Group",
    oldType: "Vultr.OrganizationGroup",
    newType: "Vultr.Organization.Group",
    oldExport: "OrganizationGroup",
  },
  {
    oldFile: "OrganizationPolicy.ts",
    service: "Organization",
    file: "Policy.ts",
    exportName: "Policy",
    oldType: "Vultr.OrganizationPolicy",
    newType: "Vultr.Organization.Policy",
    oldExport: "OrganizationPolicy",
  },
  {
    oldFile: "OrganizationRole.ts",
    service: "Organization",
    file: "Role.ts",
    exportName: "Role",
    oldType: "Vultr.OrganizationRole",
    newType: "Vultr.Organization.Role",
    oldExport: "OrganizationRole",
  },
  {
    oldFile: "OrganizationRoleTrust.ts",
    service: "Organization",
    file: "RoleTrust.ts",
    exportName: "RoleTrust",
    oldType: "Vultr.OrganizationRoleTrust",
    newType: "Vultr.Organization.RoleTrust",
    oldExport: "OrganizationRoleTrust",
  },
  {
    oldFile: "OrganizationInvitation.ts",
    service: "Organization",
    file: "Invitation.ts",
    exportName: "Invitation",
    oldType: "Vultr.OrganizationInvitation",
    newType: "Vultr.Organization.Invitation",
    oldExport: "OrganizationInvitation",
  },
  // Oidc
  {
    oldFile: "OidcIssuer.ts",
    service: "Oidc",
    file: "Issuer.ts",
    exportName: "Issuer",
    oldType: "Vultr.OidcIssuer",
    newType: "Vultr.Oidc.Issuer",
    oldExport: "OidcIssuer",
  },
  {
    oldFile: "OidcProvider.ts",
    service: "Oidc",
    file: "Provider.ts",
    exportName: "Provider",
    oldType: "Vultr.OidcProvider",
    newType: "Vultr.Oidc.Provider",
    oldExport: "OidcProvider",
  },
  {
    oldFile: "OidcToken.ts",
    service: "Oidc",
    file: "Token.ts",
    exportName: "Token",
    oldType: "Vultr.OidcToken",
    newType: "Vultr.Oidc.Token",
    oldExport: "OidcToken",
  },
  // Vfs
  {
    oldFile: "VirtualFileSystemStorage.ts",
    service: "Vfs",
    file: "Storage.ts",
    exportName: "Storage",
    oldType: "Vultr.VirtualFileSystemStorage",
    newType: "Vultr.Vfs.Storage",
    oldExport: "VirtualFileSystemStorage",
  },
];

const depthPrefix = (service: string) =>
  service.split("/").length === 1 ? ".." : "../..";

for (const m of mapping) {
  const from = join(src, "resources", m.oldFile);
  if (!existsSync(from)) {
    console.warn(`skip missing ${from}`);
    continue;
  }
  const toDir = join(src, m.service);
  mkdirSync(toDir, { recursive: true });
  const to = join(toDir, m.file);

  let content = readFileSync(from, "utf8");

  // Fix relative imports into internal/ / Providers
  content = content.replaceAll(
    `"../internal/`,
    `"${depthPrefix(m.service)}/internal/`,
  );
  content = content.replaceAll(
    `"../Providers.ts"`,
    `"${depthPrefix(m.service)}/Providers.ts"`,
  );

  // Rename resource type strings
  content = content.replaceAll(`"${m.oldType}"`, `"${m.newType}"`);
  content = content.replaceAll(`'${m.oldType}'`, `'${m.newType}'`);

  // Rename export symbols when the public name changes
  if (m.oldExport !== m.exportName) {
    // type FooAttributes / FooProps / const Foo / FooProvider
    const re = new RegExp(`\\b${m.oldExport}\\b`, "g");
    content = content.replace(re, m.exportName);
  }

  // Add aliases option on Resource() / defineCrudResource for rename safety
  if (content.includes("defineCrudResource") || content.includes("defineNestedCrudResource")) {
    if (!content.includes("aliases:")) {
      content = content.replace(
        /type: "([^"]+)",\n/,
        `type: "$1",\n  aliases: ["${m.oldType}"],\n`,
      );
    }
  } else if (content.includes(`Resource<${m.exportName}>`)) {
    // Hand-written Resource("Type") → Resource("Type", { aliases })
    content = content.replace(
      new RegExp(
        `export const ${m.exportName} = Resource<${m.exportName}>\\(\\s*"${m.newType.replace(/\./g, "\\.")}"\\s*\\);`,
      ),
      `export const ${m.exportName} = Resource<${m.exportName}>("${m.newType}", {\n  aliases: ["${m.oldType}"],\n});`,
    );
    // Multi-line Resource assignments
    content = content.replace(
      new RegExp(
        `export const ${m.exportName} =\\s*Resource<${m.exportName}>\\(\\s*"${m.newType.replace(/\./g, "\\.")}"\\s*\\);`,
      ),
      `export const ${m.exportName} = Resource<${m.exportName}>("${m.newType}", {\n  aliases: ["${m.oldType}"],\n});`,
    );
  }

  writeFileSync(to, content);
  console.log(`${m.oldFile} → ${m.service}/${m.file} (${m.newType})`);
}

// Write per-service index.ts barrels
const byService = new Map<string, typeof mapping>();
for (const m of mapping) {
  const list = byService.get(m.service) ?? [];
  list.push(m);
  byService.set(m.service, list);
}

for (const [service, items] of byService) {
  const exports = items
    .map((m) => `export * from "./${m.file.replace(/\.ts$/, "")}.ts";`)
    .join("\n");
  writeFileSync(join(src, service, "index.ts"), `${exports}\n`);
  console.log(`wrote ${service}/index.ts`);
}

// Move Catalog
const catalogFrom = join(src, "data", "Catalog.ts");
if (existsSync(catalogFrom)) {
  mkdirSync(join(src, "Catalog"), { recursive: true });
  let catalog = readFileSync(catalogFrom, "utf8");
  catalog = catalog.replaceAll(`"../internal/`, `"../internal/`);
  writeFileSync(join(src, "Catalog", "index.ts"), catalog);
  console.log("wrote Catalog/index.ts");
}

// Remove old flat resources tree
rmSync(join(src, "resources"), { recursive: true, force: true });
rmSync(join(src, "data"), { recursive: true, force: true });
console.log("removed src/resources and src/data");

// Emit mapping JSON for Providers/index generation
writeFileSync(
  join(root, "scripts", "_service-map.json"),
  JSON.stringify({ mapping, services: [...byService.keys()].sort() }, null, 2),
);
console.log("done");
