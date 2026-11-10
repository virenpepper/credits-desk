// Run: node --test scripts/privacy/test/*.test.mjs
// Offline tests for anonymize.mjs and precheck.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anonymize, createAliaser, buildNameIndex, loadSalt, moneyBand } from "../anonymize.mjs";
import { scanValue, prepareNames } from "../precheck.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = "dddddddd-0000-4000-8000-000000000001";
const R1 = "11111111-2222-4333-8444-555555555555";
const R2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRET_NAME = "Zanzibar Blue Oyster House";
const SECRET_EMAIL = "chef@zanzibar-example.com";
const SECRET_PHONE = "(404) 555-0199";

const NAMES = [
  { KIND: "restaurant", UUID: R1, NAME: SECRET_NAME },
  { KIND: "restaurant", UUID: R2, NAME: "Quillfeather Tavern" },
  { KIND: "distributor", UUID: DIST, NAME: "Palisade Provisions Co" },
  { KIND: "rep", UUID: "33333333-2222-4333-8444-555555555555", NAME: "Marguerite Okonkwo" },
];

const RAW_ROWS = [
  {
    CUSTOMER_UUID: R1, CUSTOMER_NAME: SECRET_NAME, CITY: "Atlanta", REGION: "GA", CUISINE: "Seafood",
    CATEGORIES_BOUGHT: 12, SPEND_90D: 18234.5, LAST_INVOICE_DATE: "2026-11-08",
    UNIT_COST: 1, GROSS_MARGIN: 2, COST_CENTER: "x", EMAIL: SECRET_EMAIL, PHONE_NUMBER: SECRET_PHONE,
    ADDRESS: "1 Main", ADDRESS2: "Suite 2", STREET_NUMBER: "1", ACCOUNT_ID: "A1", CUSTOMER_ID: "C1", ERP_ID: "E1",
    LATITUDE: 33.748995, LNG: "-84.387982", SALES_REP_NAME: "Marguerite Okonkwo", SUPPLIER_NAME: "Palisade Provisions Co",
    ITEM_NAME: "Shrimp 16/20 IQF", NOTES: `call ${SECRET_PHONE} or ${SECRET_EMAIL} re order ${R2}`,
  },
  { CUSTOMER_UUID: R2, NAME: "Quillfeather Tavern", CITY: "Macon", REGION: "GA", SPEND_90D: 999.99 },
];

function tmp() {
  return mkdtempSync(join(tmpdir(), "privacy-test-"));
}
function aliaser(registry = {}, salt = "s".repeat(64)) {
  return createAliaser({ salt, registry, label: "A distributor" });
}
function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
function assertNoSecrets(text) {
  for (const s of [SECRET_NAME, SECRET_EMAIL, SECRET_PHONE, "Quillfeather", "Marguerite", "Palisade", R1, R2]) {
    assert.ok(!text.includes(s), `output leaked a secret value`);
  }
}

// ---------- anonymize ----------

test("drops banned keys case-insensitively and keeps business columns", () => {
  const { data, dropped } = anonymize(RAW_ROWS, aliaser());
  const row = data[0];
  for (const k of ["UNIT_COST", "GROSS_MARGIN", "COST_CENTER", "EMAIL", "PHONE_NUMBER", "ADDRESS",
    "ADDRESS2", "STREET_NUMBER", "ACCOUNT_ID", "CUSTOMER_ID", "ERP_ID"]) {
    assert.ok(!(k in row), `${k} should be dropped`);
    assert.ok(dropped.includes(k));
  }
  assert.deepEqual(
    [row.CITY, row.REGION, row.CUISINE, row.CATEGORIES_BOUGHT, row.SPEND_90D, row.LAST_INVOICE_DATE, row.ITEM_NAME],
    ["Atlanta", "GA", "Seafood", 12, "$5k–25k", "2026-11-08", "Shrimp 16/20 IQF"],
  );
});

// ---------- money banding ----------

test("moneyBand boundaries are lower-inclusive", () => {
  const cases = [[-50, "<$1k"], [999.99, "<$1k"], [1000, "$1k–5k"], [4999.99, "$1k–5k"], [5000, "$5k–25k"],
    [25000, "$25k–100k"], [100000, "$100k–250k"], [250000, "$250k–1M"], [999999.99, "$250k–1M"], [1e6, "$1M+"]];
  for (const [n, label] of cases) assert.equal(moneyBand(n), label, String(n));
});

