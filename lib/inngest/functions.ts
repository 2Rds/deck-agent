import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as Sentry from "@sentry/nextjs";
import { getInngest } from "./client";
import { db, decks, reports } from "@/lib/db/client";
import { getDeckPdfBytes } from "@/lib/r2/client";
import {
  getPageCount,
  slicePage,
  extractTextPerPage,
} from "@/lib/pdf/client";
import { callPass } from "@/lib/anthropic/client";
import { loadPrompt, substituteVariables } from "@/lib/prompts/loader";
import {
  markStageComplete,
  markStageStarted,
} from "@/lib/pipeline/progress";
import {
  questionnaireVarsForDeck,
  hasBiggestWorry,
} from "@/lib/pipeline/defaults";
import { FAILURE_REASONS } from "@/lib/pipeline/failure-reasons";
import { sendReportEmail, sendOperatorAlert } from "@/lib/email/client";

import { Pass1OutputSchema, type Pass1Output } from "@/schemas/pass-1-output";
import { Pass2OutputSchema, type Pass2Output } from "@/schemas/pass-2-output";
import { Pass3OutputSchema, type Pass3Output } from "@/schemas/pass-3-output";
import { Pass4OutputSchema, type Pass4Output } from "@/schemas/pass-4-output";
import { Pass5OutputSchema, type Pass5Output } from "@/schemas/pass-5-output";
import { Pass6OutputSchema, type Pass6Output } from "@/schemas/pass-6-output";

const inngest = getInngest();

const PASS_1_CONCURRENCY = 6;

