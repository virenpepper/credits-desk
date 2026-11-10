// node scripts/build-claims.mjs
// data/credits.json + data/items.json -> data/claims.json (the dashboard's seed) + data/vendors.json.
// Reason codes, groups and labels come from desk.config.json, so each distributor maps its own codes.
// Prints counts only, never values.
import { readFileSync, writeFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../desk.config.json", import.meta.url), "utf8"));
const credits = JSON.parse(readFileSync("data/credits.json", "utf8"));
const items = JSON.parse(readFileSync("data/items.json", "utf8"));

const customerAlias = new Map();
const customer = (id) => {
  if (!id) return null;
  if (!customerAlias.has(id)) customerAlias.set(id, `Customer #${1001 + customerAlias.size}`);
  return customerAlias.get(id);
};

const rows = [...credits].sort(
  (a, b) => a.CREATED_DATE.localeCompare(b.CREATED_DATE) || a.LINE_ID.localeCompare(b.LINE_ID),
);

const unmapped = new Set();
const claims = rows.map((r, i) => {
  const code = config.reasonCodes[r.REASON];
  if (!code) unmapped.add(r.REASON);
  // The config wins over the group the export assigned.
  const groupKey = code?.group ?? r.REASON_GROUP;
  const group = config.groups[groupKey];
  const recoverable = group?.recoverable === true;
  const status = recoverable ? "new" : "internal";
  const createdAt = `${r.CREATED_DATE}T12:00:00.000Z`;
  return {
    id: `CLM-${2001 + i}`,
    createdAt,
    source: "seed",
    reporter: "customer",
    vendor: r.BRAND ?? "Unknown brand",
    itemCode: r.ITEM_CODE ?? null,
    itemName: r.ITEM_NAME ?? "Unknown item",
    qty: r.QUANTITY ?? 0,
    uom: (r.UNIT_OF_MEASURE ?? "unit").toLowerCase(),
    reason: code?.reason ?? "other",
    recoverable,
    triageNote: `${group?.note ?? "Unmapped reason."} (Distributor code: ${r.REASON})`,
    invoiceNumber: r.INVOICE_NUMBER ?? null,
    invoiceDate: r.INVOICE_DATE ?? null,
    customer: customer(r.CUSTOMER_REF),
    unitPrice: r.UNIT_PRICE ?? null,
    creditAmount: r.CREDIT_AMOUNT ?? null,
    status,
    history: [{ at: createdAt, status, note: "Imported from the distributor's credit requests" }],
  };
});

writeFileSync(
  "data/claims.json",
  JSON.stringify({ label: `${config.dataLabel} (${claims.length} credit lines)`, claims }, null, 2) + "\n",
);

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vendor";
const brands = [...new Set([...credits, ...items].map((r) => r.BRAND).filter(Boolean))].sort();
const vendors = brands.map((brand) => ({ brand, slug: slug(brand) }));

writeFileSync(
  "data/vendors.json",
  JSON.stringify(
    {
      label: "Sample contacts: made-up addresses, not real vendor emails",
      inboxTemplate: config.vendorInboxTemplate,
      vendors,
    },
    null,
    2,
  ) + "\n",
);

const sum = (cs) => cs.reduce((t, c) => t + (c.creditAmount ?? 0), 0).toFixed(2);
const rec = claims.filter((c) => c.recoverable);
console.log(
  `claims.json: ${claims.length} claims | recoverable ${rec.length} ($${sum(rec)}) | internal ${claims.length - rec.length} ($${sum(claims.filter((c) => !c.recoverable))}) | customers ${customerAlias.size}`,
);
console.log(`vendors.json: ${vendors.length} sample contacts (${config.vendorInboxTemplate})`);
if (unmapped.size) {
  console.warn(`WARNING: ${unmapped.size} reason code(s) missing from desk.config.json reasonCodes; they triage as "other"`);
}
