---
"alchemy-vultr": minor
---

`Instance.Instance` now replaces the VM when a create-only ("first boot") input changes — `userData`, `sshKeyIds`, `scriptId`, `disablePublicIpv4`, `reservedIpv4`, `userScheme`, `appVariables`, and the new `bootstrapVersion` — matching the `ForceNew` fields of Vultr's Terraform provider. Previously `userData` was PATCHed (which cloud-init never replays) while `scriptId` and `sshKeyIds` were ignored outright, so Alchemy recorded a convergence that never physically happened.

A replacement-sensitive input that is still an unresolved Output now plans a replacement instead of falling back to the engine's in-place update, and reconcile fails with a typed `VultrCreateOnlyChange` rather than reporting converged attributes when it reaches a running VM with create-only drift. Set `replaceOnBootstrapChange: false` to opt out (the provider warns instead of replacing).
