import { serve } from "inngest/next";
import { getInngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Inngest invocations can run longer than typical API routes — Stage D's
// full pipeline pass set takes 2-5min. Vercel Pro supports up to 800s on
// serverless functions; reserve enough headroom for the longest pass plus
// step overhead.
export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: getInngest(),
  functions,
});
