import { Router } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@workspace/db";
import { commandHistoryTable } from "@workspace/db";
import { desc, eq, count } from "drizzle-orm";
import {
  SetApiKeyBody,
  ChatBody,
  ExecuteCommandBody,
  ExplainCommandBody,
  SystemCheckBody,
  GetHistoryQueryParams,
  AddRequirementBody,
  FixErrorBody,
} from "@workspace/api-zod";
import { getApiKey, setApiKey, hasApiKey } from "../lib/session.js";
import { createOpenAIClient, processNaturalLanguage, explainCommand as aiExplainCommand, suggestErrorFix } from "../lib/openai.js";
import { checkCommandSafety, sanitizeOutput } from "../lib/safety.js";
import { runChecks, getProjectContext } from "../lib/systemChecks.js";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const router = Router();

const REQUIREMENTS_PATH = new URL("../data/requirements.json", import.meta.url).pathname;

function loadRequirements(): Record<string, string[]> {
  try {
    return JSON.parse(fs.readFileSync(REQUIREMENTS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRequirements(data: Record<string, string[]>): void {
  fs.writeFileSync(REQUIREMENTS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

router.post("/api-key", async (req, res) => {
  const parsed = SetApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error });
  }

  const { apiKey } = parsed.data;

  try {
    const client = createOpenAIClient(apiKey);
    await client.models.list();
    setApiKey(req, apiKey);
    return res.json({ hasKey: true, valid: true, message: "API key validated and stored successfully." });
  } catch {
    return res.status(400).json({ hasKey: false, valid: false, message: "Invalid API key. Please check and try again." });
  }
});

router.get("/api-key", (req, res) => {
  const has = hasApiKey(req);
  return res.json({ hasKey: has, valid: has, message: has ? "API key is set." : "No API key configured." });
});

router.post("/chat", async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error });
  }

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: "No API key configured. Please set your OpenAI API key first." });
  }

  const { message, dryRun, context } = parsed.data;

  try {
    const projectContext = getProjectContext();
    const client = createOpenAIClient(apiKey);
    const result = await processNaturalLanguage(client, message, {
      cwd: context?.cwd || projectContext.cwd,
      projectFiles: context?.projectFiles || projectContext.projectFiles,
      projectType: projectContext.projectType,
      dryRun: dryRun || false,
    });

    const requirements = loadRequirements();
    const intentRequirements = requirements[result.intent] || [];
    const requirementsCheck = intentRequirements.length > 0
      ? { satisfied: true, missing: [] as string[] }
      : undefined;

    const [historyEntry] = await db
      .insert(commandHistoryTable)
      .values({
        sessionId: req.sessionID || "default",
        input: message,
        intent: result.intent,
        command: result.commands[0]?.command,
        explanation: result.commands[0]?.explanation,
        executed: false,
      })
      .returning();

    return res.json({
      intent: result.intent,
      response: result.response,
      commands: result.commands,
      requirementsCheck,
      historyId: historyEntry?.id,
    });
  } catch (err) {
    req.log.error({ err }, "Chat error");
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

router.post("/execute", async (req, res) => {
  const parsed = ExecuteCommandBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const { command, historyId, confirmed } = parsed.data;

  if (!confirmed) {
    return res.status(400).json({ error: "Command execution requires explicit confirmation." });
  }

  const safety = checkCommandSafety(command);
  if (safety.isDangerous && !confirmed) {
    return res.status(400).json({
      error: "Dangerous command requires explicit confirmation.",
      warning: safety.warning,
    });
  }

  const startTime = Date.now();
  let success = false;
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const result = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      shell: "/bin/sh",
    });
    stdout = sanitizeOutput(result.stdout || "");
    stderr = sanitizeOutput(result.stderr || "");
    success = true;
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    stdout = sanitizeOutput(execErr.stdout || "");
    stderr = sanitizeOutput(execErr.stderr || execErr.message || "Command failed");
    exitCode = execErr.code || 1;
    success = false;
  }

  const durationMs = Date.now() - startTime;

  if (historyId) {
    await db
      .update(commandHistoryTable)
      .set({ executed: true, success, stdout, stderr, exitCode, durationMs })
      .where(eq(commandHistoryTable.id, historyId));
  } else {
    await db.insert(commandHistoryTable).values({
      sessionId: req.sessionID || "default",
      input: command,
      command,
      executed: true,
      success,
      stdout,
      stderr,
      exitCode,
      durationMs,
    });
  }

  return res.json({ success, stdout, stderr, exitCode, durationMs });
});

router.post("/explain", async (req, res) => {
  const parsed = ExplainCommandBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: "No API key configured." });
  }

  const { command, mode } = parsed.data;
  const safety = checkCommandSafety(command);

  try {
    const client = createOpenAIClient(apiKey);
    const result = await aiExplainCommand(client, command, mode || "brief");

    return res.json({
      command,
      explanation: result.explanation,
      flags: result.flags,
      isDangerous: safety.isDangerous,
      dangerWarning: safety.warning,
    });
  } catch (err) {
    req.log.error({ err }, "Explain error");
    return res.status(500).json({ error: "Failed to explain command" });
  }
});

router.post("/system-check", async (req, res) => {
  const parsed = SystemCheckBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const { checks } = parsed.data;
  const results = runChecks(checks);
  const cwd = process.cwd();

  return res.json({ results, cwd });
});

router.get("/context", async (req, res) => {
  const context = getProjectContext();
  return res.json(context);
});

router.get("/history", async (req, res) => {
  const parsed = GetHistoryQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? Number(parsed.data.limit) : 50;

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(commandHistoryTable)
      .orderBy(desc(commandHistoryTable.createdAt))
      .limit(limit),
    db.select({ count: count() }).from(commandHistoryTable),
  ]);

  return res.json({
    items: items.map((item) => ({
      id: item.id,
      input: item.input,
      intent: item.intent,
      command: item.command,
      explanation: item.explanation,
      executed: item.executed,
      success: item.success,
      output: item.stdout,
      createdAt: item.createdAt.toISOString(),
    })),
    total: totalResult[0]?.count || 0,
  });
});

router.delete("/history", async (req, res) => {
  const result = await db.delete(commandHistoryTable).returning({ id: commandHistoryTable.id });
  return res.json({ deleted: result.length });
});

router.get("/requirements", (req, res) => {
  const requirements = loadRequirements();
  return res.json({ requirements });
});

router.post("/requirements", (req, res) => {
  const parsed = AddRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const { taskName, steps } = parsed.data;
  const requirements = loadRequirements();
  requirements[taskName] = steps;
  saveRequirements(requirements);

  return res.json({ requirements });
});

router.post("/fix-error", async (req, res) => {
  const parsed = FixErrorBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: "No API key configured." });
  }

  const { command, stderr, exitCode, context } = parsed.data;

  try {
    const client = createOpenAIClient(apiKey);
    const result = await suggestErrorFix(client, command, stderr, exitCode ?? undefined, context as Record<string, unknown> ?? {});
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fix error failed");
    return res.status(500).json({ error: "Failed to suggest fix" });
  }
});

export default router;
