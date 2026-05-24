/**
 * SPEC §5 specifies default substitution values for optional questionnaire
 * fields when the user skips them. These defaults are applied at
 * prompt-substitution time (here), not at storage time — the DB stores NULL
 * for missing optionals.
 *
 * Param types are intentionally narrow (just the fields used). This keeps the
 * helpers compatible with both `Deck` from the schema AND the JSON-serialized
 * shapes that come back from Inngest steps (where `Date` columns are strings).
 */
export type QuestionnaireVars = {
  stage: string;
  round_amount: string;
  instrument: string;
  target_investors: string;
  traction_oneline: string;
  biggest_worry: string;
  additional_context: string;
};

type DeckQuestionnaireFields = {
  stage: string;
  roundAmountNormalized: string;
  instrument: string;
  targetInvestors: string | null;
  tractionOneline: string | null;
  biggestWorry: string | null;
  additionalContext: string | null;
};

export function questionnaireVarsForDeck(
  deck: DeckQuestionnaireFields,
): QuestionnaireVars {
  return {
    stage: deck.stage,
    round_amount: deck.roundAmountNormalized,
    instrument: deck.instrument,
    target_investors: deck.targetInvestors ?? "Generalist seed funds",
    traction_oneline: deck.tractionOneline ?? "(not provided)",
    biggest_worry: deck.biggestWorry ?? "(not provided)",
    additional_context: deck.additionalContext ?? "(none)",
  };
}

/** Whether the founder answered Q5 (biggest worry) — gates Pass 6. */
export function hasBiggestWorry(deck: { biggestWorry: string | null }): boolean {
  return !!deck.biggestWorry && deck.biggestWorry.trim().length > 0;
}
