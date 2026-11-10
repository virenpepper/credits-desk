import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { redis } from "@/lib/store";

// Gated by INGEST_TOKEN: wipes demo claims; the seed data reloads on the next read.
export async function POST(req: Request) {
  await connection();
  const got = Buffer.from(req.headers.get("x-ingest-token") ?? "");
  const want = Buffer.from(process.env.INGEST_TOKEN ?? "");
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }
  await redis().del("desk:claims", "desk:seeded", "desk:seq:claim", "desk:seq:email", "desk:seq:paste");
  return Response.json({ ok: true });
}
