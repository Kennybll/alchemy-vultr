/**
 * Generates Vultr Alchemy resource modules from a declarative catalog.
 * Writes into AWS-style service folders using `scripts/_service-map.json`.
 * Run: bun scripts/generate-resources.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ServiceMapEntry {
  oldFile: string;
  service: string;
  file: string;
  exportName: string;
  oldType: string;
  newType: string;
  oldExport: string;
}

const serviceMap = JSON.parse(
  readFileSync(join(import.meta.dir, "_service-map.json"), "utf8"),
) as { mapping: ServiceMapEntry[] };

const byOldExport = new Map(
  serviceMap.mapping.map((entry) => [entry.oldExport, entry]),
);

interface Field {
  name: string;
  tsType: string;
  optional?: boolean;
  doc?: string;
  /** Include in create body (default true for non-computed). */
  create?: boolean;
  /** Include in update body (default true for optional mutable fields). */
  update?: boolean;
  /** Force replace when changed. */
  replace?: boolean;
  /** Output-only / computed attribute. */
  attribute?: boolean;
}

interface ResourceDef {
  /** PascalCase export name */
  name: string;
  /** File name without extension */
  file: string;
  type: string;
  listPath: string;
  listKey: string;
  wrapKey: string;
  idAttribute?: string;
  getPath?: string; // template with {id} and optional {prop}
  deletePath?: string;
  updateMethod?: "PATCH" | "PUT" | "POST";
  immutable?: boolean;
  description: string;
  fields: Field[];
}