/** Tier 2 OTPM-safe chunk into groups. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function markDeckFailed(
  deckId: string,
  reason: string,
  stripeSessionId: string,
): Promise<void> {
  try {
    await db
      .update(decks)
      .set({ status: "failed", failureReason: reason })
      .where(eq(decks.id, deckId));
  } catch (markErr) {
    Sentry.captureException(markErr, {
      tags: {
        surface: "pipeline_mark_failed",
        deck_id: deckId,
        stripe_session_id: stripeSessionId,
        requires_refund: "true",
      },
    });
  }
  // Notify the operator so refunds can be issued and the customer informed.
  try {
    await sendOperatorAlert({
      subject: `Pipeline failure: ${reason}`,
      body: `Deck ${deckId} failed with reason: ${reason}\nStripe session: ${stripeSessionId}\nCheck Sentry for the stack trace.`,
    });
  } catch (alertErr) {
    Sentry.captureException(alertErr, {
      tags: {
        surface: "pipeline_operator_alert",
        deck_id: deckId,
        requires_refund: "true",
      },
    });
  }
}

export const deckPipeline = inngest.createFunction(
  {
    id: "deck-pipeline",
    name: "DeckRedTeam pipeline",
    concurrency: { limit: 10 },
    triggers: [{ event: "deck/uploaded" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { deckId: string };
    const deckId = data.deckId;

    // ──────────────────────────────────────────────────────────────────
    // Setup: load the deck row + insert the reports shell
    // ──────────────────────────────────────────────────────────────────

    const deck = await step.run("load-deck", async () => {
      const rows = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
      const d = rows[0];
      if (!d) throw new Error(`deck ${deckId} not found`);
      return d;
    });

    // Reports row created at Stage 0 (with private_token) so Pass outputs
    // can be persisted incrementally as each pass completes. The Stage E
    // report page will gate on this row + token.
    const privateToken = await step.run("create-report-shell", async () => {
      const token = nanoid(32);
      await db.insert(reports).values({
        deckId,
        privateToken: token,
        isPublic: false,
      });
      return token;
    });

    // ──────────────────────────────────────────────────────────────────
    // Stage 0 — preparation: fetch PDF, parse, extract text layer
    // ──────────────────────────────────────────────────────────────────

    const stage0 = await step.run("stage-0-prep", async () => {
      await markStageStarted(deckId, "Loading deck…");
      let buffer: Buffer;
      try {
        buffer = await getDeckPdfBytes(deckId);
      } catch (err) {
        throw new Error(
          `${FAILURE_REASONS.STAGE_0_PDF_FETCH_FAILED}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      let pageCount: number;
      let textPerPage: string[];
      try {
        pageCount = await getPageCount(buffer);
        textPerPage = await extractTextPerPage(buffer);
      } catch (err) {
        throw new Error(
          `${FAILURE_REASONS.STAGE_0_PDF_PARSE_FAILED}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Reduce DB roundtrips: combine slide_count + status + progress flag.
      await db
        .update(decks)
        .set({
          slideCount: pageCount,
          status: "processing",
        })
        .where(eq(decks.id, deckId));
      await markStageComplete(
        deckId,
        "stage_0",
        `Deck received (${pageCount} slides detected)`,
      );
      return { pageCount, textPerPage };
    });

    // Inngest steps serialize/deserialize their return values via JSON. Buffer
    // would not survive; so we re-fetch + re-slice inside each Pass 1 step.
    const { pageCount, textPerPage } = stage0;

    try {
      // ────────────────────────────────────────────────────────────────
      // Stage 1 — Pass 1: per-slide extraction, throttled 6-wide
      // ────────────────────────────────────────────────────────────────

      await markStageStarted(deckId, "Extracting claims and numbers…");

      const pass1Prompt = loadPrompt("pass-1");
      const slideIndices = Array.from({ length: pageCount }, (_, i) => i);
      const chunks = chunk(slideIndices, PASS_1_CONCURRENCY);

      const pass1Outputs: Pass1Output[] = new Array(pageCount);
      for (const batch of chunks) {
        const batchResults = await Promise.all(
          batch.map((slideIdx) =>
            step.run(`pass-1-slide-${slideIdx + 1}`, async () => {
              const fullBuffer = await getDeckPdfBytes(deckId);
              const pageBuffer = await slicePage(fullBuffer, slideIdx);
              const userMsg = substituteVariables(pass1Prompt.userTemplate, {
                slide_number: String(slideIdx + 1),
                total_slides: String(pageCount),
                pdf_text_for_this_slide: textPerPage[slideIdx] ?? "",
              });
              return await callPass({
                passName: `pass_1_slide_${slideIdx + 1}`,
                system: pass1Prompt.system,
                user: userMsg,
                attachments: [
                  {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: pageBuffer.toString("base64"),
                    },
                  },
                ],
                schema: Pass1OutputSchema,
                temperature: 0.1,
                maxTokens: 3000,
                tags: { deck_id: deckId, slide: String(slideIdx + 1) },
              });
            }),
          ),
        );
        batch.forEach((slideIdx, j) => {
          pass1Outputs[slideIdx] = batchResults[j];
        });
      }

      await step.run("persist-pass-1", async () => {
        await db
          .update(reports)
          .set({ pass1Output: pass1Outputs })
          .where(eq(reports.deckId, deckId));
        await markStageComplete(deckId, "stage_1", "Extracted claims and numbers");
      });

      const deckExtractionJson = JSON.stringify({
        total_slides: pageCount,
        slide_types_detected: [
          ...new Set(pass1Outputs.map((s) => s.slide_type)),
        ],
        slides: pass1Outputs,
      });
      const qVars = questionnaireVarsForDeck(deck);

      // ────────────────────────────────────────────────────────────────
      // Stage 2 — Passes 2, 3, 4 in parallel
      // ────────────────────────────────────────────────────────────────

      await markStageStarted(deckId, "Auditing math, objections, and structure…");

      const [pass2, pass3, pass4] = await Promise.all([
        step.run("pass-2-math-audit", async () => {
          const prompt = loadPrompt("pass-2");
          const out = await callPass({
            passName: "pass_2",
            system: prompt.system,
            user: substituteVariables(prompt.userTemplate, {
              ...qVars,
              pass_1_json: deckExtractionJson,
            }),
            schema: Pass2OutputSchema,
            temperature: 0.2,
            maxTokens: 8000,
            tags: { deck_id: deckId, pass: "pass_2" },
          });
          await db
            .update(reports)
            .set({ pass2Output: out })
            .where(eq(reports.deckId, deckId));
          await markStageComplete(
            deckId,
            "stage_2_pass_2",
            "Math and consistency audit complete",
          );
          return out;
        }),
        step.run("pass-3-objections", async () => {
          const prompt = loadPrompt("pass-3");
          const out = await callPass({
            passName: "pass_3",
            system: prompt.system,
            user: substituteVariables(prompt.userTemplate, {
              ...qVars,
              pass_1_json: deckExtractionJson,
            }),
            schema: Pass3OutputSchema,
            temperature: 0.4,
            maxTokens: 5000,
            tags: { deck_id: deckId, pass: "pass_3" },
          });
          await db
            .update(reports)
            .set({ pass3Output: out })
            .where(eq(reports.deckId, deckId));
          await markStageComplete(
            deckId,
            "stage_2_pass_3",
            "Investor objections generated",
          );
          return out;
        }),
        step.run("pass-4-structural", async () => {
          const prompt = loadPrompt("pass-4");
          const out = await callPass({
            passName: "pass_4",
            system: prompt.system,
            user: substituteVariables(prompt.userTemplate, {
              stage: qVars.stage,
              round_amount: qVars.round_amount,
              instrument: qVars.instrument,
              target_investors: qVars.target_investors,
              pass_1_json: deckExtractionJson,
            }),
            schema: Pass4OutputSchema,
            temperature: 0.2,
            maxTokens: 3000,
            tags: { deck_id: deckId, pass: "pass_4" },
          });
          await db
            .update(reports)
            .set({ pass4Output: out })
            .where(eq(reports.deckId, deckId));
          await markStageComplete(
            deckId,
            "stage_2_pass_4",
            "Structural audit complete",
          );
          return out;
        }),
      ]);

      void pass3;
      void pass4;

      // ────────────────────────────────────────────────────────────────
      // Stage 3 — Passes 5 & 6 in parallel (Pass 6 conditional)
      // ────────────────────────────────────────────────────────────────

      await markStageStarted(deckId, "Drafting rewrites…");

      const pass2TopIssues = JSON.stringify({
        critical_issues: pass2.critical_issues,
        major_issues: pass2.major_issues,
      });

      const stage3Promises: Promise<unknown>[] = [
        step.run("pass-5-rewrites", async () => {
          const prompt = loadPrompt("pass-5");
          const out: Pass5Output = await callPass({
            passName: "pass_5",
            system: prompt.system,
            user: substituteVariables(prompt.userTemplate, {
              stage: qVars.stage,
              target_investors: qVars.target_investors,
              pass_1_json: deckExtractionJson,
              pass_2_top_issues_json: pass2TopIssues,
            }),
            schema: Pass5OutputSchema,
            temperature: 0.5,
            maxTokens: 5000,
            tags: { deck_id: deckId, pass: "pass_5" },
          });
          await db
            .update(reports)
            .set({ pass5Output: out })
            .where(eq(reports.deckId, deckId));
          await markStageComplete(
            deckId,
            "stage_3_pass_5",
            "Slide rewrites drafted",
          );
          return out;
        }),
      ];

      if (hasBiggestWorry(deck)) {
        stage3Promises.push(
          step.run("pass-6-anxiety", async () => {
            const prompt = loadPrompt("pass-6");
            const out: Pass6Output = await callPass({
              passName: "pass_6",
              system: prompt.system,
              user: substituteVariables(prompt.userTemplate, {
                stage: qVars.stage,
                round_amount: qVars.round_amount,
                instrument: qVars.instrument,
                target_investors: qVars.target_investors,
                biggest_worry: qVars.biggest_worry,
                pass_1_json: deckExtractionJson,
                pass_2_json: JSON.stringify(pass2),
              }),
              schema: Pass6OutputSchema,
              temperature: 0.3,
              maxTokens: 3000,
              tags: { deck_id: deckId, pass: "pass_6" },
            });
            await db
              .update(reports)
              .set({ pass6Output: out })
              .where(eq(reports.deckId, deckId));
            await markStageComplete(
              deckId,
              "stage_3_pass_6",
              "Anxiety addendum drafted",
            );
            return out;
          }),
        );
      }

      await Promise.all(stage3Promises);

      // ────────────────────────────────────────────────────────────────
      // Stage 4 — finalization + email
      // ────────────────────────────────────────────────────────────────

      const reportUrl = await step.run("finalize-and-email", async () => {
        const base = process.env.PUBLIC_BASE_URL;
        if (!base) {
          throw new Error("PUBLIC_BASE_URL is not configured");
        }
        const url = `${base}/report/${deckId}/${privateToken}`;
        // Mark deck complete BEFORE attempting email — even if email fails,
        // the report is accessible at the URL.
        await db
          .update(decks)
          .set({ status: "complete" })
          .where(eq(decks.id, deckId));
        await markStageComplete(deckId, "stage_4", "Report ready");

        try {
          await sendReportEmail({
            to: deck.customerEmail,
            reportUrl: url,
            verdict: pass2.executive_verdict,
          });
        } catch (err) {
          // Email failure is non-fatal — deck is complete, URL works. Surface
          // to Sentry without throwing, so the function still returns success.
          Sentry.captureException(err, {
            tags: {
              surface: "pipeline_send_email",
              deck_id: deckId,
            },
          });
        }
        return url;
      });

      logger.info("pipeline complete", { deckId, reportUrl });
      return { ok: true, deckId, reportUrl };
    } catch (err) {
      // Any failure inside Stages 1-4 marks the deck failed + pages the
      // operator. The error then bubbles to Inngest for retry semantics.
      const reasonRaw = err instanceof Error ? err.message : String(err);
      const reasonCode =
        Object.values(FAILURE_REASONS).find((r) => reasonRaw.includes(r)) ??
        FAILURE_REASONS.ANTHROPIC_TRANSPORT_FAILED;
      await markDeckFailed(deckId, reasonCode, deck.stripeSessionId);
      Sentry.captureException(err, {
        tags: {
          surface: "pipeline_root",
          deck_id: deckId,
          stripe_session_id: deck.stripeSessionId,
          failure_reason: reasonCode,
          requires_refund: "true",
        },
      });
      throw err;
    }
  },
);

export const functions = [deckPipeline];
