import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads the source-of-truth prompt markdown files from /prompts at runtime.
 * Each file follows the structure documented in prompts/README.md:
 *
 *   ## System Prompt
 *   <system content>
 *   ## User Message Template
 *   <user template with {{variables}}>
 *   ## Variables
 *   <reference list>
 *
 * The loader reads + parses + caches; substituteVariables interpolates the
 * runtime values before sending to Anthropic.
 */

export type PromptName =
  | "pass-1"
  | "pass-2"
  | "pass-3"
  | "pass-4"
  | "pass-5"
  | "pass-6";

export type Prompt = {
  system: string;
  userTemplate: string;
};

const cache = new Map<PromptName, Prompt>();

const PROMPT_DIR = join(process.cwd(), "prompts");

export function loadPrompt(name: PromptName): Prompt {
  const hit = cache.get(name);
  if (hit) return hit;
  const path = join(PROMPT_DIR, `${name}.md`);
  const raw = readFileSync(path, "utf8");
  const parsed = parsePromptFile(raw, name);
  cache.set(name, parsed);
  return parsed;
}

function parsePromptFile(raw: string, name: PromptName): Prompt {
  const systemMatch = raw.match(
    /##\s+System Prompt\s*\n+([\s\S]*?)\n+##\s+User Message Template/,
  );
  // Stop at the next ## section or end-of-file.
  const userMatch = raw.match(
    /##\s+User Message Template\s*\n+([\s\S]*?)(?:\n+##\s+\w|\s*$)/,
  );
  if (!systemMatch || !userMatch) {
    throw new Error(
      `loadPrompt(${name}): could not locate System Prompt or User Message Template sections in markdown`,
    );
  }
  return {
    system: systemMatch[1].trim(),
    userTemplate: userMatch[1].trim(),
  };
}

/**
 * Replaces every `{{variable}}` token in a template with the corresponding
 * value from `vars`. Throws if a referenced variable is missing — runtime
 * surfacing of typos beats silent placeholder strings reaching the model.
 */
export function substituteVariables(
  template: string,
  vars: Record<string, string>,
): string {
  const missing = new Set<string>();
  const result = template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = vars[varName];
    if (value === undefined) {
      missing.add(varName);
      return "";
    }
    return value;
  });
  if (missing.size > 0) {
    throw new Error(
      `substituteVariables: missing values for ${Array.from(missing).join(", ")}`,
    );
  }
  return result;
}