const resources: ResourceDef[] = [
  {
    name: "SshKey",
    file: "SshKey",
    type: "Vultr.SshKey",
    listPath: "/ssh-keys",
    listKey: "ssh_keys",
    wrapKey: "ssh_key",
    description: "An SSH public key registered on your Vultr account.",
    fields: [
      { name: "name", tsType: "string", doc: "Label for the SSH key." },
      { name: "sshKey", tsType: "string", doc: "SSH public key contents.", create: true, update: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "StartupScript",
    file: "StartupScript",
    type: "Vultr.StartupScript",
    listPath: "/startup-scripts",
    listKey: "startup_scripts",
    wrapKey: "startup_script",
    description: "A startup script executed on first boot of an instance.",
    fields: [
      { name: "name", tsType: "string" },
      { name: "script", tsType: "string", doc: "Script contents (base64 or plain text depending on type)." },
      { name: "type", tsType: '"boot" | "pxe"', optional: true, replace: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "dateModified", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Vpc",
    file: "Vpc",
    type: "Vultr.Vpc",
    listPath: "/vpcs",
    listKey: "vpcs",
    wrapKey: "vpc",
    description: "A Vultr VPC network.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "description", tsType: "string", optional: true },
      { name: "v4Subnet", tsType: "string", optional: true, replace: true },
      { name: "v4SubnetMask", tsType: "number", optional: true, replace: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "FirewallGroup",
    file: "FirewallGroup",
    type: "Vultr.FirewallGroup",
    listPath: "/firewalls",
    listKey: "firewall_groups",
    wrapKey: "firewall_group",
    description: "A Vultr firewall group that holds firewall rules.",
    fields: [
      { name: "description", tsType: "string", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "dateModified", tsType: "string", attribute: true },
      { name: "instanceCount", tsType: "number", attribute: true },
      { name: "ruleCount", tsType: "number", attribute: true },
      { name: "maxRuleCount", tsType: "number", attribute: true },
    ],
  },
  {
    name: "DnsDomain",
    file: "DnsDomain",
    type: "Vultr.DnsDomain",
    listPath: "/domains",
    listKey: "domains",
    wrapKey: "domain",
    idAttribute: "domain",
    getPath: "/domains/{id}",
    description: "A DNS domain hosted on Vultr.",
    fields: [
      { name: "domain", tsType: "string", replace: true },
      { name: "ip", tsType: "string", optional: true, update: false, doc: "Optional IP used to seed default records on create." },
      { name: "dnsSec", tsType: '"enabled" | "disabled"', optional: true, update: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "ReservedIp",
    file: "ReservedIp",
    type: "Vultr.ReservedIp",
    listPath: "/reserved-ips",
    listKey: "reserved_ips",
    wrapKey: "reserved_ip",
    description: "A reserved (floating) IP address.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "ipType", tsType: '"v4" | "v6"', replace: true },
      { name: "label", tsType: "string", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "subnet", tsType: "string", attribute: true },
      { name: "subnetSize", tsType: "number", attribute: true },
      { name: "instanceId", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Snapshot",
    file: "Snapshot",
    type: "Vultr.Snapshot",
    listPath: "/snapshots",
    listKey: "snapshots",
    wrapKey: "snapshot",
    description: "A snapshot of a Vultr instance.",
    fields: [
      { name: "instanceId", tsType: "string", replace: true },
      { name: "description", tsType: "string", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "size", tsType: "number", attribute: true },
      { name: "compressedSize", tsType: "number", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "osId", tsType: "number", attribute: true },
      { name: "appId", tsType: "number", attribute: true },
    ],
  },
  {
    name: "Iso",
    file: "Iso",
    type: "Vultr.Iso",
    listPath: "/iso",
    listKey: "isos",
    wrapKey: "iso",
    description: "A private ISO image uploaded to Vultr.",
    fields: [
      { name: "url", tsType: "string", replace: true, update: false },
      { name: "id", tsType: "string", attribute: true },
      { name: "filename", tsType: "string", attribute: true },
      { name: "size", tsType: "number", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "md5sum", tsType: "string", attribute: true },
      { name: "sha512sum", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "BlockStorage",
    file: "BlockStorage",
    type: "Vultr.BlockStorage",
    listPath: "/blocks",
    listKey: "blocks",
    wrapKey: "block",
    description: "A Vultr block storage volume.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "sizeGb", tsType: "number" },
      { name: "label", tsType: "string", optional: true },
      { name: "blockType", tsType: "string", optional: true, replace: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "cost", tsType: "number", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "attachedToInstance", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "mountId", tsType: "string", attribute: true },
    ],
  },
  {
    name: "User",
    file: "User",
    type: "Vultr.User",
    listPath: "/users",
    listKey: "users",
    wrapKey: "user",
    description: "A Vultr account user.",
    fields: [
      { name: "email", tsType: "string", replace: true },
      { name: "name", tsType: "string" },
      { name: "password", tsType: "string", optional: true, update: true, doc: "Initial password (create) or password reset (update)." },
      { name: "apiEnabled", tsType: "boolean", optional: true },
      { name: "acls", tsType: "ReadonlyArray<string>", optional: true },
      { name: "id", tsType: "string", attribute: true },
    ],
  },
  {
    name: "ContainerRegistry",
    file: "ContainerRegistry",
    type: "Vultr.ContainerRegistry",
    listPath: "/registries",
    listKey: "registries",
    wrapKey: "registry",
    description: "A Vultr Container Registry.",
    fields: [
      { name: "name", tsType: "string", replace: true },
      { name: "public", tsType: "boolean", optional: true },
      { name: "region", tsType: "string", replace: true },
      { name: "plan", tsType: "string", replace: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "urn", tsType: "string", attribute: true },
      { name: "storage", tsType: "unknown", attribute: true },
      { name: "rootUser", tsType: "unknown", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Inference",
    file: "Inference",
    type: "Vultr.Inference",
    listPath: "/inference",
    listKey: "subscriptions",
    wrapKey: "subscription",
    description: "A Vultr Serverless Inference subscription.",
    fields: [
      { name: "label", tsType: "string" },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "apiKey", tsType: "string", attribute: true },
    ],
  },
  {
    name: "ObjectStorage",
    file: "ObjectStorage",
    type: "Vultr.ObjectStorage",
    listPath: "/object-storage",
    listKey: "object_storages",
    wrapKey: "object_storage",
    description: "A Vultr Object Storage subscription.",
    fields: [
      { name: "clusterId", tsType: "number", replace: true },
      { name: "tierId", tsType: "number", optional: true, replace: true },
      { name: "label", tsType: "string", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "region", tsType: "string", attribute: true },
      { name: "s3Hostname", tsType: "string", attribute: true },
      { name: "s3AccessKey", tsType: "string", attribute: true },
      { name: "s3SecretKey", tsType: "string", attribute: true },
    ],
  },
  {
    name: "VirtualFileSystemStorage",
    file: "VirtualFileSystemStorage",
    type: "Vultr.VirtualFileSystemStorage",
    listPath: "/vfs",
    listKey: "vfs_storages",
    wrapKey: "vfs_storage",
    description: "A Vultr Virtual File System storage volume.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "label", tsType: "string" },
      { name: "storageSize", tsType: "number", doc: "Size in GB." },
      { name: "diskType", tsType: "string", optional: true, replace: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "BareMetal",
    file: "BareMetal",
    type: "Vultr.BareMetal",
    listPath: "/bare-metals",
    listKey: "bare_metals",
    wrapKey: "bare_metal",
    description: "A Vultr Bare Metal server.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "plan", tsType: "string", replace: true },
      { name: "osId", tsType: "number", optional: true, replace: true },
      { name: "appId", tsType: "number", optional: true, replace: true },
      { name: "imageId", tsType: "string", optional: true, replace: true },
      { name: "snapshotId", tsType: "string", optional: true, replace: true },
      { name: "label", tsType: "string", optional: true },
      { name: "hostname", tsType: "string", optional: true, replace: true },
      { name: "tags", tsType: "ReadonlyArray<string>", optional: true },
      { name: "enableIpv6", tsType: "boolean", optional: true, replace: true },
      { name: "sshKeyIds", tsType: "ReadonlyArray<string>", optional: true, update: false },
      { name: "scriptId", tsType: "string", optional: true, update: false },
      { name: "userData", tsType: "string", optional: true, update: false },
      { name: "reservedIpv4", tsType: "string", optional: true },
      { name: "vpcIds", tsType: "ReadonlyArray<string>", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "mainIp", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "defaultPassword", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "v6MainIp", tsType: "string", attribute: true },
    ],
  },
  {
    name: "LoadBalancer",
    file: "LoadBalancer",
    type: "Vultr.LoadBalancer",
    listPath: "/load-balancers",
    listKey: "load_balancers",
    wrapKey: "load_balancer",
    description: "A Vultr Load Balancer.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "balancingAlgorithm", tsType: '"roundrobin" | "leastconn"', optional: true },
      { name: "sslRedirect", tsType: "boolean", optional: true },
      { name: "http2", tsType: "boolean", optional: true },
      { name: "http3", tsType: "boolean", optional: true },
      { name: "proxyProtocol", tsType: "boolean", optional: true },
      { name: "timeout", tsType: "number", optional: true },
      { name: "label", tsType: "string", optional: true },
      { name: "nodes", tsType: "number", optional: true },
      { name: "vpc", tsType: "string", optional: true, replace: true },
      { name: "firewallRules", tsType: "ReadonlyArray<Record<string, unknown>>", optional: true },
      { name: "forwardingRules", tsType: "ReadonlyArray<Record<string, unknown>>", optional: true },
      { name: "healthCheck", tsType: "Record<string, unknown>", optional: true },
      { name: "instances", tsType: "ReadonlyArray<string>", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "ipv4", tsType: "string", attribute: true },
      { name: "ipv6", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Kubernetes",
    file: "Kubernetes",
    type: "Vultr.Kubernetes",
    listPath: "/kubernetes/clusters",
    listKey: "vke_clusters",
    wrapKey: "vke_cluster",
    description: "A Vultr Kubernetes Engine (VKE) cluster.",
    fields: [
      { name: "region", tsType: "string", replace: true },
      { name: "version", tsType: "string", replace: true },
      { name: "label", tsType: "string", optional: true },
      { name: "haControlplanes", tsType: "boolean", optional: true, replace: true },
      {
        name: "nodePools",
        tsType: "ReadonlyArray<{ nodeQuantity: number; label: string; plan: string; autoScaler?: boolean; minNodes?: number; maxNodes?: number; tags?: ReadonlyArray<string> }>",
        optional: true,
        update: false,
        doc: "Initial node pools created with the cluster.",
      },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "clusterSubnet", tsType: "string", attribute: true },
      { name: "serviceSubnet", tsType: "string", attribute: true },
      { name: "endpoint", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Database",
    file: "Database",
    type: "Vultr.Database",
    listPath: "/databases",
    listKey: "databases",
    wrapKey: "database",
    description: "A Vultr Managed Database.",
    fields: [
      { name: "databaseEngine", tsType: "string", replace: true },
      { name: "databaseEngineVersion", tsType: "string", optional: true },
      { name: "region", tsType: "string", replace: true },
      { name: "plan", tsType: "string" },
      { name: "label", tsType: "string", optional: true },
      { name: "tag", tsType: "string", optional: true },
      { name: "vpcId", tsType: "string", optional: true, replace: true },
      { name: "maintenanceDow", tsType: "string", optional: true },
      { name: "maintenanceTime", tsType: "string", optional: true },
      { name: "clusterTimeZone", tsType: "string", optional: true },
      { name: "trustedIps", tsType: "ReadonlyArray<string>", optional: true },
      { name: "mysqlSqlModes", tsType: "ReadonlyArray<string>", optional: true },
      { name: "mysqlRequirePrimaryKey", tsType: "boolean", optional: true },
      { name: "mysqlSlowQueryLog", tsType: "boolean", optional: true },
      { name: "mysqlLongQueryTime", tsType: "number", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "host", tsType: "string", attribute: true },
      { name: "port", tsType: "string", attribute: true },
      { name: "user", tsType: "string", attribute: true },
      { name: "password", tsType: "string", attribute: true },
      { name: "dbname", tsType: "string", attribute: true },
    ],
  },
  {
    name: "CdnPullZone",
    file: "CdnPullZone",
    type: "Vultr.CdnPullZone",
    listPath: "/cdns/pull-zones",
    listKey: "pull_zones",
    wrapKey: "pull_zone",
    description: "A Vultr CDN pull zone.",
    fields: [
      { name: "label", tsType: "string" },
      { name: "originScheme", tsType: '"http" | "https"', optional: true },
      { name: "originDomain", tsType: "string", replace: true },
      { name: "vanityDomain", tsType: "string", optional: true },
      { name: "ssl", tsType: "boolean", optional: true },
      { name: "cors", tsType: "boolean", optional: true },
      { name: "gzip", tsType: "boolean", optional: true },
      { name: "blockAi", tsType: "boolean", optional: true },
      { name: "blockBadBots", tsType: "boolean", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "cdnUrl", tsType: "string", attribute: true },
    ],
  },
  {
    name: "CdnPushZone",
    file: "CdnPushZone",
    type: "Vultr.CdnPushZone",
    listPath: "/cdns/push-zones",
    listKey: "push_zones",
    wrapKey: "push_zone",
    description: "A Vultr CDN push zone.",
    fields: [
      { name: "label", tsType: "string" },
      { name: "vanityDomain", tsType: "string", optional: true },
      { name: "ssl", tsType: "boolean", optional: true },
      { name: "cors", tsType: "boolean", optional: true },
      { name: "gzip", tsType: "boolean", optional: true },
      { name: "blockAi", tsType: "boolean", optional: true },
      { name: "blockBadBots", tsType: "boolean", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "status", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "cdnUrl", tsType: "string", attribute: true },
    ],
  },
  {
    name: "ApiKey",
    file: "ApiKey",
    type: "Vultr.ApiKey",
    listPath: "/apikeys",
    listKey: "apikeys",
    wrapKey: "apikey",
    description: "A Vultr API key.",
    fields: [
      { name: "name", tsType: "string" },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
      { name: "apiKey", tsType: "string", attribute: true },
    ],
  },
  {
    name: "InstanceTemplate",
    file: "InstanceTemplate",
    type: "Vultr.InstanceTemplate",
    listPath: "/instances/templates",
    listKey: "templates",
    wrapKey: "template",
    description: "A reusable Vultr instance template.",
    fields: [
      { name: "label", tsType: "string" },
      { name: "description", tsType: "string", optional: true },
      { name: "region", tsType: "string", optional: true, replace: true },
      { name: "plan", tsType: "string", optional: true },
      { name: "osId", tsType: "number", optional: true, replace: true },
      { name: "appId", tsType: "number", optional: true, replace: true },
      { name: "imageId", tsType: "string", optional: true, replace: true },
      { name: "snapshotId", tsType: "string", optional: true, replace: true },
      { name: "userData", tsType: "string", optional: true },
      { name: "sshKeyIds", tsType: "ReadonlyArray<string>", optional: true },
      { name: "scriptId", tsType: "string", optional: true },
      { name: "firewallGroupId", tsType: "string", optional: true },
      { name: "tags", tsType: "ReadonlyArray<string>", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "Organization",
    file: "Organization",
    type: "Vultr.Organization",
    listPath: "/organizations",
    listKey: "organizations",
    wrapKey: "organization",
    description: "A Vultr Organization.",
    fields: [
      { name: "name", tsType: "string" },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "OidcIssuer",
    file: "OidcIssuer",
    type: "Vultr.OidcIssuer",
    listPath: "/oidc/issuers",
    listKey: "issuers",
    wrapKey: "issuer",
    description: "A Vultr OIDC issuer.",
    fields: [
      { name: "name", tsType: "string" },
      { name: "id", tsType: "string", attribute: true },
      { name: "issuerUrl", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
  {
    name: "OidcProvider",
    file: "OidcProvider",
    type: "Vultr.OidcProvider",
    listPath: "/oidc/providers",
    listKey: "providers",
    wrapKey: "provider",
    description: "A Vultr OIDC provider configuration.",
    fields: [
      { name: "name", tsType: "string" },
      { name: "issuerUrl", tsType: "string", replace: true },
      { name: "clientId", tsType: "string" },
      { name: "clientSecret", tsType: "string", optional: true },
      { name: "id", tsType: "string", attribute: true },
      { name: "dateCreated", tsType: "string", attribute: true },
    ],
  },
];

const camelToSnake = (value: string) =>
  value.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const toPropsInterface = (def: ResourceDef) => {
  const props = def.fields.filter((f) => !f.attribute);
  const lines = props.map((f) => {
    const doc = f.doc ? `  /** ${f.doc} */\n` : "";
    return `${doc}  ${f.name}${f.optional ? "?" : ""}: ${f.tsType};`;
  });
  return `export interface ${def.name}Props {\n${lines.join("\n")}\n}`;
};

const toAttributesInterface = (def: ResourceDef) => {
  const attrs = def.fields.filter(
    (f) => f.attribute || f.name === (def.idAttribute ?? "id") || (!f.attribute && def.idAttribute === f.name),
  );
  // Always include id-like props field as attribute if it's the id
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const f of def.fields) {
    const isId = f.name === (def.idAttribute ?? "id");
    if (!f.attribute && !isId) continue;
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    lines.push(`  ${f.name}: ${f.tsType};`);
  }
  // Ensure create-required id fields that are also props appear in attributes
  if (def.idAttribute && def.idAttribute !== "id") {
    const idField = def.fields.find((f) => f.name === def.idAttribute);
    if (idField && !seen.has(idField.name)) {
      lines.unshift(`  ${idField.name}: ${idField.tsType};`);
    }
  }
  return lines;
};

const generateFile = (def: ResourceDef): string => {
  const idAttr = def.idAttribute ?? "id";
  const propsFields = def.fields.filter((f) => !f.attribute);
  const attrLines = toAttributesInterface(def);
  // Ensure id attribute exists
  if (!attrLines.some((l) => l.includes(`${idAttr}:`))) {
    attrLines.unshift(`  ${idAttr}: string;`);
  }

  const createFields = propsFields.filter((f) => f.create !== false);
  const updateFields = propsFields.filter(
    (f) => f.update !== false && f.replace !== true && f.name !== idAttr,
  );
  const replaceFields = propsFields.filter((f) => f.replace);

  const createBodyEntries = createFields
    .map((f) => `    ${camelToSnake(f.name)}: props.${f.name},`)
    .join("\n");

  const updateDesiredEntries = updateFields
    .map((f) => `      ${camelToSnake(f.name)}: props.${f.name},`)
    .join("\n");

  const updateKeys = updateFields.map((f) => `"${camelToSnake(f.name)}"`).join(", ");

  const attrMappings = def.fields
    .filter((f) => f.attribute || f.name === idAttr)
    .map((f) => {
      const snake = camelToSnake(f.name);
      if (f.name === idAttr && idAttr !== "id" && !f.attribute) {
        return `    ${f.name}: String(live.${snake} ?? props.${f.name} ?? ""),`;
      }
      return `    ${f.name}: live.${snake} as ${f.tsType},`;
    })
    .join("\n");

  const getPath =
    def.getPath ??
    `${def.listPath}/{id}`;

  const mapped = byOldExport.get(def.name);
  if (!mapped) {
    throw new Error(
      `No service-map entry for catalog resource "${def.name}". Update scripts/_service-map.json.`,
    );
  }

  const exportName = mapped.exportName;
  const typeId = mapped.newType;
  const propsName = `${exportName}Props`;
  const attrsName = `${exportName}Attributes`;
  // Keep props interface names stable when the catalog still uses old export names
  // (e.g. FirewallGroupProps) so hand-edited call sites stay readable.
  const propsInterface = toPropsInterface(def).replace(
    `export interface ${def.name}Props`,
    `export interface ${propsName}`,
  );

  return `/* Generated by scripts/generate-resources.ts — edit the catalog to regenerate. */
import {
  compact,
  defineCrudResource,
  pickChanged,
  type JsonObject,
} from "../internal/defineResource.ts";

${propsInterface}

export type ${attrsName} = {
${attrLines.join("\n")}
};

const defined = defineCrudResource<
  "${typeId}",
  ${propsName},
  ${attrsName}
>({
  type: "${typeId}",
  aliases: ["${mapped.oldType}"],
  description: ${JSON.stringify(def.description)},
  stables: ["${idAttr}"],
  idAttribute: "${idAttr}",
  listPath: "${def.listPath}",
  listKey: "${def.listKey}",
  wrapKey: "${def.wrapKey}",
  getPath: (id) => \`${getPath.replace("{id}", "${id}")}\`,
  ${def.deletePath ? `deletePath: (id) => \`${def.deletePath.replace("{id}", "${id}")}\`,` : ""}
  ${def.updateMethod ? `updateMethod: "${def.updateMethod}",` : ""}
  ${def.immutable ? "immutable: true," : ""}
  replaceOnChange: [${replaceFields.map((f) => `"${f.name}"`).join(", ")}],
  toCreateBody: (props) =>
    compact({
${createBodyEntries}
    }),
  toUpdateBody: (props, live) =>
    pickChanged(
      {
${updateDesiredEntries}
      },
      live,
      [${updateKeys}],
    ),
  toAttributes: (live, props) => ({
${attrMappings}
  }),
});

/**
 * ${def.description}
 * @resource
 */
export const ${exportName} = defined.Resource;
export const ${exportName}Provider = defined.Provider;
`;
};

const srcRoot = join(import.meta.dir, "../src");
const byService = new Map<string, string[]>();

for (const def of resources) {
  const mapped = byOldExport.get(def.name);
  if (!mapped) {
    throw new Error(
      `No service-map entry for catalog resource "${def.name}". Update scripts/_service-map.json.`,
    );
  }
  const dir = join(srcRoot, mapped.service);
  mkdirSync(dir, { recursive: true });
  const content = generateFile(def);
  const path = join(dir, `${mapped.file}`);
  writeFileSync(path.endsWith(".ts") ? path : `${path}.ts`, content);
  const files = byService.get(mapped.service) ?? [];
  files.push(mapped.file.replace(/\.ts$/, ""));
  byService.set(mapped.service, files);
  console.log(`wrote ${join(mapped.service, mapped.file)}`);
}

// Service barrels (`src/<Service>/index.ts`) are maintained by hand so
// generated CRUD modules can sit alongside hand-written resources.

writeFileSync(
  join(import.meta.dir, "_catalog.json"),
  JSON.stringify(
    resources.map((r) => {
      const mapped = byOldExport.get(r.name)!;
      return {
        name: r.name,
        exportName: mapped.exportName,
        service: mapped.service,
        file: mapped.file,
        type: mapped.newType,
        alias: mapped.oldType,
      };
    }),
    null,
    2,
  ),
);

console.log(`Generated ${resources.length} resources across ${byService.size} services.`);
