export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error(
    "Sentry test — if you see this in Sentry, monitoring is wired correctly.",
  );
}
