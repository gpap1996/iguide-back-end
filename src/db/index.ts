import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

console.log(`Connecting to database att ${process.env.DATABASE_URL}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: true,
});
export const db = drizzle(pool, { schema });
