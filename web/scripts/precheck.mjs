#!/usr/bin/env node
// precheck.mjs <dir-or-file>... [--names <names.json>]
//
// Scans every .json file under the given paths and exits 1 if it finds:
//   - a banned key (cost, margin, profit, email, phone, contact, address, account ids...)
//   - a value (or key) matching a UUID, email or phone pattern
//   - with --names: any value containing a known raw name (5+ chars, generic words ignored)
//   - in a row with a "Customer #NNNN" alias, a money-like field (spend, sales, total...) holding
//     an exact number >= 5000 (band it with anonymize --band-money)
//
// Output is counts plus offending key paths and file names only. It NEVER prints a
// matched value or a name, so a failure is safe to show on a projector.
//
// Without --names it runs in pattern-only mode. That mode needs nothing but this file
// and Node built-ins, so it is safe to copy into the app and run as a prebuild step on
// Vercel (e.g. "prebuild": "node scripts/precheck.mjs data"): no raw names ship with it.
//
// Exit codes: 0 clean, 1 findings or unreadable JSON, 2 usage error.

import { readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { pathToFileURL } from "node:url";

export const BANNED_KEY =
  /cost|margin|gross_?profit|profit|email|phone|contact|password|token|secret|street|address_line|^address$|^address_?\d+$|raw_address|postal|zip_?code|account_id|customer_id|erp_id/i;
export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 555-123-4567, (555) 123-4567, 555.123.4567, +1 555 123 4567, +15551234567.
// Bare digit runs are not flagged: item codes and invoice numbers look like that.
export const PHONE_RE =
  /(?<![\d-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\d-])|\+\d{10,15}(?!\d)/g;

// Exact per-customer dollar amounts can re-identify a customer ("$1,234,567 in Springfield").
// In a row that carries a "Customer #NNNN" alias, money-like fields must be banded
// (anonymize --band-money) or below EXACT_MONEY_LIMIT. Unit prices and counts are not money.
export const CUSTOMER_ALIAS_RE = /^Customer #\d{4}$/;
export const MONEY_KEY = /spend|revenue|sales|total|amount|value|gmv/i;
export const UNIT_PRICE_KEY = /unit|^(item|case|list|base|each)_?price/i;
export const COUNT_KEY = /count|qty|quantity|^num_|_num$|^n_|pct|percent|ratio|rate|share|days|orders$|invoices$|lines$|items$/i;
export const CREDIT_KEY = /credit/i;
export const EXACT_MONEY_LIMIT = 5000;

export function isMoneyKey(k) {
  return MONEY_KEY.test(k) && !UNIT_PRICE_KEY.test(k) && !COUNT_KEY.test(k);
}

/** A finite number from a number or numeric string, else null. */
export function moneyNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

export function isCustomerRow(obj) {
  return Object.values(obj).some((x) => typeof x === "string" && CUSTOMER_ALIAS_RE.test(x));
}

// Words that do not identify anyone on their own. A name made only of these is skipped.
export const GENERIC_WORDS = new Set(
  `the and of a an at on in by for to n
  restaurant restaurants kitchen kitchens cafe cafes grill grille bar bars pub tavern
  pizza pizzeria bistro deli diner bakery eatery catering caterers market markets food foods
  foodservice service services distribution distributor distributors supply wholesale
  inc llc ltd co company corp corporation group holdings enterprises
  house club hotel inn school church center centre store shop shoppe express
  bbq taqueria sushi burger burgers chicken wings coffee tea juice bagel bagels steakhouse
  seafood mexican italian chinese thai indian japanese korean american cuisine
  test demo sample new old north south east west main street`.split(/\s+/).filter(Boolean),
);

/** Lowercase, punctuation to spaces, collapse whitespace. "Joe's  Pizza!" -> "joe s pizza". */
export function normalizeText(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** People (rep/employee rows) need first + last name: one token is a role account or a bare first name. */
export function isPersonKind(kind) {
  return /^(rep|employee)$/i.test(String(kind ?? ""));
}

/** Turn raw name rows into normalized needles worth searching for. */
export function prepareNames(rows) {
  const needles = new Set();
  for (const row of rows) {
    const name = typeof row === "string" ? row : pick(row, "name");
    if (typeof name !== "string") continue;
    const norm = normalizeText(name);
    const distinctive = norm.split(" ").filter((w) => !GENERIC_WORDS.has(w)).join("");
    if (isPersonKind(pick(row, "kind")) && norm.split(" ").length < 2) continue;
    if (norm.length >= 5 && distinctive.length >= 5) needles.add(norm);
  }
  return [...needles];
}

function pick(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === key);
  return k === undefined ? undefined : obj[k];
}

export function loadNames(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  return prepareNames(Array.isArray(data) ? data : data.rows ?? []);
}

function test(re, s) {
  re.lastIndex = 0;
  return re.test(s);
}

/**
 * Scan one parsed JSON value. Returns findings as {kind, path} with array indices
 * collapsed to [*]. Never returns the matched text.
 */
export function scanValue(root, needles = []) {
  const findings = [];
  const add = (kind, path) => findings.push({ kind, path: path || "(root)" });
  const hasName = (s) => {
    if (!needles.length) return false;
    const hay = ` ${normalizeText(s)} `;
    return needles.some((n) => hay.includes(` ${n} `));
  };
  const checkString = (s, path) => {
    if (test(UUID_RE, s)) add("uuid", path);
    if (test(EMAIL_RE, s)) add("email", path);
    if (test(PHONE_RE, s)) add("phone", path);
    if (hasName(s)) add("name", path);
  };
  const walk = (v, path) => {
    if (typeof v === "string") return checkString(v, path);
    if (Array.isArray(v)) return v.forEach((x) => walk(x, `${path}[*]`));
    if (v && typeof v === "object") {
      const customerRow = isCustomerRow(v);
      for (const [k, x] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k;
        if (BANNED_KEY.test(k)) add("banned_key", p);
        const n = customerRow && isMoneyKey(k) ? moneyNumber(x) : null;
        if (n !== null && Math.abs(n) >= EXACT_MONEY_LIMIT) add("exact_money", p);
        checkString(k, `${p} (key)`);
        walk(x, p);
      }
    }
  };
  walk(root, "");
  return findings;
}

function listJson(target, explicit) {
  const st = statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const p = join(target, entry.name);
    if (entry.isDirectory()) out.push(...listJson(p, false));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(p);
  }
  return explicit ? out.sort() : out;
}

