import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Pass1Output } from "@/schemas/pass-1-output";
import type { Pass2Output } from "@/schemas/pass-2-output";
import type { Pass3Output } from "@/schemas/pass-3-output";
import type { Pass4Output } from "@/schemas/pass-4-output";
import type { Pass5Output } from "@/schemas/pass-5-output";
import type { Pass6Output } from "@/schemas/pass-6-output";
import type { PipelineProgress } from "@/schemas/pipeline-progress";

export const deckStatusEnum = pgEnum("deck_status", [
  "uploaded",
  "processing",
  "complete",
  "failed",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "used",
  "refunded",
]);

export const stageEnum = pgEnum("stage", [
  "Pre-seed",
  "Seed",
  "Series A",
  "Bridge / extension",
  "Not sure yet",
]);

export const instrumentEnum = pgEnum("instrument", [
  "SAFE",
  "Priced round",
  "Convertible note",
  "Not decided yet",
]);

export const targetInvestorsEnum = pgEnum("target_investors", [
  "Tier 1 VC partners (a16z, Sequoia, etc.)",
  "Generalist seed funds",
  "Angel investors / scouts",
  "Strategic / corporate investors",
  "Friends & family",
  "Not sure / haven't decided",
]);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stripeSessionId: text("stripe_session_id").notNull(),
    customerEmail: text("customer_email").notNull(),
    r2PdfKey: text("r2_pdf_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    fileSize: integer("file_size").notNull(),
    slideCount: integer("slide_count"),
    stage: stageEnum("stage").notNull(),
    roundAmountNormalized: text("round_amount_normalized").notNull(),
    instrument: instrumentEnum("instrument").notNull(),
    targetInvestors: targetInvestorsEnum("target_investors"),
    tractionOneline: text("traction_oneline"),
    biggestWorry: text("biggest_worry"),
    additionalContext: text("additional_context"),
    status: deckStatusEnum("status").notNull().default("uploaded"),
    pipelineProgress: jsonb("pipeline_progress")
      .$type<PipelineProgress>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    failureReason: text("failure_reason"),
  },
  (t) => [
    index("decks_status_idx").on(t.status),
    index("decks_created_at_idx").on(t.createdAt),
    index("decks_customer_email_idx").on(t.customerEmail),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pass1Output: jsonb("pass_1_output").$type<Pass1Output[]>(),
    pass2Output: jsonb("pass_2_output").$type<Pass2Output>(),
    pass3Output: jsonb("pass_3_output").$type<Pass3Output>(),
    pass4Output: jsonb("pass_4_output").$type<Pass4Output>(),
    pass5Output: jsonb("pass_5_output").$type<Pass5Output>(),
    pass6Output: jsonb("pass_6_output").$type<Pass6Output>(),
    privateToken: text("private_token").notNull(),
    publicToken: text("public_token"),
    isPublic: boolean("is_public").notNull().default(false),
  },
  (t) => [
    uniqueIndex("reports_deck_id_unique").on(t.deckId),
    uniqueIndex("reports_private_token_idx").on(t.privateToken),
    uniqueIndex("reports_public_token_idx")
      .on(t.publicToken)
      .where(sql`${t.publicToken} IS NOT NULL`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    customerEmail: text("customer_email"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    introPricing: boolean("intro_pricing").notNull(),
    deckId: uuid("deck_id").references(() => decks.id, { onDelete: "set null" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("payments_stripe_session_id_idx").on(t.stripeSessionId),
    index("payments_status_idx").on(t.status),
    index("payments_customer_email_idx").on(t.customerEmail),
  ],
);

export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

/**
 * Discriminated unions over deck/report status. Cross-field invariants
 * (status="complete" ↔ failureReason is null; status="failed" ↔ failureReason
 * is non-null; isPublic ↔ publicToken) are NOT enforced at the DB level — no
 * CHECK constraints. Use the narrowing helpers below at the boundary where
 * you read a row to assert these invariants explicitly; TypeScript will then
 * narrow correctly in downstream code.
 */
export type CompletedDeck = Deck & { status: "complete"; failureReason: null };
export type FailedDeck = Deck & { status: "failed"; failureReason: string };
export type ActiveDeck = Deck & { status: "uploaded" | "processing" };

export type PublicReport = Report & { isPublic: true; publicToken: string };
export type PrivateReport = Report & { isPublic: false; publicToken: null };

export function narrowDeck(deck: Deck): CompletedDeck | FailedDeck | ActiveDeck {
  if (deck.status === "failed") {
    if (!deck.failureReason) {
      throw new Error(
        `deck ${deck.id} has status=failed but null failureReason — invariant violated`,
      );
    }
    return deck as FailedDeck;
  }
  if (deck.status === "complete") {
    if (deck.failureReason) {
      throw new Error(
        `deck ${deck.id} has status=complete but non-null failureReason — invariant violated`,
      );
    }
    return deck as CompletedDeck;
  }
  return deck as ActiveDeck;
}

export function narrowReport(report: Report): PublicReport | PrivateReport {
  if (report.isPublic) {
    if (!report.publicToken) {
      throw new Error(
        `report ${report.id} has isPublic=true but null publicToken — invariant violated`,
      );
    }
    return report as PublicReport;
  }
  if (report.publicToken) {
    throw new Error(
      `report ${report.id} has isPublic=false but non-null publicToken — invariant violated`,
    );
  }
  return report as PrivateReport;
}
