# privacy: anonymize and precheck your own exports

Node 24, zero npm deps. Run your raw exports through these before anything lands in `web/data/`.

- **Anonymize:** `node scripts/privacy/anonymize.mjs <raw.json> <out.json> [--label "A distributor"] [--names names.json] [--no-band-money]`. Takes an array of rows or `{rows:[...]}`. Drops cost, margin, contact, address and account-id columns; turns customer names into "Customer #NNNN", reps into "Rep N" and the distributor's name into the label; replaces UUIDs, emails and phone numbers inside strings; rounds lat/lng; and bands per-customer money. Aliases are stable thanks to a salt kept in `RAW_DIR` (default `~/.cache/credits-desk/raw`, outside the repo).
- **Precheck:** `node scripts/privacy/precheck.mjs <file-or-dir>... [--names names.json]`. Fails closed on banned keys, emails, phone numbers, UUIDs, exact per-customer money of $5k or more, and (with `--names`) any known name. It prints key paths only, never values. `web/scripts/precheck.mjs` is the same file and runs before every `pnpm build`.
- **Names list (optional):** `names.json` is an array of `{ "KIND": "restaurant" | "rep" | "employee" | "distributor", "UUID": "...", "NAME": "..." }` built from your own customer and staff lists. Keep it outside the repo.
- **Tests:** `node --test scripts/privacy/test/*.test.mjs` (offline).