const KINDS = ["banned_key", "uuid", "email", "phone", "name", "exact_money"];

/** Scan files; returns {files, failed, report[]}. Report lines contain no values. */
export function scan(targets, { namesFile } = {}) {
  const needles = namesFile ? loadNames(namesFile) : [];
  const skip = namesFile ? realpathSync(namesFile) : null;
  const report = [];
  let files = 0;
  let failed = 0;
  report.push(
    namesFile
      ? `precheck: mode=patterns+names (${needles.length} names checked)`
      : "precheck: mode=patterns-only",
  );
  for (const target of targets) {
    for (const file of listJson(target, true)) {
      const shown = relative(process.cwd(), file).startsWith("..") ? basename(file) : relative(process.cwd(), file);
      if (skip && realpathSync(file) === skip) {
        report.push(`  skip ${shown} (names list)`);
        continue;
      }
      files++;
      let data;
      try {
        data = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        failed++;
        report.push(`  FAIL ${shown}: not valid JSON`);
        continue;
      }
      const findings = scanValue(data, needles);
      if (!findings.length) {
        report.push(`  ok   ${shown}`);
        continue;
      }
      failed++;
      const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
      const paths = new Map();
      for (const f of findings) {
        counts[f.kind]++;
        const key = `${f.kind}  ${f.path}`;
        paths.set(key, (paths.get(key) ?? 0) + 1);
      }
      report.push(`  FAIL ${shown}: ${KINDS.map((k) => `${k}=${counts[k]}`).join(" ")}`);
      const top = [...paths.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key, n] of top.slice(0, 15)) report.push(`       ${key}  x${n}`);
      if (top.length > 15) report.push(`       ... ${top.length - 15} more paths`);
    }
  }
  report.push(`precheck: ${files} file(s), ${failed} failed -> ${failed ? "FAIL" : "PASS"}`);
  return { files, failed, report };
}

function main(argv) {
  const targets = [];
  let namesFile;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--names") namesFile = argv[++i];
    else targets.push(argv[i]);
  }
  if (!targets.length || (argv.includes("--names") && !namesFile)) {
    console.error("usage: precheck.mjs <dir-or-file>... [--names names.json]");
    return 2;
  }
  try {
    const { files, failed, report } = scan(targets, { namesFile });
    console.log(report.join("\n"));
    if (!files) {
      console.log("precheck: no .json files found -> FAIL");
      return 1;
    }
    return failed ? 1 : 0;
  } catch (err) {
    // Error messages from fs/JSON carry paths, never file contents.
    console.error(`precheck: error: ${err.code ?? err.name}: ${err.code ? err.path ?? "" : "bad input"}`);
    return 1;
  }
}

const isMain =
  import.meta.main ??
  (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
