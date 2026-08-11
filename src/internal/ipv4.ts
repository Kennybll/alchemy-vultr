/**
 * IPv4 classification for provisioning placeholders.
 *
 * Vultr reports `main_ip: "0.0.0.0"` while an instance is still being
 * provisioned. Handing that (or any other non-routable address) to downstream
 * resources publishes a DNS record that can never resolve, so providers check
 * an address before declaring it converged.
 */

/** Parsed octets, or `undefined` when `value` is not a dotted-quad IPv4. */
export const parseIpv4 = (value: unknown): [number, number, number, number] | undefined => {
  if (typeof value !== "string") return undefined;
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    // Reject empty, signed, whitespace-padded, and zero-padded (octal-looking)
    // octets so "010.0.0.1" and " 1.2.3.4" never pass as valid.
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    octets.push(octet);
  }
  return octets as [number, number, number, number];
};

/**
 * Whether `value` is a globally routable IPv4 address — i.e. an address Vultr
 * has actually assigned, not a placeholder or a private/reserved range.
 *
 * Rejects `0.0.0.0/8` (the provisioning placeholder), RFC 1918 private space,
 * CGNAT, loopback, link-local, the documentation/benchmark ranges, multicast,
 * reserved space, IPv6, and anything malformed.
 */
export const isPublicIpv4 = (value: unknown): boolean => {
  const octets = parseIpv4(value);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0) return false; // 0.0.0.0/8 — "this network", incl. the placeholder
  if (a === 10) return false; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && octets[2] === 0) return false; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && octets[2] === 2) return false; // TEST-NET-1
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, 255.255.255.255
  return true;
};
