---
"alchemy-vultr": patch
---

Wait for `Instance.Instance` resizes and creates to reach the requested plan with `status: "active"` and `server_status: "ok"` before reporting success. Public-IP instances still require a routable IPv4; VPC-only instances skip only that address check. Readiness polling issues only GETs after the accepted create or update, and `VultrNotReady` now reports the desired and observed plan plus lifecycle, IP, and power diagnostics.
