import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { authApp, authMiddleware } from "./auth/index";
import * as schema from "./db/schema";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

const routes = app
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", authApp)
  .get("/me", authMiddleware, (c) => c.json({ user: c.var.user }));

export type AppType = typeof routes;
export default app;
