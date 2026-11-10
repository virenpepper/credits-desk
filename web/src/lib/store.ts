// Server only: the shared claim store everyone viewing the app sees.
import { Redis } from "@upstash/redis";
import seed from "../../data/claims.json";
import type { Claim, ClaimsFile } from "./claims";

let client: Redis | null = null;

/** The shared Redis client, created on first use so `pnpm build` runs without Redis env vars. */
export function redis(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN are not set (see .env.example)");
  client = new Redis({ url, token });
  return client;
}

const CLAIMS = "desk:claims";
const SEEDED = "desk:seeded";

async function ensureSeeded() {
  if (await redis().exists(SEEDED)) return;
  const { claims } = seed as ClaimsFile;
  await redis().hset(CLAIMS, Object.fromEntries(claims.map((c) => [c.id, c])));
  await redis().set(SEEDED, "1");
}

export async function listClaims(): Promise<Claim[]> {
  await ensureSeeded();
  const all = await redis().hgetall<Record<string, Claim>>(CLAIMS);
  return Object.values(all ?? {});
}

export async function getClaim(id: string): Promise<Claim | null> {
  await ensureSeeded();
  return (await redis().hget<Claim>(CLAIMS, id)) ?? null;
}

export async function saveClaim(claim: Claim) {
  await redis().hset(CLAIMS, { [claim.id]: claim });
}

/** Fixed-window limit per IP: INCR + EXPIRE. Returns true while under the limit. */
export async function underLimit(req: Request, bucket: string, limit: number, windowSec = 60) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `desk:rl:${bucket}:${ip}`;
  const n = await redis().incr(key);
  if (n === 1) await redis().expire(key, windowSec);
  return n <= limit;
}
