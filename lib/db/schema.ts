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

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stripeSessionId: text("stripe_session_id").notNull(),
    r2PdfKey: text("r2_pdf_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    fileSize: integer("file_size").notNull(),
    slideCount: integer("slide_count"),
    stage: text("stage").notNull(),
    roundAmountNormalized: text("round_amount_normalized").notNull(),
    instrument: text("instrument").notNull(),
    targetInvestors: text("target_investors"),
    tractionOneline: text("traction_oneline"),
    biggestWorry: text("biggest_worry"),
    additionalContext: text("additional_context"),
    status: deckStatusEnum("status").notNull().default("uploaded"),
    pipelineProgress: jsonb("pipeline_progress")
      .notNull()
      .default(sql`'{}'::jsonb`),
    failureReason: text("failure_reason"),
  },
  (t) => [
    index("decks_status_idx").on(t.status),
    index("decks_created_at_idx").on(t.createdAt),
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
    pass1Output: jsonb("pass_1_output"),
    pass2Output: jsonb("pass_2_output"),
    pass3Output: jsonb("pass_3_output"),
    pass4Output: jsonb("pass_4_output"),
    pass5Output: jsonb("pass_5_output"),
    pass6Output: jsonb("pass_6_output"),
    privateToken: text("private_token").notNull(),
    publicToken: text("public_token"),
    isPublic: boolean("is_public").notNull().default(false),
  },
  (t) => [
    uniqueIndex("reports_deck_id_unique").on(t.deckId),
    uniqueIndex("reports_private_token_idx").on(t.privateToken),
    uniqueIndex("reports_public_token_idx").on(t.publicToken),
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
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    introPricing: boolean("intro_pricing").notNull(),
    deckId: uuid("deck_id").references(() => decks.id, { onDelete: "set null" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("payments_stripe_session_id_idx").on(t.stripeSessionId),
    index("payments_status_idx").on(t.status),
  ],
);

export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
