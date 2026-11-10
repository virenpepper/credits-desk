#!/usr/bin/env node
// anonymize.mjs <raw.json> <out.json> [--label "A distributor"] [--names names.json]
//               [--band-money (default) | --no-band-money]
//
// Accepts an array of row objects or {rows:[...]}; keys match case-insensitively
// (warehouse exports often use UPPERCASE column names). Recurses into nested objects.
//   - drops banned keys (cost, margin, profit, email, phone, contact, address, account ids...)
//   - customer names -> "Customer #NNNN"; rep names -> "Rep N"; distributor name -> --label
//   - every UUID inside a string -> "id_<6 hex>"; emails/phones inside strings -> [email]/[phone]
//   - lat/lng keys rounded to 2 decimals
//   - --band-money (on by default): in a row carrying a customer alias, money-like numbers
//     (spend, revenue, sales, total, amount, value, gmv) become "<$1k" ... "$1M+". Unit prices,
//     counts and per-item credits under $5,000 stay exact. precheck fails on exact amounts >= $5,000.
// Aliases come from HMAC-SHA256 with a salt in $RAW_DIR/salt (created once), so they are
// stable across files but not reversible. $RAW_DIR/aliases.json remembers which 4-digit
// number each customer got (keyed by HMAC digest, no names) so two customers never share one.
// --names (default $RAW_DIR/names.json if present) also replaces values that exactly equal a
// known restaurant, distributor or rep name, wherever they appear.
// Prints only counts and dropped column names.

import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BANNED_KEY, UUID_RE, EMAIL_RE, PHONE_RE, CREDIT_KEY, EXACT_MONEY_LIMIT,
  normalizeText, isPersonKind, isMoneyKey, moneyNumber, isCustomerRow,
} from "./precheck.mjs";

const MONEY_BANDS = [
  [1_000, "<$1k"],
  [5_000, "$1k–5k"],
  [25_000, "$5k–25k"],
  [100_000, "$25k–100k"],
  [250_000, "$100k–250k"],
  [1_000_000, "$250k–1M"],
];

/** 18234.5 -> "$5k–25k". Lower bound inclusive. */
export function moneyBand(n) {
  for (const [upper, label] of MONEY_BANDS) if (n < upper) return label;
  return "$1M+";
}

export const DEFAULT_LABEL = "A distributor";
const CUSTOMER_NAME_KEY = /^(restaurant|business|customer|account|buyer|client)_?name$/i;
const DISTRIBUTOR_NAME_KEY = /^(distributor|supplier|vendor|seller)_?name$/i;
const REP_NAME_KEY = /^(sales_?)?rep(_?name)?$|^sales_?rep_?name$|^salesperson(_?name)?$/i;
const CUSTOMER_UUID_KEY = /^(restaurant|customer|business)_?uuid$/i;
const LATLNG_KEY = /^(lat|lng|lon|long|latitude|longitude)$|_(lat|lng|lon|latitude|longitude)$/i;

export function rawDir() {
  return process.env.RAW_DIR || join(homedir(), ".cache", "credits-desk", "raw");
}

/** Read the salt, creating it once (0600) if missing. */
export function loadSalt(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "salt");
  try {
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
  const salt = readFileSync(file, "utf8").trim();
  if (salt.length < 32) throw new Error(`salt file ${file} is too short; delete it to regenerate`);
  return salt;
}

export function createAliaser({ salt, registry = { customers: {}, reps: {} }, label = DEFAULT_LABEL }) {
  registry.customers ??= {};
  registry.reps ??= {};
  const usedCustomer = new Set(Object.values(registry.customers));
  const stats = { customers: new Set(), reps: new Set(), ids: new Set(), distributor: 0, redacted: 0, rounded: 0, banded: 0 };
  const digest = (x) => createHmac("sha256", salt).update(x).digest("hex");
  const idKey = (uuid) => digest(`id:${uuid.toLowerCase()}`);
  const nameKey = (name) => digest(`name:${normalizeText(name)}`);

  const fromDigest = (d) => {
    const slot = d.slice(0, 16);
    if (registry.customers[slot] === undefined) {
      if (usedCustomer.size >= 10000) throw new Error("customer alias space (10000) exhausted");
      let n = parseInt(d.slice(0, 8), 16) % 10000;
      while (usedCustomer.has(n)) n = (n + 1) % 10000;
      registry.customers[slot] = n;
      usedCustomer.add(n);
    }
    stats.customers.add(slot);
    return `Customer #${String(registry.customers[slot]).padStart(4, "0")}`;
  };

  return {
    stats,
    registry,
    label,
    id(uuid) {
      stats.ids.add(uuid.toLowerCase());
      return `id_${idKey(uuid).slice(0, 6)}`;
    },
    /** Prefer the customer's uuid; fall back to the name. */
    customer({ uuid, name }) {
      return fromDigest(uuid ? idKey(uuid) : nameKey(name));
    },
    rep(name) {
      const slot = nameKey(name).slice(0, 16);
      if (registry.reps[slot] === undefined) {
        registry.reps[slot] = Object.keys(registry.reps).length + 1;
      }
      stats.reps.add(slot);
      return `Rep ${registry.reps[slot]}`;
    },
    distributor() {
      stats.distributor++;
      return label;
    },
  };
}

