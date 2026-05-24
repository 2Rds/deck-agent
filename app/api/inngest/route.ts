import { serve } from "inngest/next";
import { getInngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each /api/inngest POST runs ONE Inngest step at a time (Inngest's cloud
// orchestrates the multi-step function across many short POSTs). Individual
// steps are single Anthropic calls (60s timeout) or DB writes. 300s covers
// the worst case (Pass 2 long-running call) with headroom — and is the cap
// Vercel hobby plans allow.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: getInngest(),
  functions,
});
