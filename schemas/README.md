# Schemas — Source of Truth

The schema files in this directory define the structured outputs of each pipeline pass. They are written as Zod schemas and used for runtime validation in the Worker.

## Rules for Working with These Files

**1. Do not modify field names, types, or required/optional status.** These schemas are coupled to the prompts and to the report rendering. Changes here require corresponding prompt and renderer changes.

**2. You may add code-level types around these schemas** — TypeScript inferred types, helper functions, transformations for the report renderer. Do not change the source schema definitions.

**3. Use Zod's `.parse()` for runtime validation.** If validation fails, follow the retry rules specified in the corresponding prompt file's "Notes for Implementation" section.

## Files

- `pass-1-output.ts` — single slide extraction output
- `deck-extraction.ts` — assembled output of all Pass 1 calls (the input to Pass 2)
- `pass-2-output.ts` — math + consistency audit output
- `pass-3-output.ts` — investor objections output
- `pass-4-output.ts` — structural audit output
- `pass-5-output.ts` — rewrites output
- `pass-6-output.ts` — anxiety addendum output (nullable in the report — null when Question 5 was skipped)
- `questionnaire.ts` — questionnaire form data (used by the upload page)

## Using with Anthropic API

You have two options for enforcing schema compliance at the API level:

1. **Tool use / structured output:** Convert the Zod schema to JSON Schema (e.g., via `zod-to-json-schema`) and pass as a tool definition. Force Claude to return structured output via that tool.

2. **Prompt-only:** Send the prompt as-is and parse the JSON from the response, validating with Zod. This works because the prompts explicitly instruct "Return only the JSON object — no preamble, no markdown fences."

Recommendation: try Option 2 first. It's simpler. If you see >5% JSON parse failures in testing, switch to Option 1.