test("bands money in customer rows; keeps unit prices, counts, small credits and non-customer rows exact", () => {
  const rows = [
    {
      CUSTOMER_UUID: R1, CUSTOMER_NAME: "x", SPEND_90D: 1234567.89, TOTAL_SALES: "62000.10", GMV: 300,
      UNIT_PRICE: 7500, BASE_UNIT_PRICE: 12500000, TOTAL_ORDERS: 6000, CREDIT_AMOUNT: -4200, BIG_CREDIT_AMOUNT: 9000,
      LIFETIME_VALUE: null, AMOUNT_NOTE: "n/a",
    },
    { ITEM_NAME: "Shrimp", TOTAL_SPEND: 50000 },
  ];
  const { data } = anonymize(rows, aliaser());
  const [c, item] = data;
  assert.deepEqual(
    [c.SPEND_90D, c.TOTAL_SALES, c.GMV, c.BIG_CREDIT_AMOUNT],
    ["$1M+", "$25k–100k", "<$1k", "$5k–25k"],
  );
  assert.deepEqual(
    [c.UNIT_PRICE, c.BASE_UNIT_PRICE, c.TOTAL_ORDERS, c.CREDIT_AMOUNT, c.LIFETIME_VALUE, c.AMOUNT_NOTE],
    [7500, 12500000, 6000, -4200, null, "n/a"],
  );
  assert.equal(item.TOTAL_SPEND, 50000, "rows without a customer alias are not banded");
  assert.deepEqual(scanValue(data), [], "banded output passes precheck");
});

test("bandMoney:false keeps exact amounts, and precheck then fails on them", () => {
  const { data } = anonymize(RAW_ROWS, aliaser(), { bandMoney: false });
  assert.equal(data[0].SPEND_90D, 18234.5);
  assert.equal(data[1].SPEND_90D, 999.99);
  assert.deepEqual(scanValue(data), [{ kind: "exact_money", path: "[*].SPEND_90D" }]);
});

test("anonymize CLI bands by default and --no-band-money opts out", () => {
  const dir = tmp();
  writeFileSync(join(dir, "raw.json"), JSON.stringify(RAW_ROWS));
  const env = { RAW_DIR: join(dir, "raw") };
  const on = run("node", [join(SCRIPTS, "anonymize.mjs"), join(dir, "raw.json"), join(dir, "on.json")], env);
  assert.equal(on.code, 0, on.out);
  assert.match(on.out, /money_banded=2/);
  assert.equal(JSON.parse(readFileSync(join(dir, "on.json"), "utf8"))[0].SPEND_90D, "$5k–25k");
  const off = run("node", [join(SCRIPTS, "anonymize.mjs"), join(dir, "raw.json"), join(dir, "off.json"), "--no-band-money"], env);
  assert.match(off.out, /money_banded=off/);
  assert.equal(JSON.parse(readFileSync(join(dir, "off.json"), "utf8"))[0].SPEND_90D, 18234.5);
});

test("aliases customers, reps, the distributor, uuids and rounds lat/lng", () => {
  const { data } = anonymize(RAW_ROWS, aliaser());
  const [a, b] = data;
  assert.match(a.CUSTOMER_NAME, /^Customer #\d{4}$/);
  assert.match(b.NAME, /^Customer #\d{4}$/, "NAME in a row with CUSTOMER_UUID is a customer");
  assert.notEqual(a.CUSTOMER_NAME, b.NAME);
  assert.equal(a.SALES_REP_NAME, "Rep 1");
  assert.equal(a.SUPPLIER_NAME, "A distributor");
  assert.match(a.CUSTOMER_UUID, /^id_[0-9a-f]{6}$/);
  assert.equal(a.LATITUDE, 33.75);
  assert.equal(a.LNG, -84.39);
  assert.equal(a.NOTES, `call [phone] or [email] re order ${b.CUSTOMER_UUID}`);
});

test("aliases are stable across files and runs with the same salt, and differ with another salt", () => {
  const registry = {};
  const first = anonymize(RAW_ROWS, aliaser(registry)).data;
  const second = anonymize([{ CUSTOMER_UUID: R1, CUSTOMER_NAME: "renamed later" }], aliaser(registry)).data;
  assert.equal(second[0].CUSTOMER_NAME, first[0].CUSTOMER_NAME, "same uuid -> same alias");
  assert.equal(second[0].CUSTOMER_UUID, first[0].CUSTOMER_UUID);
  const other = anonymize(RAW_ROWS, aliaser({}, "t".repeat(64))).data;
  assert.notEqual(other[0].CUSTOMER_UUID, first[0].CUSTOMER_UUID);
});

test("2000 customers get 2000 distinct 4-digit aliases (no HMAC collisions leak through)", () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({
    CUSTOMER_UUID: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    CUSTOMER_NAME: `r${i}`,
  }));
  const { data } = anonymize(rows, aliaser());
  assert.equal(new Set(data.map((r) => r.CUSTOMER_NAME)).size, 2000);
});

