import { connection } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClaim, saveClaim, underLimit } from "@/lib/store";
import { DraftError, draftVendorEmail } from "@/lib/draft";

export const maxDuration = 60;

export async function POST(req: Request, ctx: RouteContext<"/api/claims/[id]/draft">) {
  await connection();
  if (!(await underLimit(req, "draft", 10))) {
    return Response.json({ error: "Too many drafts from this device. Try again in a minute." }, { status: 429 });
  }

  const { id } = await ctx.params;
  const claim = await getClaim(id);
  if (!claim) return Response.json({ error: `No claim ${id}` }, { status: 404 });
  if (!claim.recoverable) {
    return Response.json({ error: "Internal claims don't go to vendors" }, { status: 400 });
  }
  if (claim.status === "needs_invoice") {
    return Response.json({ error: "Find the invoice line before contacting the vendor" }, { status: 400 });
  }
  // One draft per claim: repeat clicks return the saved draft instead of calling Claude again.
  if (claim.vendorEmailDraft) return Response.json({ claim });

  try {
    claim.vendorEmailDraft = await draftVendorEmail(claim);
  } catch (e) {
    if (e instanceof DraftError) return Response.json({ error: e.message }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Claude is rate limited. Try again shortly." }, { status: 503 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("draft: Claude API error", e.status, e.message);
      return Response.json({ error: `Claude API error ${e.status}` }, { status: 502 });
    }
    throw e;
  }
  claim.history.push({ at: new Date().toISOString(), status: claim.status, note: "Vendor email drafted" });
  await saveClaim(claim);
  return Response.json({ claim });
}
