import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "./db/schema";

type Bindings = {
  DB: D1Database;
  APP_BASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

type Variables = {
  db: DrizzleD1Database<typeof schema>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath("/api");

app.use("*", async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

const routes = app.get("/health", (c) => c.json({ ok: true }));

export type AppType = typeof routes;
export default app;
