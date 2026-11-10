# web: the Credits Desk app

Next.js 16 (App Router, Cache Components), shadcn 4 on Base UI, Tailwind 4, Upstash Redis, Anthropic SDK.

```bash
pnpm install
cp .env.example .env.local   # Redis, ANTHROPIC_API_KEY, INGEST_TOKEN
pnpm dev
```

Prerequisites, environment variables and troubleshooting: [README](../README.md#before-you-start).

Per-distributor settings live in `desk.config.json`. See the repo's [README](../README.md), [CUSTOMIZE.md](../CUSTOMIZE.md) and [AGENTS.md](../AGENTS.md).
