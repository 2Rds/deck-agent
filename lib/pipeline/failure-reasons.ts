/**
 * Stable string codes for `decks.failure_reason`. Stage F refund routing
 * depends on these being stable — operator alert rules and refund automation
 * filter on the exact values.
 */
export const FAILURE_REASONS = {
  // Stage C / pre-pipeline
  INNGEST_DISPATCH_FAILED: "inngest_dispatch_failed",

  // Stage D / pipeline
  STAGE_0_PDF_FETCH_FAILED: "stage_0_pdf_fetch_failed",
  STAGE_0_PDF_PARSE_FAILED: "stage_0_pdf_parse_failed",
  PASS_1_VALIDATION_EXHAUSTED: "pass_1_validation_exhausted",
  PASS_2_VALIDATION_EXHAUSTED: "pass_2_validation_exhausted",
  PASS_3_VALIDATION_EXHAUSTED: "pass_3_validation_exhausted",
  PASS_4_VALIDATION_EXHAUSTED: "pass_4_validation_exhausted",
  PASS_5_VALIDATION_EXHAUSTED: "pass_5_validation_exhausted",
  PASS_6_VALIDATION_EXHAUSTED: "pass_6_validation_exhausted",
  ANTHROPIC_RATE_LIMIT_EXHAUSTED: "anthropic_rate_limit_exhausted",
  ANTHROPIC_TRANSPORT_FAILED: "anthropic_transport_failed",
  REPORT_FINALIZATION_FAILED: "report_finalization_failed",
  EMAIL_DELIVERY_FAILED: "email_delivery_failed",
} as const;

export type FailureReason = (typeof FAILURE_REASONS)[keyof typeof FAILURE_REASONS];
