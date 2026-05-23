# Prompts — Source of Truth

The prompt files in this directory are the actual instructions sent to Claude (`claude-sonnet-4-6`) for each pass of the DeckRedTeam pipeline.

## Rules for Working with These Files

**1. Do not rewrite or "improve" these prompts.** They have been deliberately iterated to produce high-quality output. Stylistic edits that feel like improvements (clearer wording, more polite tone, "better" structure) routinely degrade output quality. The prompts may read as terse, repetitive, or unusually direct — that's intentional.

**2. Substitute `{{variables}}` as-is.** Don't reformat the variables or wrap them in additional context.

**3. Send to the API verbatim.** The system prompt section goes to the `system` parameter. The user message template goes to the `messages` array as the user role content.

**4. If a prompt seems wrong or needs to change, edit the file directly and document the reason.** Don't apply edits in code at runtime — that hides changes from version control.

## File Format

Each file uses this structure:

```
# Pass N — [Name]

## Meta
- Model: claude-sonnet-4-6
- Temperature: 0.X
- Max tokens: NNNN

## System Prompt

[Full system prompt text]

## User Message Template

[User message template with {{variables}}]

## Variables

- {{var1}}: description
- {{var2}}: description
```

## Loading at Runtime

The Worker loads these files at startup (or per request, your choice) and substitutes variables before each API call. A simple regex replace is sufficient — no templating language is used inside the prompts.
