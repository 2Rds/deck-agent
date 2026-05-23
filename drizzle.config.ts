import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

try {
  const host = new URL(databaseUrl).host;
  console.log(`[drizzle-kit] DATABASE_URL host: ${host}`);
} catch {
  throw new Error("DATABASE_URL is not a valid URL");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
