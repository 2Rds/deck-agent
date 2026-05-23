export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  throw new Error(
    "Sentry test — if you see this in Sentry, monitoring is wired correctly.",
  );
}
