import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { getSetting } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINT_SCRIPT = path.join(__dirname, "scripts", "lint_helper.py");

export interface LintError {
  line: number;
  col: number;
  msg: string;
  severity: "error" | "warning" | "info";
}

export async function lintCode(code: string): Promise<LintError[]> {
  if (!code.trim()) return [];

  const python = getSetting("python_path") || (process.platform === "win32" ? "python" : "python3");

  return new Promise((resolve) => {
    const proc = spawn(python, [LINT_SCRIPT], { timeout: 10_000 });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.stdin.write(code);
    proc.stdin.end();

    proc.on("close", () => {
      try {
        const errors = JSON.parse(stdout);
        resolve(Array.isArray(errors) ? errors : []);
      } catch {
        // If lint script fails, return empty (don't block the user)
        resolve([]);
      }
    });

    proc.on("error", () => { resolve([]); });
  });
}
