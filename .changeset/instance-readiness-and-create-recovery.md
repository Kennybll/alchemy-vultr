---
"alchemy-vultr": minor
---

`Instance.Instance` no longer returns the `0.0.0.0` provisioning placeholder as `mainIp`. Reconcile now polls `GET /instances/{id}` until Vultr reports a routable public IPv4 (bounded by the new `readinessTimeout`, default 15 minutes, and `readinessPollInterval`, default 5 seconds), or fails with a typed `VultrNotReady` carrying the instance id, attempt count, and the last observed `main_ip`/`status`/`server_status`. Private, loopback, link-local, CGNAT, documentation, multicast, reserved, malformed, and IPv6 values are never returned as a public `mainIp`. Instances created with `disablePublicIpv4: true` do not wait.

Instance creation is now recoverable, which is what makes that wait safe. Every instance is tagged `alchemy-vultr-recover-<hash>` (alongside your own tags), keyed on stack + stage + resource FQN + create-only props rather than Alchemy's generation id, so a deployment interrupted between `POST /instances` and the state commit — including one that restarts a replacement with a fresh generation — adopts the VM Vultr already accepted instead of creating a duplicate. Creates use the new single-attempt `VultrClient.postOnce` and re-check for that tag after every ambiguous failure, so a lost create response results in exactly one `POST /instances`. Recovery fails closed with `VultrAmbiguousRecovery` if more than one instance claims the tag.

**Upgrading with `mainIp: "0.0.0.0"` already in state:** the fix prevents future bad creates but does not refresh an existing stable resource, because Alchemy reuses persisted attributes for no-op resources. Trigger one targeted reconcile of the instance (for example a durable label/tag change) or run a state sync to repair the recorded address and any DNS records derived from it.
