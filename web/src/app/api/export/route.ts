import { connection } from "next/server";
import { STATUS_LABEL } from "@/lib/claims";
import { listClaims } from "@/lib/store";

// Vendor deductions for the ERP: recoverable claims only, one row per claim.
const COLUMNS = [
  "claim_id",
  "vendor",
  "item_code",
  "item_name",
  "qty",
  "uom",
  "invoice_number",
  "invoice_date",
  "reason",
  "status",
  "credit_amount",
  "deducted_on",
] as const;

// Quote for CSV, and neutralize spreadsheet formulas: item names can come from untrusted email.
function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  await connection();
  const claims = (await listClaims())
    .filter((c) => c.recoverable)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const rows = claims.map((c) =>
    [
      c.id,
      c.vendor,
      c.itemCode,
      c.itemName,
      c.qty,
      c.uom,
      c.invoiceNumber,
      c.invoiceDate,
      c.reason,
      STATUS_LABEL[c.status],
      c.creditAmount?.toFixed(2),
      c.history.findLast((h) => h.status === "deducted")?.at.slice(0, 10),
    ]
      .map(cell)
      .join(","),
  );

  const day = new Date().toISOString().slice(0, 10);
  return new Response([COLUMNS.join(","), ...rows].join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vendor-credits-${day}.csv"`,
    },
  });
}
