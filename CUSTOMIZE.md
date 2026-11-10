# Customize the Credits Desk for your distribution company

Every distributor runs credits differently: different reason codes, different ERP exports, different vendor claim rules. This guide lists what to change, in the order that matters. Most of it is one file, `web/desk.config.json`.

The fast path is to let Claude Code do it: open the repo and use the prompt in the [README](README.md#make-it-yours). The rest of this page is what that prompt changes, so you can check its work.

## 1. `web/desk.config.json`

| Field | What it is | Example |
|---|---|---|
| `deskName`, `companyName` | Page title and the vendor email sign-off | `"Credits Desk"`, `"Sample Distribution Co."` |
| `intakeEmail` | The address shown on the page (mailto link). Use a dedicated inbox or a plus-address | `"credits@yourcompany.example"` |
| `logo` | A file in `web/public/`, or `null` | `"/logo.svg"` |
| `footer`, `dataLabel` | Footer text, and the badge saying what data is loaded | `"Sample data"` / `"Live: last 90 days"` |
| `vendorInboxTemplate` | How a vendor's claims address is built from its brand slug, until you load real contacts | `"claims@<slug>.example"` |
| `models.extract`, `models.draft` | Claude models for intake and for vendor drafts | `"claude-sonnet-5-5"`; `"claude-haiku-5-5"` is cheaper and faster |
| `reasonCodes` | **Your** credit reason codes → the app's reason and a triage group | `"SHORT DATED": {"reason": "expired", "group": "vendor_quality"}` |
| `groups` | Which groups are recoverable, plus the note shown on each claim | `vendor_quality` is recoverable; `customer`, `internal`, `warehouse_or_delivery` are not |
| `triage.recoverableWhen`, `triage.internalWhen` | The plain-English rules Claude uses to triage a new email | add "frozen product thawed in vendor transit" |

After you change reason codes, run `node scripts/build-claims.mjs`. It warns about any code in your data that the config doesn't map.

## 2. Your reason codes and triage rules (the part that matters most)

The recoverable vs internal split is the whole point, and it is specific to each company. Questions to settle with your credits and AP people before you trust the numbers:

- **Which of our codes are truly the manufacturer's fault?** Spoiled or poor quality on arrival, concealed damage inside vendor packaging, short-dated on arrival, mislabeled or wrong pack, recalls and vendor short-ships usually are. Mispicks, order-entry errors, over-ordering and driver damage usually aren't.
- **Grey areas:** "damaged" means concealed damage (vendor) or driver damage (yours)? Split the code if your ERP lumps them together, or add a rule to `triage` so Claude asks the question in the triage note.
- **Produce and protein houses** see far more quality claims than broadline; dry-goods-heavy houses see more dented cans and short-ships. Tune `recoverableWhen` to your mix.
- **Vendor programs:** some vendors pay a flat swell or damage allowance instead of per-claim credits. Mark those vendors' claims internal, or add a status for them, so you don't chase money you were already paid.

## 3. Your data

The dashboard seeds from `web/data/claims.json`, which `scripts/build-claims.mjs` builds from two files:

- **`credits.json`:** one row per credit line: `CREATED_DATE`, `LINE_ID`, `REASON` (your code), `ITEM_CODE`, `ITEM_NAME`, `BRAND`, `QUANTITY`, `UNIT_OF_MEASURE`, `UNIT_PRICE`, `CREDIT_AMOUNT`, `INVOICE_NUMBER`, `INVOICE_DATE`, `CUSTOMER_REF` (any customer id; it becomes "Customer #NNNN").
- **`items.json`:** recent invoice lines, used to match a new claim to what you actually shipped: `ITEM_CODE`, `ITEM_NAME`, `BRAND`, `UNIT_OF_MEASURE`, `MEDIAN_UNIT_PRICE`, `RECENT_LINES`, `LATEST_INVOICE_NUMBER`, `LATEST_INVOICE_DATE`, `LATEST_INVOICED_QUANTITY`, `LATEST_UNIT_PRICE`.

`web/scripts/make-sample-data.mjs` shows the exact shape. To use your own:

1. Export the last 90 days of credit lines and the last 60 days of invoice lines from your ERP as CSV. Keep the raw files **outside the repo**, or in `web/data/raw/` (gitignored).
2. Ask Claude: *"Convert my credits export at <path> and invoice export at <path> into web/data/credits.json and items.json in the shape of scripts/make-sample-data.mjs. Drop customer names, addresses, contacts, cost and margin columns; alias customer ids. Then run build-claims and precheck."*
3. `node scripts/precheck.mjs data` must pass. It also runs before every `pnpm build`.

**Never commit or deploy** customer names, contacts, costs or margins. The desk doesn't need them.

**Anonymize first.** `scripts/privacy/` has an anonymizer and the same fail-closed precheck. Run your raw exports through both before anything lands in `web/data/` (see `scripts/privacy/README.md`).

## 4. Vendor contacts and claim rules

`web/data/vendors.json` holds **sample** contacts on the reserved `.example` domain, so nothing can reach a real vendor by accident. When you go live:

- Replace them with real claims addresses (brand → email). Keep them out of git if they're not public.
- Add per-vendor rules the draft should respect: claim windows (for example "report concealed damage within 5 days"), photo or lot-code requirements, minimum claim amounts, and whether they want claims through a portal instead of email. Put them in `vendors.json` and have `src/lib/draft.ts` pass the vendor's rules into the prompt.
- Wire a real sender (your mail provider's API) into `src/app/api/claims/[id]/send/route.ts`. Send to an internal sandbox address first, and show the email text before it goes out.

## 5. The intake inbox

- **Demo:** the inbox agent prompt in [PROMPTS.md](PROMPTS.md#5-inbox-agent) runs in a second Claude Code session on `/loop 1m`. Scope its search to **only** the intake address, and give it only read and label rights.
- **Production:** point your mail provider's inbound webhook at `POST /api/intake` with `{"text": "...", "source": "email"}` and the `x-ingest-token` header.
- Forwarded threads (`FW: FW:`), several issues in one email, "pics attached", voice-to-text: the extractor handles these. Add your own examples from real emails to `src/lib/extract.ts` if it misreads your shorthand.

## 6. Brand

- Colors: the `@theme` and `:root` tokens at the top of `web/src/app/globals.css`. Ask for colors by hex, and check that buttons pass contrast with white text.
- Font: `web/src/app/layout.tsx` (`next/font/google`). The font variable must sit on `<html>`; a self-referencing `--font-sans` renders in Times.
- Voice of the vendor emails: the rules at the top of `web/src/lib/draft.ts` (open with the facts, real numbers, one clear ask, under 120 words).
- Keep text at 18px or larger if the desk goes on a warehouse or office screen.

## 7. Accounting and the ERP

The Accounting tab shows totals by vendor and status and a "ready to deduct" queue, and has an "Export CSV for the ERP" button. The columns are the `COLUMNS` list in `web/src/app/api/export/route.ts`. Change them to your ERP's import format with AP (vendor number, GL code and a deduction reference are common additions; add the vendor number to `credits.json` and the claim record if your ERP keys on it). Keep the formula guard in `cell()`: item names can come from untrusted email. Posting deductions straight to the ERP as vendor debit memos is the production version.

## Ideas from the room

- A search box and grouping by vendor or customer as the log grows.
- Week-over-week trends: which reasons are rising, and which reps or routes generate internal credits (coaching targets).
- Scheduled follow-ups to vendors who haven't answered in N days.
- A "dispute" path when a vendor rejects a claim, with the photos attached.
