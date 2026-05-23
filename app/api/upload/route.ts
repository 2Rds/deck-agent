import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { validateSession } from "@/lib/upload/validate-session";
import { QuestionnaireSchema, normalizeRoundAmount } from "@/schemas/questionnaire";
import { uploadDeckPdf } from "@/lib/r2/client";
import { db, decks, payments } from "@/lib/db/client";
import { eq, and, sql } from "drizzle-orm";
import { getInngest } from "@/lib/inngest/client";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    Sentry.captureException(err, { tags: { surface: "upload_formdata" } });
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const sessionId = form.get("session_id");
  const file = form.get("file");
  const questionnaireRaw = form.get("questionnaire");

  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "missing session_id" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (typeof questionnaireRaw !== "string") {
    return NextResponse.json({ error: "missing questionnaire" }, { status: 400 });
  }

  // File size / type checks
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file too large (max 25 MB)" }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }

  // Questionnaire JSON parse + Zod validation
  let questionnaireParsed: unknown;
  try {
    questionnaireParsed = JSON.parse(questionnaireRaw);
  } catch {
    return NextResponse.json({ error: "questionnaire is not valid JSON" }, { status: 400 });
  }

  // We don't validate against full QuestionnaireSchema because the form sends
  // round_amount_raw, not round_amount_normalized. Normalize here, then validate.
  const parsedObj = questionnaireParsed as Record<string, unknown>;
  const normalized =
    typeof parsedObj.round_amount_raw === "string"
      ? normalizeRoundAmount(parsedObj.round_amount_raw)
      : null;
  if (!normalized) {
    return NextResponse.json(
      { error: "round amount could not be parsed" },
      { status: 400 },
    );
  }
  const questionnaireValidated = QuestionnaireSchema.safeParse({
    ...parsedObj,
    round_amount_normalized: normalized,
  });
  if (!questionnaireValidated.success) {
    return NextResponse.json(
      { error: "questionnaire validation failed", details: questionnaireValidated.error.flatten() },
      { status: 400 },
    );
  }
  const q = questionnaireValidated.data;

  // Validate session paid + unused
  const validation = await validateSession(sessionId);
  if (validation.kind === "already_used") {
    return NextResponse.json(
      { error: "session already used", deckId: validation.deckId },
      { status: 409 },
    );
  }
  if (validation.kind !== "ok") {
    return NextResponse.json(
      { error: `session not valid: ${validation.kind}` },
      { status: 400 },
    );
  }

  // PDF magic-byte check
  const buffer = Buffer.from(await file.arrayBuffer());
  const head = buffer.slice(0, 5).toString("ascii");
  if (head !== PDF_MAGIC) {
    return NextResponse.json(
      { error: "file does not look like a PDF (missing %PDF- header)" },
      { status: 400 },
    );
  }

  // Email fallback chain: payments row → session.customer_details → reject.
  // The validate-session layer already populated customerEmail from either.
  const customerEmail = validation.customerEmail;
  if (!customerEmail) {
    Sentry.captureMessage("upload had no customer_email from validation", {
      level: "warning",
      tags: { stripe_session_id: sessionId },
    });
    return NextResponse.json(
      {
        error:
          "We couldn't find your email — please email support with this session ID",
        sessionId,
      },
      { status: 400 },
    );
  }

  // Generate deck_id up front so we can use it as the R2 key.
  const deckId = randomUUID();

  // Upload to R2 BEFORE the DB transaction so that if R2 fails, we don't
  // leave a deck row pointing at a key that doesn't exist. If R2 succeeds
  // but the DB transaction fails, we leak an orphan PDF — acceptable risk
  // for v1 (R2 is cheap; operator can sweep orphans).
  try {
    await uploadDeckPdf(deckId, buffer);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { surface: "upload_r2_put", stripe_session_id: sessionId },
    });
    return NextResponse.json({ error: "upload to storage failed" }, { status: 502 });
  }

  // Transactional: insert deck + mark payment used. If either fails, both
  // roll back and we keep the R2 orphan (logged).
  try {
    await db.transaction(async (tx) => {
      // Atomic mark-payment-used. Only proceed if the row is still in
      // `status='paid'` to defeat any race where the same session_id is
      // submitted from two tabs simultaneously.
      const used = await tx
        .update(payments)
        .set({ status: "used", deckId })
        .where(
          and(
            eq(payments.stripeSessionId, sessionId),
            eq(payments.status, "paid"),
          ),
        )
        .returning({ id: payments.id });
      if (used.length === 0) {
        throw new Error("payment_already_used_or_missing");
      }

      await tx.insert(decks).values({
        id: deckId,
        stripeSessionId: sessionId,
        customerEmail,
        r2PdfKey: `decks/${deckId}/original.pdf`,
        originalFilename: file.name,
        fileSize: file.size,
        stage: q.stage,
        roundAmountNormalized: q.round_amount_normalized,
        instrument: q.instrument,
        targetInvestors: q.target_investors ?? null,
        tractionOneline: q.traction_oneline ?? null,
        biggestWorry: q.biggest_worry ?? null,
        additionalContext: q.additional_context ?? null,
        status: "uploaded",
        pipelineProgress: sql`'{}'::jsonb`,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "payment_already_used_or_missing") {
      return NextResponse.json(
        { error: "session already used by another tab" },
        { status: 409 },
      );
    }
    Sentry.captureException(err, {
      tags: {
        surface: "upload_db_transaction",
        stripe_session_id: sessionId,
        deck_id: deckId,
      },
    });
    return NextResponse.json(
      { error: "failed to record deck" },
      { status: 500 },
    );
  }

  // Fire the pipeline asynchronously. If this fails, the deck row exists
  // but never enters processing — Sentry surfaces, operator manually
  // re-fires the event.
  try {
    await getInngest().send({
      name: "deck/uploaded",
      data: { deckId },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        surface: "upload_inngest_send",
        deck_id: deckId,
        stripe_session_id: sessionId,
      },
    });
    // We still return 202 to the user — their deck is in the DB, the
    // operator can re-fire the event. The UI will show "processing"
    // until the pipeline picks it up or the operator marks failed.
  }

  return NextResponse.json({ deckId }, { status: 202 });
}
