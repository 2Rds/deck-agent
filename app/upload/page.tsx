import { validateSession } from "@/lib/upload/validate-session";
import { UploadForm } from "./_components/upload-form";
import { VerifyingPayment } from "./_components/verifying-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ session_id?: string }>;

const SUPPORT_EMAIL = "support@deckredteam.com";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { session_id } = await searchParams;
  const result = await validateSession(session_id);

  if (result.kind === "ok") {
    return (
      <UploadForm
        sessionId={result.sessionId}
        customerEmail={result.customerEmail}
      />
    );
  }

  if (result.kind === "verifying") {
    return (
      <VerifyingPayment
        sessionId={result.sessionId}
        supportEmail={SUPPORT_EMAIL}
      />
    );
  }

  return (
    <ErrorState result={result} supportEmail={SUPPORT_EMAIL} />
  );
}

function ErrorState({
  result,
  supportEmail,
}: {
  result: Exclude<
    Awaited<ReturnType<typeof validateSession>>,
    { kind: "ok" } | { kind: "verifying" }
  >;
  supportEmail: string;
}) {
  let title = "Something's not right with this session.";
  let body = "Please email support and we'll investigate.";

  switch (result.kind) {
    case "missing_session_id":
      title = "Missing session ID.";
      body =
        "This page expects to be reached after a successful payment. Start over from the home page.";
      break;
    case "invalid_session_id":
      title = "Session not found.";
      body =
        "We can't find a Stripe Checkout session with this ID. If you just paid and were redirected here, try refreshing in a few seconds.";
      break;
    case "not_paid":
      title = "Payment not completed.";
      body = `${result.reason}. If you believe this is a mistake, email support.`;
      break;
    case "already_used":
      title = "This session has already been used.";
      body =
        "Each payment generates one report. If you can't find yours, check your email for the delivery link or contact support.";
      break;
    case "internal_error":
      title = "We hit an error checking your payment.";
      body =
        "We've been notified and are looking into it. Email support if this keeps happening.";
      break;
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24 text-neutral-900">
      <h1 className="text-3xl tracking-tight">{title}</h1>
      <p className="text-neutral-700">{body}</p>
      <p className="text-sm text-neutral-600">
        <a className="underline" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
      </p>
      <a className="text-sm text-neutral-600 underline" href="/">
        ← Back to home
      </a>
    </main>
  );
}
