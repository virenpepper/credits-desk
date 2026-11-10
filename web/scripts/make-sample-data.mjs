// node scripts/make-sample-data.mjs
// Writes data/items.json (invoice lines) and data/credits.json (credit requests) for a fictional
// distributor, in the shape that build-claims.mjs and the app read.
// Deterministic: same output every run. Then run `node scripts/build-claims.mjs`.
// Replace both files with your own (anonymized) exports to make the desk yours: see CUSTOMIZE.md.
import { writeFileSync } from "node:fs";

let seed = 20261110;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const ANCHOR = Date.UTC(2026, 10, 10); // 2026-11-10
const day = (offset) => new Date(ANCHOR - offset * 86400000).toISOString().slice(0, 10);

// Fictional brands and items. The first five match the "try this" emails in PROMPTS.md.
const CATALOG = [
  ["100101", "CHICKEN BRST BNLS SKLS 6OZ", "GOLDEN ACRE POULTRY", "CASE", 68.4],
  ["100102", "OIL FRYER CLEAR 35LB JUG", "SUNFIELD OILS", "EACH", 41.25],
  ["100103", "SOUR CREAM CUP 12/16OZ", "PRAIRIE CREST DAIRY", "CASE", 27.9],
  ["100104", "EGG SHELL LARGE GRADE A 15DZ", "MAPLE HOLLOW EGGS", "CASE", 39.6],
  ["100105", "POTATO FRY 3/8 STRAIGHT CUT 6/5LB", "FROSTLINE POTATO", "CASE", 34.75],
  ["100106", "LETTUCE ROMAINE HEARTS 3CT 12PK", "RIDGELINE PRODUCE", "CASE", 32.1],
  ["100107", "TOMATO 5X6 25LB", "RIDGELINE PRODUCE", "CASE", 29.85],
  ["100108", "BACON SLICED 14/18 15LB", "CEDAR CREEK MEATS", "CASE", 74.2],
  ["100109", "BEEF GROUND 80/20 10LB CHUB", "CEDAR CREEK MEATS", "CASE", 52.6],
  ["100110", "SALMON FILLET ATL SKIN ON 10LB", "BLUE HERON SEAFOOD", "CASE", 118.0],
  ["100111", "SHRIMP 21/25 P&D TAIL ON 5LB", "BLUE HERON SEAFOOD", "CASE", 61.5],
  ["100112", "BUN BRIOCHE 4IN 8/12CT", "HEARTH & STONE BAKERY", "CASE", 24.3],
  ["100113", "BREAD SOURDOUGH SLICED 6CT", "HEARTH & STONE BAKERY", "CASE", 21.75],
  ["100114", "CHEESE CHEDDAR SHRED 4/5LB", "PRAIRIE CREST DAIRY", "CASE", 58.2],
  ["100115", "MILK WHOLE GAL 4CT", "PRAIRIE CREST DAIRY", "CASE", 17.4],
  ["100116", "BUTTER SOLID UNSALTED 36/1LB", "PRAIRIE CREST DAIRY", "CASE", 96.0],
  ["100117", "ONION YELLOW JUMBO 50LB", "RIDGELINE PRODUCE", "CASE", 26.5],
  ["100118", "AVOCADO HASS 48CT", "RIDGELINE PRODUCE", "CASE", 49.9],
  ["100119", "CHICKEN WING JMBO 1&2 JNT 10LB", "GOLDEN ACRE POULTRY", "CASE", 44.8],
  ["100120", "TORTILLA FLOUR 12IN 6/12CT", "NORTHWIND MILLS", "CASE", 23.6],
  ["100121", "RICE LONG GRAIN 50LB", "NORTHWIND MILLS", "EACH", 31.2],
  ["100122", "FLOUR ALL PURPOSE 50LB", "NORTHWIND MILLS", "EACH", 22.4],
  ["100123", "MAYONNAISE HEAVY DUTY 4/1GAL", "SUNFIELD OILS", "CASE", 38.9],
  ["100124", "KETCHUP FANCY 6/#10", "SUNFIELD OILS", "CASE", 33.3],
  ["100125", "PORK BUTT BNLS 2PC 18LB", "CEDAR CREEK MEATS", "CASE", 63.7],
];

