import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const outputStyleEnum = pgEnum("output_style", ["full-color", "coloring"]);
export const generationStatusEnum = pgEnum("generation_status", [
  "queued",
  "generating",
  "assembling",
  "complete",
  "partial",
  "error",
]);

/**
 * Core user table backing the auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /**
   * External auth identifier. Holds the Clerk user id (e.g. `user_2ab...`).
   * The column keeps the `openId` name so existing rows and queries survive the
   * migration off the legacy internal OAuth provider.
   */
  openId: varchar("openId", { length: 191 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Auth provider used for the session. `clerk` for all new sign-ins. */
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type GenerationPageResult = {
  pageNumber: number;
  imageUrl: string;
  status: "success" | "error";
  error?: string;
};

export const generationJobs = pgTable("generationJobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /**
   * Owner of the job, stored as the Clerk user id. Nullable so legacy rows
   * created before authentication was required remain readable.
   */
  userId: varchar("userId", { length: 191 }),
  prompt: text("prompt").notNull(),
  outputStyle: outputStyleEnum("outputStyle").notNull(),
  sizePreset: varchar("sizePreset", { length: 32 }).notNull(),
  pageCount: integer("pageCount").notNull(),
  currentPage: integer("currentPage").notNull().default(0),
  processing: boolean("processing").notNull().default(false),
  status: generationStatusEnum("status").notNull().default("queued"),
  statusMessage: text("statusMessage").notNull(),
  pageResults: jsonb("pageResults").$type<GenerationPageResult[]>().notNull(),
  pdfUrl: text("pdfUrl"),
  filename: varchar("filename", { length: 255 }).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type GenerationJob = typeof generationJobs.$inferSelect;
