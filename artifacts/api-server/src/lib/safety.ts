const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+--recursive/i,
  /sudo\s+/i,
  />\s*\/dev\/sd[a-z]/i,
  /dd\s+if=/i,
  /mkfs/i,
  /:\(\)\s*\{.*\|.*&/i, // fork bomb
  /chmod\s+-R\s+777/i,
  /curl.*\|\s*(bash|sh|zsh)/i,
  /wget.*\|\s*(bash|sh|zsh)/i,
  /eval\s*\(/i,
  />\s*\/etc\//i,
  /systemctl\s+(stop|disable|mask)/i,
  /kill\s+-9\s+-1/i,
  /shutdown/i,
  /reboot/i,
  /format\s+[a-z]:/i,
  /del\s+\/[sqf]/i,
  /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i,
  /TRUNCATE\s+TABLE/i,
];

const DANGEROUS_WORDS = [
  "sudo", "rm -rf", "format", "mkfs", "dd if=", "shutdown", "reboot",
  "killall", "kill -9", ":(){:|:&}", "curl | bash", "wget | sh",
];

export interface SafetyResult {
  isDangerous: boolean;
  warning?: string;
  patterns: string[];
}

export function checkCommandSafety(command: string): SafetyResult {
  const matchedPatterns: string[] = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  const isDangerous = matchedPatterns.length > 0;

  let warning: string | undefined;
  if (isDangerous) {
    if (/rm\s+-rf/i.test(command)) {
      warning = "This command will permanently delete files recursively. This action cannot be undone.";
    } else if (/sudo/i.test(command)) {
      warning = "This command runs with elevated privileges and can modify system files.";
    } else if (/dd\s+if=/i.test(command)) {
      warning = "This command writes directly to a device and can destroy all data.";
    } else if (/curl.*\|\s*(bash|sh)/i.test(command) || /wget.*\|\s*(bash|sh)/i.test(command)) {
      warning = "This command downloads and executes code from the internet. Only run from trusted sources.";
    } else if (/DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE/i.test(command)) {
      warning = "This SQL command will permanently destroy database data.";
    } else {
      warning = "This command has been flagged as potentially dangerous. Please review carefully before executing.";
    }
  }

  return { isDangerous, warning, patterns: matchedPatterns };
}

export function sanitizeOutput(output: string): string {
  return output
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/password[=:]\s*\S+/gi, "password=[REDACTED]")
    .replace(/token[=:]\s*\S+/gi, "token=[REDACTED]");
}
