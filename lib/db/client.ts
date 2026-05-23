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
    const { db } = init();
    return Reflect.get(db, prop, db);
  },
});

export * from "./schema";
