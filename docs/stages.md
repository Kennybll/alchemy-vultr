# Stages with alchemy-vultr

Alchemy [stages](https://alchemy.run/environments/stages/) isolate stack
**state** and **physical names**. Vultr itself has one shared account per API
key — there is no cloud-native stage boundary — so this provider relies on
Alchemy’s naming helpers the same way AWS/Cloudflare providers do.

## Deploy / destroy

```bash
export VULTR_API_KEY=...
bun alchemy deploy examples/basic.ts --stage livea
bun alchemy deploy examples/basic.ts --stage liveb
bun alchemy destroy examples/basic.ts --stage livea   # leaves liveb alone
```

Resolution order matches Alchemy: `--stage`, then `$STAGE`, then `dev_$USER`.

## Physical names

`SshKey` and `StartupScript` omit-able `name` props use
`createPhysicalName` → `{stack}-{id}-{stage}-{suffix}`.

| Pattern | Multi-stage safe? |
| --- | --- |
| Omit `name` (default physical name) | Yes — stage is in the name |
| Hard-coded `name: "deploy"` on every stage | **No** — stages collide / adopt each other |
| Stage-scoped labels (`description: \`net-${stage}\``) | Yes for human labels; VPC descriptions are not unique-constrained |

Prefer omitting `name` for account-global named resources (SSH keys, startup
scripts). Branch on `yield* Alchemy.Stage` (or `yield* Alchemy.Stack`) for
per-stage config.

## Live coverage

`test/live/Stages.test.ts` deploys the same stack to `livea` and `liveb`,
asserts distinct cloud ids + stage-embedded physical names, destroys `livea`,
and proves `liveb` resources remain until their own destroy.
