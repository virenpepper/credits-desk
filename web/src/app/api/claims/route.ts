import { connection } from "next/server";
import { listClaims } from "@/lib/store";

export async function GET() {
  await connection();
  const claims = await listClaims();
  return Response.json({ claims });
}
