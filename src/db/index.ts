import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

console.log(`Connecting to database at ${process.env.DATABASE_URL}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: false,
});
export const db = drizzle(pool, { schema });
