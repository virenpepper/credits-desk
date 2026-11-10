import { connection } from "next/server";
import { getClaim, saveClaim, underLimit } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/claims/[id]/deduct">) {
  await connection();
  if (!(await underLimit(req, "deduct", 20))) {
    return Response.json({ error: "Too many requests from this device. Try again in a minute." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const claim = await getClaim(id);
  if (!claim) return Response.json({ error: `No claim ${id}` }, { status: 404 });
  if (!claim.recoverable) return Response.json({ error: "Internal claims aren't deducted from vendors" }, { status: 400 });
  if (claim.status !== "vendor_contacted" && claim.status !== "verified") {
    return Response.json({ error: "Contact the vendor before taking the deduction" }, { status: 409 });
  }

  claim.status = "deducted";
  claim.history.push({ at: new Date().toISOString(), status: "deducted", note: "Deducted from the vendor's next payment" });
  await saveClaim(claim);
  return Response.json({ claim });
}
