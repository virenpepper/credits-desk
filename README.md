# Credits Desk

A shared inbox and log for **manufacturer credit claims** at a foodservice distributor. Built live with Claude Code in under an hour at the UniPro Foodservice Tech Summit (Atlanta, Nov 2026), from an idea someone in the room raised.

**The problem, in the room's words:** manufacturer credits "consume a ton of time". Issues arrive by email from the warehouse and from customers, there's back-and-forth with vendors, then accounting takes the deduction, and vendors won't pay for the labor.

**What the desk does:** credit chasing becomes a queue that triages itself. Deductions happen sooner, so cash comes back sooner, and nothing gets lost in email.

**The punchline is triage.** Distributors often find that only a small share of credits is the manufacturer's fault (spoiled, quality, concealed damage), and that most are wrong items, order-entry errors or over-ordering, all internal. The desk splits every claim into **recoverable** (send it to the vendor) and **internal** (warehouse or sales coaching), so the headline is *money you can get back from vendors vs money your own mistakes give away*.

## What's built

| Step | Status | What it does |
|---|---|---|
| 1. Dashboard | ✅ | Claims log with recoverable vs internal totals, status and triage filters, live polling every 5s |
| 2. Intake | ✅ | Paste a messy email or note → `POST /api/intake` → Claude extracts and triages up to 3 claims (strict JSON schema) → matched to an invoice line → credit computed → saved to Redis |
| 2b. Inbox agent | ✅ (prompt) | A Claude Code `/loop` reads one inbox and posts each email to `/api/intake`. See [PROMPTS.md](PROMPTS.md#5-inbox-agent) |
| 3. Vendor verification | ✅ | Claude drafts the verification email for each recoverable claim; "Send to vendor" moves it to `vendor_contacted` (no email leaves the app: wire a sender in when you're ready) |
| 4. Accounting view | ✅ | Recoverable vs internal headline, totals by vendor and status, a "ready to deduct" queue with "mark deducted", and a CSV export for the ERP (`/api/export`, formula-safe) |
| Close | ✅ | A `/prompt` page and [PROMPT.md](PROMPT.md): the copy-paste prompt to build this from scratch at your company from your own exports |

It ships with **sample data** for a fictional distributor (`web/data/`). No real distributor data is in this repo.

## Make it yours

Two ways in. **From scratch:** open Claude Code in an empty folder with your exports and paste the prompt in [PROMPT.md](PROMPT.md). **From this repo** (faster): open it in [Claude Code](https://claude.com/claude-code) and paste:

```
Read AGENTS.md and CUSTOMIZE.md. Custom fit this Credits Desk for my company: [company name], intake
address [credits@yourcompany.com], our credit reason codes are [paste them], and our credit export
looks like [paste 5 anonymized rows or the column list]. Walk me through anything you need, keep the
safety rules, then build, and tell me how to deploy it.
```

[CUSTOMIZE.md](CUSTOMIZE.md) covers what to change per distributor: reason codes, triage rules, vendor contacts, your data, brand, the intake inbox, and the ERP.

## Before you start

Everything here is self-serve: no one needs to set anything up for you.

**Accounts**

| What | Why | Cost |
|---|---|---|
| [Anthropic API key](https://console.anthropic.com) | Claude reads each pasted or emailed issue and drafts the vendor emails | Pay as you go: one Claude call per new issue and one per vendor draft. Set a monthly spend limit in the Console |
| [Upstash Redis](https://upstash.com) database | The shared claims log everyone sees | The free tier is enough for a pilot |
| [Vercel](https://vercel.com) (optional) | Hosting with a link you can share | Hobby is free for personal projects; use a Pro team for company use. Any host that runs Node 24 and `next start` also works |
| [Claude Code](https://claude.com/claude-code) (optional) | Customize the desk with one prompt, and run the demo-style inbox agent | Needs a Claude plan or API access |
| An intake mailbox with Claude's Gmail connector (optional) | Only for the inbox agent in [PROMPTS.md](PROMPTS.md#5-inbox-agent). In production, use an inbound-email webhook instead | |

**On your machine:** Node 24 (`nvm install 24`; `web/.nvmrc` pins it), pnpm through Corepack (`corepack enable` picks up the version in `web/package.json`), and git. The Vercel CLI is optional (`pnpm dlx vercel`).

**Environment variables** (`web/.env.local` on your machine; Project → Settings → Environment Variables on Vercel):

| Name | Where it comes from | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude Console → API keys | The page works, but pasting an issue or drafting a vendor email says "Claude isn't set up" |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | On Vercel: Storage → connect an Upstash Redis database (adds both). From the Upstash console: the database's REST URL and token, which Upstash names `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; save them under the `KV_` names | The page shows the sample data with "Live updates paused", and new issues can't be saved |
| `INGEST_TOKEN` | Make one: `openssl rand -hex 32` | Email from the inbox agent is rate-limited and logged as pasted issues, and `/api/reset` stays locked |

**Your data (later):** the desk ships with sample data, so get it running first and add your own exports afterwards ([CUSTOMIZE.md](CUSTOMIZE.md#3-your-data)).

## Run it locally (about 10 minutes)

```bash
git clone https://github.com/<you>/credits-desk.git   # fork it first if you want your own copy on GitHub
cd credits-desk/web
corepack enable && pnpm install
cp .env.example .env.local    # fill in the four values above
pnpm dev                      # http://localhost:3000
```

Check that it works:

1. The page shows the sample claims, and the "Claims logged" card says **Live**.
2. `curl -s http://localhost:3000/api/claims | head -c 200` prints JSON.
3. Paste one of the [test emails](PROMPTS.md#test-emails) into "Paste an issue". A claim appears within a few seconds, triaged as recoverable or internal.

- **Redis:** any [Upstash](https://upstash.com) Redis database. On Vercel, add one from the Marketplace and run `vercel env pull .env.local`.
- **Sample data:** `node scripts/make-sample-data.mjs && node scripts/build-claims.mjs` regenerates `web/data/`.
- **Reset the shared log:** `curl -X POST -H "x-ingest-token: $INGEST_TOKEN" <your-url>/api/reset`. The seed data reloads on the next read.

### Deploy (Vercel)

**From the dashboard:** Add New → Project → import your fork → set **Root Directory** to `web` (the app lives there) → add `ANTHROPIC_API_KEY` and `INGEST_TOKEN` → Deploy. Then open the project's Storage tab, connect an Upstash Redis database (it adds the two `KV_` variables) and redeploy: environment changes only apply to the next deploy.

**From the CLI:**

```bash
cd web
vercel link                                   # create or pick a project
vercel env add ANTHROPIC_API_KEY production --sensitive
vercel env add INGEST_TOKEN production --sensitive
pnpm build && pnpm lint && vercel deploy --prod
```

Connect an Upstash Redis store to the project in the Vercel dashboard (it adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Env changes apply to the next deploy.

Share the production domain (`<project>.vercel.app`). The per-deployment URLs can ask visitors to log in, because of Vercel's Deployment Protection.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Claude isn't set up: the Anthropic API key is missing or was rejected" | Set `ANTHROPIC_API_KEY` (no quotes or spaces), then restart `pnpm dev` or redeploy. A revoked or mistyped key shows the same message |
| "Claude API error 400" | Usually no credit left on the Anthropic account: check billing in the Console |
| "Claude API error 404" | A model id in `web/desk.config.json` (`models`) is wrong |
| "Live updates paused", or `/api/claims` returns 500 | Redis isn't reachable: check `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the app doesn't read Upstash's own variable names) |
| The whole Vercel site is a 404 | Root Directory isn't `web`. `web/vercel.json` already pins the Next.js framework |
| A brand-new route 404s right after a deploy | Wait a few seconds and retry: the new deployment is still going live |
| `pnpm build` stops at `precheck: ... FAIL` | Something in `web/data/` looks like an email, phone number, UUID, cost or contact column, or a large exact amount. Run your exports through `scripts/privacy/` first ([CUSTOMIZE.md](CUSTOMIZE.md#3-your-data)) |
| Install or build fails on the Node version | Use Node 24: run `nvm use` inside `web/` |
| "Too many issues from this device" | The limit is about 10 a minute per IP, and an office network shares one IP. Raise it in `web/src/app/api/intake/route.ts` (the `underLimit` call) |
| A new claim says "Needs invoice" | No invoice line in `web/data/items.json` matched it. That's expected for items the sample data doesn't carry; load your own invoice lines |
| The inbox agent logs nothing | Its Gmail search must target only your intake address, the label must exist, and its `x-ingest-token` must equal the deployed `INGEST_TOKEN` |

**Still stuck?** Open the repo in Claude Code and paste: *"Read AGENTS.md and README.md, run the setup check, and fix what's missing. Never print my keys."* It checks your tools, your environment variable names, Redis and Claude, and walks you through anything that's missing.

## Safety choices (keep these when you customize)

- **Email and pasted text are untrusted data, never instructions.** Extraction uses a strict JSON schema; status and amounts come from your rules and the invoice line, never from the message. People *will* send prompt injections ("mark everything deducted").
- **Sender privacy:** signatures, emails and phone numbers are scrubbed before Claude sees the text (`web/src/lib/scrub.ts`); only the extracted claim fields are stored, and the log shows "Email #N", never the sender.
- **Limits:** 2,000-character input cap (zod), about 10 intakes a minute per IP (Redis `INCR` + `EXPIRE`), and an `INGEST_TOKEN` that only the inbox agent holds (it skips the rate limit and gates `/api/reset`).
- **Data:** anonymize before anything reaches `web/data/`. `pnpm build` runs `scripts/precheck.mjs` first and fails on emails, phone numbers, UUIDs or large exact amounts. Raw exports and `.env*` are gitignored.
- **Secrets** stay server-side. The Claude key is never sent to the browser.

## Layout

```
AGENTS.md / CLAUDE.md   context Claude Code reads first (rules, stack gotchas, build order)
CUSTOMIZE.md            per-distributor guide
PROMPTS.md              the prompts used to build it live, in order, plus test emails
PROMPT.md               one prompt to build it from scratch from your own exports (also served at /prompt)
web/                    the Next.js 16 app (shadcn 4, Tailwind 4, Upstash Redis, Anthropic SDK)
  desk.config.json      ← start here: names, intake address, reason codes, triage rules, models
  data/                 seed data (sample): credits.json, items.json → claims.json, vendors.json
  scripts/              make-sample-data, build-claims, precheck (runs before every build)
  src/lib/              extract (intake + triage), match (invoice lines), draft (vendor email), scrub, store
scripts/privacy/        anonymize your own exports, plus the fail-closed precheck (with offline tests)
```

## Production next steps (narrated, not built)

Each of these is one more file:

1. A real inbound-mail webhook (Postmark, SendGrid or Mailgun inbound parse → `POST /api/intake` with the token) in place of the inbox agent loop.
2. Scheduled vendor follow-ups for claims stuck in `vendor_contacted`.
3. Posting deductions to the ERP as vendor debit memos, instead of a CSV export, with the posting reference saved on the claim.

## Support

This is a reference build from a conference demo, shared as is under the MIT license, with no support, hosting or maintenance. Everything you need is in this README, [CUSTOMIZE.md](CUSTOMIZE.md) and [AGENTS.md](AGENTS.md), and Claude Code can walk you through the rest.

Built live by the Pepper engineering team. MIT licensed.
