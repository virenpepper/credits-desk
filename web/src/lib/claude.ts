// Server only: the shared Claude client, and how a failed Claude call reaches the page.
import Anthropic from "@anthropic-ai/sdk";

// Shown when the Claude key is missing, revoked or invalid, so the page explains itself instead of looking broken.
export const AI_OFF_MESSAGE =
  "Claude isn't set up: the Anthropic API key is missing or was rejected. Add your own key as ANTHROPIC_API_KEY in web/.env.local (or in your Vercel project's environment variables), then restart or redeploy.";

export class AiUnavailableError extends Error {
  constructor() {
    super(AI_OFF_MESSAGE);
  }
}

let client: Anthropic | undefined;

/** The Claude client, created on first use, so a missing key becomes a clear message instead of a crash. */
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new AiUnavailableError();
  return (client ??= new Anthropic());
}

/** The response for a failed Claude call, or null when the error isn't Claude's (rethrow it). */
export function claudeErrorResponse(e: unknown, where: string): Response | null {
  if (e instanceof AiUnavailableError) return Response.json({ error: AI_OFF_MESSAGE, aiOff: true }, { status: 503 });
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    console.error(`${where}: Claude rejected the API key (${e.status})`);
    return Response.json({ error: AI_OFF_MESSAGE, aiOff: true }, { status: 503 });
  }
  if (e instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Claude is rate limited. Try again shortly." }, { status: 503 });
  }
  if (e instanceof Anthropic.APIError) {
    console.error(`${where}: Claude API error`, e.status, e.message);
    return Response.json({ error: `Claude API error ${e.status}` }, { status: 502 });
  }
  return null;
}
