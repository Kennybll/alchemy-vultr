---
"alchemy-vultr": patch
---

Prevent duplicate paid instances after an ambiguous create response. `Instance.Instance` now sends exactly one `POST /instances` per reconciliation, polls only its stable ownership tag through delayed list visibility, and fails closed with `VultrCreateUncertain` when the bounded recovery window expires. The new `createRecoveryTimeout` and `createRecoveryPollInterval` props control that window and backoff, including when Effect durations have round-tripped through persisted state.
