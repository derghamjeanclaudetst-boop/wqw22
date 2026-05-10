import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
// Keep WebSocket connections alive between requests to avoid cold-start latency
neonConfig.poolQueryViaFetch = false;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Allow up to 10 concurrent DB connections
  max: 10,
  // Drop idle connections after 30 seconds to free resources
  idleTimeoutMillis: 30_000,
  // Fail fast if we can't get a connection within 5 seconds
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema });
