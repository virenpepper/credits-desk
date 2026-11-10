import { connection } from "next/server";
import { getClaim, saveClaim, underLimit } from "@/lib/store";
import { vendorInbox } from "@/lib/vendors";

export async function POST(req: Request, ctx: RouteContext<"/api/claims/[id]/send">) {
  await connection();
  if (!(await underLimit(req, "send", 20))) {
    return Response.json({ error: "Too many requests from this device. Try again in a minute." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const claim = await getClaim(id);
  if (!claim) return Response.json({ error: `No claim ${id}` }, { status: 404 });
  if (!claim.recoverable) {
    return Response.json({ error: "Internal claims don't go to vendors" }, { status: 400 });
  }
  if (!claim.vendorEmailDraft) {
    return Response.json({ error: "Draft the vendor email first" }, { status: 400 });
  }
  if (claim.status !== "new") {
    return Response.json({ error: `Already ${claim.status.replace("_", " ")}` }, { status: 409 });
  }

  // The app records the hand-off; in this demo no email leaves the app to a vendor.
  claim.status = "vendor_contacted";
  claim.history.push({
    at: new Date().toISOString(),
    status: claim.status,
    note: `Verification sent to ${vendorInbox(claim.vendor)} (sample contact)`,
  });
  await saveClaim(claim);
  return Response.json({ claim });
}
