import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { runCode, runTests } from "./runner.js";
import { lintCode } from "./linter.js";
import { streamChat, streamAnalysis, resetSession, getSessionId, ruleBasedAnalysis } from "./ai.js";
import { saveSubmission, getLatestCode, getStats, getSubmissions, getSetting, setSetting, saveAnalysis, getProblemList, getProblem, getProblemAnswer, getProblemLearn, upsertProblem, deleteProblem } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Server ──

// ── Server ──

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "10mb" }));

  // ── Health ──
  app.get("/api/ping", (_req, res) => {
    res.json({ status: "ok", mode: "codemaster" });
  });

  // ── Problems ──
  app.get("/api/problems", (_req, res) => {
    res.json({ problems: getProblemList() });
  });

  app.get("/api/problems/:id", (req, res) => {
    const problem = getProblem(req.params.id);
    if (!problem) return res.status(404).json({ error: "Problem not found" });
    res.json(problem);
  });

  app.get("/api/problems/:id/learn", (req, res) => {
    res.json({ content: getProblemLearn(req.params.id) });
  });

  app.get("/api/problems/:id/answer", (req, res) => {
    const answer = getProblemAnswer(req.params.id);
    if (!answer) return res.status(404).json({ error: "No answer" });
    res.json({ answer });
  });

  // Admin: add/update problem
  app.post("/api/problems", (req, res) => {
    const { id, title, difficulty, category, module, description, starter_code, tests, answer, testcases, learn } = req.body;
    if (!id || !title) return res.status(400).json({ error: "id and title required" });
    upsertProblem({ id, title, difficulty, category, module, description, starter_code, tests, answer, testcases, learn });
    res.json({ status: "ok" });
  });

  // Admin: delete problem
  app.delete("/api/problems/:id", (req, res) => {
    deleteProblem(req.params.id);
    res.json({ status: "ok" });
  });

  // ── Run (run tests.py, show pass/fail per visible case) ──
  app.post("/api/run", async (req, res) => {
    const { code, problemId } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });

    if (problemId) {
      const problem = getProblem(problemId);
      if (!problem) { res.json(await runCode(code)); return; }

      // Run the full tests.py
      const result = await runTests(code, problem.tests);
      // Map to per-case display using testcases metadata
      const tcs: any[] = problem.testcases || [];

      // Extract the relevant error snippet — just the error type and message
      const fullError = result.error || result.output || "";
      const errorLines = fullError.split("\n").filter(l => l.trim());
      // Show only last 1-2 lines (the actual error, not the full traceback)
      const errorSnippet = errorLines.length > 2
        ? errorLines.slice(-2).join("\n")
        : errorLines.join("\n");

      const cases = tcs.length > 0
        ? tcs.map((tc: any, i: number) => ({
            name: tc.name,
            output: result.passed ? (tc.expected || "✓") : (i === 0 ? errorSnippet : "前序测试未通过"),
            error: result.passed ? "" : (i === 0 ? result.error : ""),
            passed: result.passed,
            returncode: result.passed ? 0 : 1,
          }))
        : [{ name: "Test Suite", output: result.output || errorSnippet, error: result.error, passed: result.passed, returncode: result.passed ? 0 : 1 }];

      res.json({ cases, passed: result.passed, elapsed_ms: result.elapsed_ms, output: result.output, error: result.error, returncode: result.passed ? 0 : 1, stdout: "", stderr: "" });
      return;
    }

    const result = await runCode(code);
    res.json(result);
  });

  // ── Submit (full test suite) ──
  app.post("/api/test", async (req, res) => {
    const { problemId, code } = req.body;
    if (!problemId || !code) return res.status(400).json({ error: "Missing problemId or code" });

    const problem = getProblem(problemId);
    if (!problem) return res.status(404).json({ error: "Problem not found" });

    // Run the full tests.py
    const result = await runTests(code, problem.tests);
    const subId = saveSubmission(problemId, "test", code, result.output || result.error, result.passed);
    res.json({ ...result, submissionId: subId });
  });

  // ── Lint ──
  app.post("/api/lint", async (req, res) => {
    const { code } = req.body;
    const errors = await lintCode(code || "");
    res.json(errors);
  });

  // ── Chat (Claude CLI) ──
  app.post("/api/chat", async (req, res) => {
    const { messages, code, exercise } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Load problem info for AI context
    let problemInfo = "";
    if (exercise && exercise !== "free") {
      const p = getProblem(exercise);
      if (p) {
        problemInfo = `题目：${p.title}\n${p.description?.slice(0, 1000) || ""}`;
        if (p.testcases?.length) {
          problemInfo += `\n\n测试用例：\n${p.testcases.slice(0, 3).map((tc: any, i: number) => `Case ${i+1}: ${tc.name} → ${tc.expected || "check output"}`).join("\n")}`;
        }
      }
    }

    let fullText = "";

    await streamChat(
      messages || [],
      code || "",
      exercise || "free",
      problemInfo,
      (text) => {
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      },
      (sessionId) => {
        res.write(`data: ${JSON.stringify({ done: true, session_id: sessionId })}\n\n`);
        res.end();
      },
      (error) => {
        // Try rule-based fallback
        const userMsg = [...(messages || [])].reverse().find((m: any) => m.role === "user")?.content || "";
        if (code && userMsg) {
          const findings = ruleBasedAnalysis(code, "");
          const text = findings.length
            ? "⚠ Claude CLI 不可用，使用规则分析：\n\n" + findings.map(f => `- ${f}`).join("\n")
            : "⚠ Claude CLI 不可用。请确认 Claude Code 已安装。";
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ error })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      },
    );
  });

  app.post("/api/chat/new", (_req, res) => {
    resetSession();
    res.json({ status: "ok" });
  });

  app.get("/api/chat/session", (_req, res) => {
    res.json({ session_id: getSessionId() });
  });

  // ── Analysis (Claude CLI) ──
  app.post("/api/analyze", async (req, res) => {
    const { code, output, error, exercise, submissionId } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullText = "";

    await streamAnalysis(
      code || "",
      output || "",
      error || "",
      exercise || "free",
      (text) => {
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      },
      () => {
        if (submissionId && fullText) {
          saveAnalysis(submissionId, fullText.slice(0, 4000));
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      },
      (errorMsg) => {
        // Rule-based fallback
        const findings = ruleBasedAnalysis(code || "", error || "");
        const text = findings.length
          ? "⚠ Claude CLI 不可用，使用规则分析：\n\n" + findings.map(f => `- ${f}`).join("\n")
          : `⚠ ${errorMsg}`;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      },
    );
  });

  // ── Submissions ──
  app.post("/api/save", (req, res) => {
    const { exercise, code, output, passed, type } = req.body;
    const id = saveSubmission(exercise || "free", type || "run", code, output, !!passed);
    res.json({ status: "ok", id });
  });

  app.get("/api/latest/:exercise", (req, res) => {
    const result = getLatestCode(req.params.exercise);
    res.json(result || { code: null });
  });

  app.get("/api/submissions", (req, res) => {
    const { exercise, limit } = req.query;
    const rows = getSubmissions(exercise as string, parseInt(limit as string) || 50);
    res.json(rows);
  });

  app.get("/api/stats", (_req, res) => {
    res.json(getStats());
  });

  // ── Settings ──
  app.get("/api/settings", (_req, res) => {
    const pythonPath = getSetting("python_path") || "";
    const currentModule = getSetting("current_module") || "10-NLP";
    // Auto-detect Python installations
    const pythons: { path: string; version: string }[] = [];
    // 1. uv-managed Pythons
    try {
      const uvDir = path.join(os.homedir(), "AppData", "Roaming", "uv", "python");
      const dirs = fs.readdirSync(uvDir).filter(d => d.startsWith("cpython"));
      for (const dir of dirs) {
        const exe = path.join(uvDir, dir, "python.exe");
        if (fs.existsSync(exe)) {
          const ver = dir.match(/cpython-(\d+\.\d+)/)?.[1] || "";
          pythons.push({ path: exe, version: `Python ${ver} (uv)` });
        }
      }
    } catch {}
    // 2. Common system paths
    const systemPaths = ["python", "python3", "C:\\Python312\\python.exe", "C:\\Python313\\python.exe"];
    for (const p of systemPaths) {
      if (fs.existsSync(p) || p === "python" || p === "python3") {
        // check if not already in list
        if (!pythons.some(x => x.path === p)) {
          pythons.push({ path: p, version: `系统 ${p}` });
        }
      }
    }
    // 3. code_practice venv
    const cpVenv = path.join(__dirname, "..", "code_practice", ".venv", "Scripts", "python.exe");
    if (fs.existsSync(cpVenv)) {
      pythons.push({ path: cpVenv, version: "code_practice (.venv)" });
    }
    res.json({
      python_path: pythonPath,
      current_module: currentModule,
      has_api_key: !!getSetting("anthropic_api_key"),
      pythons,
    });
  });

  app.post("/api/settings", (req, res) => {
    const { python_path, current_module, anthropic_api_key, anthropic_base_url } = req.body;
    if (python_path !== undefined) setSetting("python_path", python_path);
    if (current_module !== undefined) setSetting("current_module", current_module);
    if (anthropic_api_key !== undefined) setSetting("anthropic_api_key", anthropic_api_key);
    if (anthropic_base_url !== undefined) setSetting("anthropic_base_url", anthropic_base_url);
    res.json({ status: "ok" });
  });

  // ── Vite Dev Middleware or Static ──
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  CodeMaster Server`);
    console.log(`  URL:    http://localhost:${PORT}`);
    console.log(`  Problems: ${getProblemList().length} loaded`);
    console.log(`${"=".repeat(50)}\n`);
  });
}

startServer().catch(console.error);
