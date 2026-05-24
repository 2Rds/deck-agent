import { Resend } from "resend";

let cached: { client: Resend; keyPrefix: string } | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const keyPrefix = key.slice(0, 10);
  if (cached && cached.keyPrefix !== keyPrefix) {
    cached = null;
  }
  if (cached) return cached.client;
  cached = { client: new Resend(key), keyPrefix };
  return cached.client;
}

function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    `report@${process.env.BRAND_DOMAIN ?? "deckredteam.com"}`
  );
}

function supportAddress(): string {
  return `support@${process.env.BRAND_DOMAIN ?? "deckredteam.com"}`;
}

export type SendReportEmailArgs = {
  to: string;
  reportUrl: string;
  verdict: string;
};

export async function sendReportEmail({
  to,
  reportUrl,
  verdict,
}: SendReportEmailArgs): Promise<void> {
  const support = supportAddress();
  const result = await getResend().emails.send({
    from: `DeckRedTeam <${fromAddress()}>`,
    to,
    replyTo: support,
    subject: "Your DeckRedTeam report is ready",
    text: `Your pitch deck red team is complete.

Executive verdict (preview):
${verdict}

Read the full report:
${reportUrl}

The link is private to you. To share a sanitized version with others, click "Share this report" on the report page.

Questions or issues? Reply to this email or contact ${support}.`,
  });
  if ("error" in result && result.error) {
    throw new Error(
      `Resend send failed: ${result.error.name ?? "unknown"}: ${result.error.message ?? "no message"}`,
    );
  }
}

export async function sendOperatorAlert(args: {
  subject: string;
  body: string;
}): Promise<void> {
  await getResend().emails.send({
    from: `DeckRedTeam Alerts <${fromAddress()}>`,
    to: "sean@blockdrive.co",
    subject: `[DeckRedTeam] ${args.subject}`,
    text: args.body,
  });
}
