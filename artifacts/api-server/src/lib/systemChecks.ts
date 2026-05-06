import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface CheckResult {
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
  message?: string;
}

function runCommand(cmd: string): { output: string; success: boolean } {
  try {
    const output = execSync(cmd, { timeout: 5000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return { output, success: true };
  } catch {
    return { output: "", success: false };
  }
}

const CHECKERS: Record<string, () => CheckResult> = {
  node: () => {
    const result = runCommand("node --version");
    return {
      name: "node",
      installed: result.success,
      version: result.success ? result.output : undefined,
      path: result.success ? (runCommand("which node").output || undefined) : undefined,
      message: result.success ? `Node.js ${result.output} is installed` : "Node.js is not installed",
    };
  },
  npm: () => {
    const result = runCommand("npm --version");
    return {
      name: "npm",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? `npm ${result.output} is installed` : "npm is not installed",
    };
  },
  python: () => {
    const py3 = runCommand("python3 --version");
    const py2 = runCommand("python --version");
    const res = py3.success ? py3 : py2;
    return {
      name: "python",
      installed: res.success,
      version: res.success ? res.output.replace("Python ", "") : undefined,
      message: res.success ? `Python ${res.output.replace("Python ", "")} is installed` : "Python is not installed",
    };
  },
  git: () => {
    const result = runCommand("git --version");
    return {
      name: "git",
      installed: result.success,
      version: result.success ? result.output.replace("git version ", "") : undefined,
      message: result.success ? `Git ${result.output.replace("git version ", "")} is installed` : "Git is not installed",
    };
  },
  docker: () => {
    const result = runCommand("docker --version");
    return {
      name: "docker",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? result.output : "Docker is not installed",
    };
  },
  yarn: () => {
    const result = runCommand("yarn --version");
    return {
      name: "yarn",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? `Yarn ${result.output} is installed` : "Yarn is not installed",
    };
  },
  pnpm: () => {
    const result = runCommand("pnpm --version");
    return {
      name: "pnpm",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? `pnpm ${result.output} is installed` : "pnpm is not installed",
    };
  },
  pip: () => {
    const pip3 = runCommand("pip3 --version");
    const pip = runCommand("pip --version");
    const res = pip3.success ? pip3 : pip;
    return {
      name: "pip",
      installed: res.success,
      version: res.success ? res.output : undefined,
      message: res.success ? res.output : "pip is not installed",
    };
  },
  go: () => {
    const result = runCommand("go version");
    return {
      name: "go",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? result.output : "Go is not installed",
    };
  },
  rust: () => {
    const result = runCommand("rustc --version");
    return {
      name: "rust",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? result.output : "Rust is not installed",
    };
  },
  java: () => {
    const result = runCommand("java -version 2>&1");
    return {
      name: "java",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? result.output : "Java is not installed",
    };
  },
  "git-init": () => {
    const result = runCommand("git rev-parse --is-inside-work-tree");
    return {
      name: "git-init",
      installed: result.success && result.output === "true",
      message: result.success ? "Git repository is initialized" : "No git repository found",
    };
  },
  "dir-exists": () => {
    const cwd = process.cwd();
    const exists = fs.existsSync(cwd);
    return {
      name: "dir-exists",
      installed: exists,
      path: cwd,
      message: exists ? `Directory exists: ${cwd}` : `Directory not found: ${cwd}`,
    };
  },
  bun: () => {
    const result = runCommand("bun --version");
    return {
      name: "bun",
      installed: result.success,
      version: result.success ? result.output : undefined,
      message: result.success ? `Bun ${result.output} is installed` : "Bun is not installed",
    };
  },
};

export function runChecks(checks: string[]): CheckResult[] {
  return checks.map((checkName) => {
    const checker = CHECKERS[checkName.toLowerCase()];
    if (!checker) {
      const result = runCommand(`which ${checkName}`);
      return {
        name: checkName,
        installed: result.success,
        path: result.success ? result.output : undefined,
        message: result.success ? `${checkName} found at ${result.output}` : `${checkName} not found`,
      };
    }
    return checker();
  });
}

export function getProjectContext() {
  const cwd = process.cwd();
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(cwd);
    files.push(...entries.filter((f) => !f.startsWith(".") || f === ".gitignore"));
  } catch {
    // ignore
  }

  let packageJson: Record<string, unknown> | undefined;
  try {
    const raw = fs.readFileSync(path.join(cwd, "package.json"), "utf-8");
    packageJson = JSON.parse(raw);
  } catch {
    // not a node project
  }

  const hasRequirementsTxt = fs.existsSync(path.join(cwd, "requirements.txt"));
  const gitInit = runCommand("git rev-parse --is-inside-work-tree");
  const nodeVersion = runCommand("node --version");

  let projectType = "unknown";
  if (packageJson) projectType = "node";
  else if (hasRequirementsTxt) projectType = "python";
  else if (fs.existsSync(path.join(cwd, "go.mod"))) projectType = "go";
  else if (fs.existsSync(path.join(cwd, "Cargo.toml"))) projectType = "rust";

  return {
    cwd,
    projectFiles: files,
    projectType,
    packageJson,
    requirementsTxt: hasRequirementsTxt,
    gitInitialized: gitInit.success && gitInit.output === "true",
    nodeVersion: nodeVersion.success ? nodeVersion.output : undefined,
  };
}