test("handles {rows:[...]} and replaces exact known names anywhere via the names index", () => {
  const names = buildNameIndex(NAMES);
  const { data } = anonymize({ rows: [{ LABEL: SECRET_NAME, OWNER: "Palisade Provisions Co" }] }, aliaser(), { names });
  assert.match(data.rows[0].LABEL, /^Customer #\d{4}$/);
  assert.equal(data.rows[0].OWNER, "A distributor");
});

test("anonymized output passes the full precheck", () => {
  const { data } = anonymize(RAW_ROWS, aliaser(), { names: buildNameIndex(NAMES) });
  assert.deepEqual(scanValue(data, prepareNames(NAMES)), []);
});

test("salt is created once with 0600 and reused", () => {
  const dir = tmp();
  const s1 = loadSalt(dir);
  const s2 = loadSalt(dir);
  assert.equal(s1, s2);
  assert.equal(readFileSync(join(dir, "salt"), "utf8"), s1);
  assert.equal(statSync(join(dir, "salt")).mode & 0o777, 0o600);
});

// ---------- precheck ----------

test("precheck flags every kind of leak", () => {
  const kinds = new Set(scanValue(RAW_ROWS, prepareNames(NAMES)).map((f) => f.kind));
  assert.deepEqual([...kinds].sort(), ["banned_key", "email", "name", "phone", "uuid"]);
});

test("precheck skips short and generic names, matches on word boundaries", () => {
  const needles = prepareNames(["The Kitchen", "Cafe", "Bob", "Saffron & Sage"]);
  assert.deepEqual(needles, ["saffron sage"]);
  assert.equal(scanValue([{ ITEM_NAME: "The Kitchen towels" }], needles).length, 0);
  assert.equal(scanValue([{ X: "SAFFRON-SAGE #2" }], needles).length, 1);
  assert.equal(scanValue([{ X: "saffronsage" }], needles).length, 0);
});

test("precheck flags exact money >= $5k only in rows with a customer alias", () => {
  const rows = [
    { CUSTOMER: "Customer #0042", SPEND_90D: 1234567.89, TOTAL: "6000", GMV: 4999, UNIT_PRICE: 9000, REVENUE: "$1M+" },
    { ITEM_NAME: "Shrimp", TOTAL_SPEND: 50000 },
  ];
  assert.deepEqual(scanValue(rows).map((f) => f.path).sort(), ["[*].SPEND_90D", "[*].TOTAL"]);
});

test("precheck CLI reports exact money by key path without printing the amount", () => {
  const dir = tmp();
  writeFileSync(join(dir, "d.json"), JSON.stringify({ rows: [{ NAME: "Customer #0042", SPEND_90D: 1234567.89 }] }));
  const r = run("node", [join(SCRIPTS, "precheck.mjs"), dir]);
  assert.equal(r.code, 1);
  assert.match(r.out, /exact_money=1/);
  assert.match(r.out, /exact_money {2}rows\[\*\]\.SPEND_90D/);
  assert.ok(!/1234567|1,234,567/.test(r.out), "amount must not be printed");
});

test("precheck ignores single-token person names (role accounts collide with plain words)", () => {
  const needles = prepareNames([
    { KIND: "employee", NAME: "Receiving" },
    { KIND: "rep", NAME: "Marguerite Okonkwo" },
    { KIND: "restaurant", NAME: "Zanzibar" },
  ]);
  assert.deepEqual(needles.sort(), ["marguerite okonkwo", "zanzibar"]);
  assert.equal(scanValue([{ NOTE: "Confirm receiving hours before Thanksgiving" }], needles).length, 0);
});

test("precheck ignores dates, item codes and money that look numeric", () => {
  const rows = [{ D: "2026-11-09 23:01:33.152910+00:00", ITEM_CODE: "4045550199", SPEND: 1234567890, P: "12-16-2024" }];
  assert.deepEqual(scanValue(rows), []);
});

test("precheck CLI fails on leaks without printing any value or name", () => {
  const dir = tmp();
  writeFileSync(join(dir, "raw.json"), JSON.stringify(RAW_ROWS));
  writeFileSync(join(dir, "names.json"), JSON.stringify(NAMES));
  const r = run("node", [join(SCRIPTS, "precheck.mjs"), dir, "--names", join(dir, "names.json")]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL raw\.json|FAIL .*raw\.json/);
  assert.match(r.out, /skip .*names\.json/);
  assertNoSecrets(r.out);
});

test("precheck CLI pattern-only mode passes clean data and fails closed on bad JSON", () => {
  const dir = tmp();
  writeFileSync(join(dir, "ok.json"), JSON.stringify([{ CITY: "Atlanta", SPEND: 1 }]));
  assert.equal(run("node", [join(SCRIPTS, "precheck.mjs"), dir]).code, 0);
  writeFileSync(join(dir, "bad.json"), `{"NAME": "${SECRET_NAME}",`);
  const r = run("node", [join(SCRIPTS, "precheck.mjs"), dir]);
  assert.equal(r.code, 1);
  assertNoSecrets(r.out);
});
