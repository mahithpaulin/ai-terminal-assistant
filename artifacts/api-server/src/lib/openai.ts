import OpenAI from "openai";
import { checkCommandSafety } from "./safety.js";

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export interface IntentResult {
  intent: string;
  response: string;
  commands: Array<{
    command: string;
    explanation: string;
    isDangerous: boolean;
    dangerWarning?: string;
    requiresConfirmation: boolean;
  }>;
  requirementsCheck?: {
    satisfied: boolean;
    missing: string[];
  };
}

export async function processNaturalLanguage(
  client: OpenAI,
  message: string,
  context: {
    cwd?: string;
    projectFiles?: string[];
    projectType?: string;
    dryRun?: boolean;
  } = {}
): Promise<IntentResult> {
  const systemPrompt = `You are an AI-powered terminal assistant. Your job is to:
1. Understand natural language commands from developers
2. Generate appropriate shell commands
3. Explain what each command does clearly
4. Identify the user's intent

Current context:
- Working directory: ${context.cwd || "unknown"}
- Project type: ${context.projectType || "unknown"}
- Project files: ${(context.projectFiles || []).slice(0, 20).join(", ") || "unknown"}
- Dry run mode: ${context.dryRun ? "YES — only suggest, do not run" : "no"}

Respond with a JSON object (no markdown, just raw JSON) in this exact format:
{
  "intent": "snake_case_intent_name like setup_node_project or list_files",
  "response": "A friendly explanation of what you understood and what you'll do",
  "commands": [
    {
      "command": "the actual shell command",
      "explanation": "What this command does in plain English, including flags breakdown"
    }
  ]
}

Rules:
- Always generate real, executable shell commands
- Keep explanations clear and beginner-friendly
- For complex tasks, break into multiple ordered commands
- If the request is ambiguous, pick the most likely interpretation and note alternatives in the response
- Never generate more than 5 commands
- Use standard Unix/Linux commands`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  let parsed: { intent: string; response: string; commands: Array<{ command: string; explanation: string }> };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Failed to parse AI response");
  }

  const commands = (parsed.commands || []).map((cmd) => {
    const safety = checkCommandSafety(cmd.command);
    return {
      command: cmd.command,
      explanation: cmd.explanation,
      isDangerous: safety.isDangerous,
      dangerWarning: safety.warning,
      requiresConfirmation: safety.isDangerous,
    };
  });

  return {
    intent: parsed.intent || "unknown",
    response: parsed.response || "Here are the suggested commands.",
    commands,
  };
}

export async function explainCommand(
  client: OpenAI,
  command: string,
  mode: "brief" | "detailed" | "beginner" = "brief"
): Promise<{
  explanation: string;
  flags: Array<{ flag: string; description: string }>;
}> {
  const depth = mode === "beginner"
    ? "Explain as if to someone who is new to command line. Be thorough and use simple words."
    : mode === "detailed"
    ? "Provide a detailed technical explanation including edge cases and options."
    : "Provide a concise explanation suitable for an experienced developer.";

  const systemPrompt = `You are a shell command expert. ${depth}

Respond with JSON (no markdown):
{
  "explanation": "Overall explanation of what the command does",
  "flags": [
    { "flag": "-flag or --flag-name", "description": "what this flag does" }
  ]
}

Only include flags that are actually present in the command. If no flags, return empty array.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Explain this command: ${command}` },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  try {
    return JSON.parse(content);
  } catch {
    return { explanation: content, flags: [] };
  }
}

export async function suggestErrorFix(
  client: OpenAI,
  command: string,
  stderr: string,
  exitCode?: number,
  context?: Record<string, unknown>
): Promise<{
  explanation: string;
  suggestedFix: string;
  commands: Array<{ command: string; explanation: string; isDangerous: boolean; dangerWarning?: string; requiresConfirmation: boolean }>;
}> {
  const systemPrompt = `You are an expert at diagnosing and fixing shell command errors. 
Analyze the error and suggest a fix.

Context:
- Working directory: ${context?.cwd || "unknown"}
- Project type: ${context?.projectType || "unknown"}

Respond with JSON (no markdown):
{
  "explanation": "What went wrong and why",
  "suggestedFix": "Step-by-step fix in plain English",
  "commands": [
    { "command": "fix command", "explanation": "what it does" }
  ]
}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Command: ${command}\nError (exit code ${exitCode ?? "unknown"}):\n${stderr}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response");

  try {
    const parsed = JSON.parse(content);
    const commands = (parsed.commands || []).map((cmd: { command: string; explanation: string }) => {
      const safety = checkCommandSafety(cmd.command);
      return {
        command: cmd.command,
        explanation: cmd.explanation,
        isDangerous: safety.isDangerous,
        dangerWarning: safety.warning,
        requiresConfirmation: safety.isDangerous,
      };
    });
    return { explanation: parsed.explanation, suggestedFix: parsed.suggestedFix, commands };
  } catch {
    return {
      explanation: "An error occurred while processing your command.",
      suggestedFix: "Check the error message above for hints.",
      commands: [],
    };
  }
}
