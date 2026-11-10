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

## Run it

Needs Node 24 and pnpm (`corepack enable`).

```bash
cd web
pnpm install
cp .env.example .env.local      # fill in Redis + Anthropic key + INGEST_TOKEN
pnpm dev                        # http://localhost:3000
```

- **Redis:** any [Upstash](https://upstash.com) Redis database. On Vercel, add one from the Marketplace and run `vercel env pull .env.local`.
- **Sample data:** `node scripts/make-sample-data.mjs && node scripts/build-claims.mjs` regenerates `web/data/`.
- **Reset the shared log:** `curl -X POST -H "x-ingest-token: $INGEST_TOKEN" <your-url>/api/reset`. The seed data reloads on the next read.

### Deploy (Vercel)

```bash
cd web
vercel link                                   # create or pick a project
vercel env add ANTHROPIC_API_KEY production --sensitive
vercel env add INGEST_TOKEN production --sensitive
pnpm build && pnpm lint && vercel deploy --prod
```

Connect an Upstash Redis store to the project in the Vercel dashboard (it adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Env changes apply to the next deploy.

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

Built live by the Pepper engineering team. MIT licensed.