/** Map normalized name -> {kind, uuid} from names.json rows ({KIND, UUID, NAME}). */
export function buildNameIndex(rows) {
  const index = new Map();
  const rank = { distributor: 3, restaurant: 2, rep: 1, employee: 0 };
  for (const row of rows) {
    const get = (k) => row[Object.keys(row).find((x) => x.toLowerCase() === k)];
    const name = get("name");
    const kind = String(get("kind") ?? "").toLowerCase();
    if (typeof name !== "string" || !(kind in rank)) continue;
    const norm = normalizeText(name);
    if (!norm || (isPersonKind(kind) && norm.split(" ").length < 2)) continue;
    const prev = index.get(norm);
    if (!prev || rank[kind] > rank[prev.kind]) index.set(norm, { kind, uuid: get("uuid") });
  }
  return index;
}

function scrubString(s, alias, stats) {
  let out = s.replace(UUID_RE, (m) => alias.id(m));
  out = out.replace(EMAIL_RE, () => (stats.redacted++, "[email]"));
  out = out.replace(PHONE_RE, () => (stats.redacted++, "[phone]"));
  return out;
}

function asNumber(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** In a row carrying a customer alias, replace money-like numbers with a band label. */
function bandMoney(row, stats) {
  if (!isCustomerRow(row)) return;
  for (const k of Object.keys(row)) {
    const n = isMoneyKey(k) ? moneyNumber(row[k]) : null;
    if (n === null) continue;
    if (CREDIT_KEY.test(k) && Math.abs(n) < EXACT_MONEY_LIMIT) continue; // small per-item credits stay exact
    row[k] = moneyBand(n);
    stats.banded++;
  }
}

export function anonymize(data, alias, { names = new Map(), bandMoney: band = true } = {}) {
  const { stats } = alias;
  const dropped = new Set();

  const byNameIndex = (s) => {
    const hit = names.get(normalizeText(s));
    if (!hit) return null;
    if (hit.kind === "distributor") return alias.distributor();
    if (hit.kind === "restaurant") return alias.customer({ uuid: hit.uuid, name: s });
    return alias.rep(s);
  };

  const walk = (v) => {
    if (typeof v === "string") return byNameIndex(v) ?? scrubString(v, alias, stats);
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;

    const keys = Object.keys(v);
    const uuidKey = keys.find((k) => CUSTOMER_UUID_KEY.test(k) && typeof v[k] === "string");
    const customerUuid = uuidKey ? v[uuidKey] : undefined;
    const out = {};
    for (const k of keys) {
      if (BANNED_KEY.test(k)) {
        dropped.add(k);
        continue;
      }
      const val = v[k];
      const outKey = scrubString(k, alias, stats);
      const isText = typeof val === "string" && val.trim() !== "";
      if (isText && (CUSTOMER_NAME_KEY.test(k) || (/^name$/i.test(k) && customerUuid))) {
        out[outKey] = alias.customer({ uuid: customerUuid, name: val });
      } else if (isText && DISTRIBUTOR_NAME_KEY.test(k)) {
        out[outKey] = alias.distributor();
      } else if (isText && REP_NAME_KEY.test(k)) {
        out[outKey] = alias.rep(val);
      } else if (LATLNG_KEY.test(k) && asNumber(val) !== null) {
        stats.rounded++;
        out[outKey] = Math.round(asNumber(val) * 100) / 100;
      } else {
        out[outKey] = walk(val);
      }
    }
    if (band) bandMoney(out, stats);
    return out;
  };

  return { data: walk(data), dropped: [...dropped].sort() };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, { mode: 0o644 });
  renameSync(tmp, file);
}

function main(argv) {
  const pos = [];
  let label = DEFAULT_LABEL;
  let namesFile;
  let band = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--label") label = argv[++i];
    else if (argv[i] === "--names") namesFile = argv[++i];
    else if (argv[i] === "--band-money") band = true;
    else if (argv[i] === "--no-band-money") band = false;
    else pos.push(argv[i]);
  }
  if (pos.length !== 2 || !label) {
    console.error(
      'usage: anonymize.mjs <raw.json> <out.json> [--label "..."] [--names names.json] [--no-band-money]',
    );
    return 2;
  }
  const [input, output] = pos;
  const dir = rawDir();
  namesFile ??= existsSync(join(dir, "names.json")) ? join(dir, "names.json") : undefined;

  let raw;
  try {
    raw = JSON.parse(readFileSync(input, "utf8"));
  } catch (err) {
    // Never print err.message for JSON errors: it quotes file contents.
    console.error(`anonymize: cannot read ${input} as JSON (${err.code ?? err.name})`);
    return 1;
  }
  const regFile = join(dir, "aliases.json");
  const registry = existsSync(regFile) ? JSON.parse(readFileSync(regFile, "utf8")) : {};
  const alias = createAliaser({ salt: loadSalt(dir), registry, label });
  const names = namesFile ? buildNameIndex(JSON.parse(readFileSync(namesFile, "utf8"))) : new Map();

  const { data, dropped } = anonymize(raw, alias, { names, bandMoney: band });
  writeAtomic(output, `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(regFile, JSON.stringify(alias.registry), { mode: 0o600 });

  const rows = Array.isArray(data) ? data.length : Array.isArray(data?.rows) ? data.rows.length : 1;
  const s = alias.stats;
  console.log(
    `anonymize: rows=${rows} customers=${s.customers.size} reps=${s.reps.size} ids=${s.ids.size} ` +
      `distributor_labels=${s.distributor} latlng_rounded=${s.rounded} redacted=${s.redacted} ` +
      `money_banded=${band ? s.banded : "off"} ` +
      `names_index=${names.size}`,
  );
  console.log(`anonymize: dropped columns: ${dropped.length ? dropped.join(",") : "(none)"}`);
  return 0;
}

const isMain =
  import.meta.main ??
  (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
