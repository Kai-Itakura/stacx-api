import { relations } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }).notNull(),
});

export const userIdentities = sqliteTable(
  "user_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSub: text("provider_sub").notNull(),
    email: text("email"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    name: text("name"),
    pictureUrl: text("picture_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    providerSubUnique: uniqueIndex("user_identities_provider_sub_unique").on(
      t.provider,
      t.providerSub,
    ),
  }),
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
});

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(userIdentities),
  sessions: many(sessions),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type UserIdentity = typeof userIdentities.$inferSelect;
export type Session = typeof sessions.$inferSelect;
