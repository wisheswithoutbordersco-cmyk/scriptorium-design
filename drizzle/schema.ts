import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type GenerationPageResult = {
  pageNumber: number;
  imageUrl: string;
  status: "success" | "error";
  error?: string;
};

export const generationJobs = mysqlTable("generationJobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  prompt: text("prompt").notNull(),
  outputStyle: mysqlEnum("outputStyle", ["full-color", "coloring"]).notNull(),
  sizePreset: varchar("sizePreset", { length: 32 }).notNull(),
  pageCount: int("pageCount").notNull(),
  currentPage: int("currentPage").notNull().default(0),
  processing: boolean("processing").notNull().default(false),
  status: mysqlEnum("status", ["queued", "generating", "assembling", "complete", "partial", "error"]).notNull().default("queued"),
  statusMessage: text("statusMessage").notNull(),
  pageResults: json("pageResults").$type<GenerationPageResult[]>().notNull(),
  pdfUrl: text("pdfUrl"),
  filename: varchar("filename", { length: 255 }).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenerationJob = typeof generationJobs.$inferSelect;