const items = CATALOG.map(([code, name, brand, uom, price], i) => ({
  ITEM_CODE: code,
  ITEM_NAME: name,
  BRAND: brand,
  UNIT_OF_MEASURE: uom,
  MEDIAN_UNIT_PRICE: price.toFixed(2),
  RECENT_LINES: 1800 - i * 55,
  LATEST_INVOICE_NUMBER: `S${7100000 + i * 137}`,
  LATEST_INVOICE_DATE: day(1 + (i % 5)),
  LATEST_INVOICED_QUANTITY: 2 + (i % 6),
  LATEST_UNIT_PRICE: (price * (0.97 + rand() * 0.06)).toFixed(2),
  CUSTOMER_REF: `id_${(0xa10000 + i * 7919).toString(16).slice(-6)}`,
  CITY: "Sampleton",
  REGION: "Sample State",
}));

// A made-up reason mix for the sample: most credits are the distributor's own or the
// customer's mistakes, and a smaller share is the manufacturer's fault.
const REASONS = [
  ["OVER ORDER", "customer", 7],
  ["WRONG ITEM ORDERED", "customer", 5],
  ["ORDER ENTRY ERROR", "internal", 5],
  ["BILLING ERROR", "internal", 2],
  ["MISPICK", "warehouse_or_delivery", 4],
  ["DAMAGED IN DELIVERY", "warehouse_or_delivery", 3],
  ["DAMAGED IN WAREHOUSE", "warehouse_or_delivery", 2],
  ["VENDOR QUALITY", "vendor_quality", 5],
  ["CONCEALED DAMAGE", "vendor_quality", 3],
  ["SHORT DATED", "vendor_quality", 2],
  ["VENDOR SHORT SHIP", "vendor_quality", 2],
].flatMap(([reason, group, n]) => Array.from({ length: n }, () => [reason, group]));

const credits = REASONS.map(([reason, group], i) => {
  const item = pick(items);
  const qty = 1 + Math.floor(rand() * (group === "customer" ? 4 : 2));
  const created = 2 + Math.floor(rand() * 85);
  const price = Number(item.LATEST_UNIT_PRICE);
  return {
    REQUEST_ID: `CR-S${String(1000 + i)}`,
    LINE_ID: `id_${(0xb20000 + i * 104729).toString(16).slice(-6)}`,
    CREATED_DATE: day(created),
    STATUS: "AWAITING_CREDIT",
    REASON: reason,
    REASON_GROUP: group,
    ITEM_CODE: item.ITEM_CODE,
    ITEM_NAME: item.ITEM_NAME,
    BRAND: item.BRAND,
    QUANTITY: qty,
    UNIT_OF_MEASURE: item.UNIT_OF_MEASURE,
    INVOICED_QUANTITY: qty + Math.floor(rand() * 3),
    UNIT_PRICE: price,
    CREDIT_AMOUNT: Math.round(qty * price * 100) / 100,
    PHOTO_COUNT: group === "vendor_quality" ? 1 + Math.floor(rand() * 3) : 0,
    INVOICE_NUMBER: `S${6900000 + created * 211 + i}`,
    INVOICE_DATE: day(created + 2),
    CUSTOMER_REF: `id_${(0xc30000 + Math.floor(rand() * 14) * 6151).toString(16).slice(-6)}`,
    CITY: "Sampleton",
    REGION: "Sample State",
  };
});

writeFileSync("data/items.json", JSON.stringify(items, null, 2) + "\n");
writeFileSync("data/credits.json", JSON.stringify(credits, null, 2) + "\n");
console.log(`sample data: items.json ${items.length} lines, credits.json ${credits.length} credit lines`);
