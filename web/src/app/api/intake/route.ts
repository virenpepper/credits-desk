import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { claudeErrorResponse } from "@/lib/claude";
import { z } from "zod";
import type { Claim } from "@/lib/claims";
import { type Extracted, ExtractError, extractClaims } from "@/lib/extract";
import { matchInvoiceLine } from "@/lib/match";
import { scrub } from "@/lib/scrub";
import { redis, saveClaim, underLimit } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  text: z
    .string()
    .trim()
    .min(10, "Tell us a bit more about the issue")
    .max(2000, "Keep it under 2,000 characters"),
  source: z.enum(["paste", "email"]).optional(),
});

function hasIngestToken(req: Request) {
  const got = req.headers.get("x-ingest-token");
  const want = process.env.INGEST_TOKEN;
  if (!got || !want) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toClaim(x: Extracted, id: string, label: string, source: Claim["source"]): Claim {
  const m = matchInvoiceLine(x);
  const qty = Math.min(999, Math.max(1, Math.round(x.qty) || 1));
  const rawPrice = m ? (m.line.LATEST_UNIT_PRICE ?? m.line.MEDIAN_UNIT_PRICE ?? null) : null;
  const unitPrice = rawPrice == null || !Number.isFinite(Number(rawPrice)) ? null : Number(rawPrice);
  const invoiced = m?.line.LATEST_INVOICED_QUANTITY ?? null;
  const billable = invoiced ? Math.min(qty, invoiced) : qty;
  // Status and amount come from our rules and the invoice line, never from the message.
  const status: Claim["status"] = !x.recoverable ? "internal" : m ? "new" : "needs_invoice";
  const matchNote = m
    ? `Matched invoice line by ${m.how}.${billable < qty ? ` Capped at the ${invoiced} invoiced.` : ""}`
    : "No invoice line found: needs invoice.";
  const at = new Date().toISOString();
  return {
    id,
    createdAt: at,
    source,
    reporter: x.reporter,
    vendor: m?.line.BRAND ?? x.vendor ?? "Unknown vendor",
    itemCode: m?.line.ITEM_CODE ?? x.itemCode,
    itemName: m?.line.ITEM_NAME ?? x.itemName,
    qty,
    uom: (m?.line.UNIT_OF_MEASURE ?? x.uom ?? "unit").toLowerCase(),
    reason: x.reason,
    recoverable: x.recoverable,
    triageNote: `${x.triageNote.trim().replace(/[.;,\s]*$/, ".")} ${matchNote}`,
    invoiceNumber: m?.line.LATEST_INVOICE_NUMBER ?? x.invoiceNumber,
    invoiceDate: m?.line.LATEST_INVOICE_DATE ?? null,
    customer: null,
    unitPrice,
    creditAmount: unitPrice != null ? round2(billable * unitPrice) : null,
    status,
    intakeLabel: label,
    history: [{ at, status, note: `Logged from ${label}` }],
  };
}

export async function POST(req: Request) {
  await connection();
  const trusted = hasIngestToken(req);
  if (!trusted && !(await underLimit(req, "intake", 10))) {
    return Response.json({ error: "Too many issues from this device. Try again in a minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Send JSON like {"text": "..."}' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });

  // Only the inbox agent (holding INGEST_TOKEN) can log a claim as an email.
  const source: Claim["source"] = trusted && parsed.data.source === "email" ? "email" : "paste";
  const text = scrub(parsed.data.text);
  if (text.length < 10) return Response.json({ error: "Nothing left to read after removing the signature" }, { status: 400 });

  let extraction;
  try {
    extraction = await extractClaims(text);
  } catch (e) {
    if (e instanceof ExtractError) return Response.json({ error: e.message }, { status: 502 });
    const res = claudeErrorResponse(e, "intake");
    if (res) return res;
    throw e;
  }

  if (!extraction.is_credit_claim || extraction.claims.length === 0) {
    return Response.json({ claims: [], ignored: true, message: "Not a credit claim, so nothing was logged." });
  }

  const n = await redis().incr(`desk:seq:${source}`);
  const label = source === "email" ? `Email #${n}` : `Pasted issue #${n}`;
  const claims: Claim[] = [];
  for (const x of extraction.claims.slice(0, 3)) {
    const id = `CLM-${3000 + (await redis().incr("desk:seq:claim"))}`;
    const claim = toClaim(x, id, label, source);
    await saveClaim(claim);
    claims.push(claim);
  }
  return Response.json({ claims });
}
