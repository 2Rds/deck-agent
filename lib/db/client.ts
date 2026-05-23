import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbConn = ReturnType<typeof drizzle<typeof schema>>;
let cached: { db: DbConn; client: postgres.Sql } | null = null;

function init() {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  try {
    console.log(
      `[db] connecting to ${new URL(connectionString).host} as postgres user`,
    );
  } catch {
    // ignore URL parse errors — error will surface on first query
  }
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    connect_timeout: 10,
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connection: {
      statement_timeout: 30_000,
    },
    onnotice: (notice) => {
      if (notice.severity === "WARNING" || notice.severity === "ERROR") {
        console.warn("[pg]", notice.severity, notice.message);
      }
    },
  });
  const db = drizzle(client, { schema });
  cached = { db, client };
  return cached;
}

export const db = new Proxy({} as DbConn, {
  get(_t, prop) {
    // Promise-detection probes (Symbol.toPrimitive, "then", etc.) must short-circuit
    // before init() runs — otherwise the proxy looks like a rejected thenable to
    // anything that does `await db` or `Promise.resolve(db)`, masking the real
    // "DATABASE_URL missing" error as an UnhandledPromiseRejection.
    if (prop === "then" || typeof prop === "symbol") return undefined;
    const { db } = init();
    return Reflect.get(db, prop, db);
  },
});

/**
 * Escape hatch for code that needs the raw postgres.Sql client — e.g.,
 * LISTEN/NOTIFY, manual transactions outside Drizzle, or one-off migration
 * scripts. Most code should use `db` instead.
 */
export function getDbClient(): postgres.Sql {
  return init().client;
}

export * from "./schema";
