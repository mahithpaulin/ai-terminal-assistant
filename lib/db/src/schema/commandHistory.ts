import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commandHistoryTable = pgTable("command_history", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().default("default"),
  input: text("input").notNull(),
  intent: text("intent"),
  command: text("command"),
  explanation: text("explanation"),
  executed: boolean("executed").notNull().default(false),
  success: boolean("success"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  exitCode: integer("exit_code"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommandHistorySchema = createInsertSchema(commandHistoryTable).omit({ id: true, createdAt: true });
export type InsertCommandHistory = z.infer<typeof insertCommandHistorySchema>;
export type CommandHistory = typeof commandHistoryTable.$inferSelect;
