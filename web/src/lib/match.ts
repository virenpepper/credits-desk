// Matches an extracted claim to an invoice line in data/items.json:
// by invoice number, else by item code, else by item name, else no match ("needs invoice").
import items from "../../data/items.json";

export type InvoiceLine = (typeof items)[number];
export type Match = { line: InvoiceLine; how: "invoice number" | "item code" | "item name" };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const words = (s: string) =>
  s
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 3 && !/\d/.test(w));

// ERP abbreviations are letter subsequences of the full word: BRST ~ BREAST, BNLS ~ BONELESS.
const abbrevOf = (abbr: string, word: string) => {
  if (abbr[0] !== word[0]) return false;
  let i = 0;
  for (const ch of word) if (ch === abbr[i]) i++;
  return i === abbr.length;
};

function nameScore(line: InvoiceLine, said: string[]) {
  const catalog = words(line.ITEM_NAME ?? "");
  if (!catalog.length || !said.length) return 0;
  const catalogHits = catalog.filter((t) => said.some((w) => abbrevOf(t, w))).length;
  const saidHits = said.filter((w) => catalog.some((t) => abbrevOf(t, w))).length;
  if (catalogHits < Math.min(2, catalog.length)) return 0;
  return (catalogHits / catalog.length) * (saidHits / said.length);
}

function bestByName(lines: InvoiceLine[], itemName: string, threshold: number) {
  const said = words(itemName);
  let best: InvoiceLine | null = null;
  let bestScore = threshold;
  for (const line of lines) {
    const s = nameScore(line, said);
    if (s > bestScore || (s === bestScore && best && s > 0 && (line.RECENT_LINES ?? 0) > (best.RECENT_LINES ?? 0))) {
      best = line;
      bestScore = s;
    }
  }
  return best;
}

export function matchInvoiceLine(x: {
  invoiceNumber: string | null;
  itemCode: string | null;
  itemName: string;
}): Match | null {
  if (x.invoiceNumber) {
    const inv = norm(x.invoiceNumber);
    const onInvoice = items.filter((r) => r.LATEST_INVOICE_NUMBER && norm(r.LATEST_INVOICE_NUMBER) === inv);
    const line = onInvoice.length === 1 ? onInvoice[0] : bestByName(onInvoice, x.itemName, 0);
    if (line) return { line, how: "invoice number" };
  }
  if (x.itemCode) {
    const code = norm(x.itemCode);
    const line = items.find((r) => r.ITEM_CODE && norm(r.ITEM_CODE) === code);
    if (line) return { line, how: "item code" };
  }
  const line = bestByName(items, x.itemName, 0.4);
  return line ? { line, how: "item name" } : null;
}
