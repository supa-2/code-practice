import { spawn, execSync } from "child_process";
import { getSetting } from "./db.js";
import { existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";

const TIMEOUT_MS = 30_000;

function getPythonPath(): string {
  const custom = getSetting("python_path");
  if (custom) return custom;

  // Common Windows uv paths
  if (process.platform === "win32") {
    const home = os.homedir();
    const uvDir = path.join(home, "AppData", "Roaming", "uv", "python");
    try {
      const dirs = readdirSync(uvDir).filter((d: string) => d.startsWith("cpython-3.12"));
      if (dirs.length > 0) {
        const p = path.join(uvDir, dirs[0], "python.exe");
        if (existsSync(p)) return p;
      }
    } catch {}
  }

  // Try uv python find
  try {
    const result = execSync("uv python find 3.12", { encoding: "utf-8", timeout: 5000 }).trim();
    if (result && existsSync(result)) return result;
  } catch {}

  return process.platform === "win32" ? "python" : "python3";
}

export interface RunResult {
  stdout: string;
  stderr: string;
  returncode: number;
  elapsed_ms: number;
}

export function runCode(code: string, cwd?: string): Promise<RunResult> {
  const python = getPythonPath();
  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(python, ["-c", code], {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        returncode: code ?? -1,
        elapsed_ms: Date.now() - startTime,
      });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: `Failed to start Python: ${err.message}`,
        returncode: -1,
        elapsed_ms: Date.now() - startTime,
      });
    });
  });
}

export async function runTests(userCode: string, testCode: string, cwd?: string): Promise<{
  passed: boolean;
  output: string;
  error: string;
  elapsed_ms: number;
}> {
  const fullCode = userCode + "\n\n# --- TESTS ---\n" + testCode;
  const result = await runCode(fullCode, cwd);

  const hasError = result.returncode !== 0;
  const output = result.stdout;
  const error = result.stderr;

  return {
    passed: !hasError && output.includes("All tests passed"),
    output,
    error: hasError ? error : "",
    elapsed_ms: result.elapsed_ms,
  };
}
