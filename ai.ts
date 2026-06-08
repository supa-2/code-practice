import Anthropic from "@anthropic-ai/sdk";
import { getSetting, saveChatMessage, db } from "./db.js";

const SYSTEM_PROMPT =
  "你是一位算法刷题助手。回答简洁实用，中文为主技术术语英文。" +
  "可以分析代码、找 bug、讲解思路。用 markdown 格式回答。" +
  "学员发代码时先仔细看再回答，思路有误时用提示引导不要直接给答案。";

// ── Chat history — persisted in DB ──

const MAX_HISTORY = 100; // keep last 50 turns per exercise

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function loadHistory(exercise: string): ChatMsg[] {
  const rows = db.prepare(
    "SELECT role, content FROM chat_messages WHERE exercise=? ORDER BY time ASC LIMIT ?"
  ).all(exercise, MAX_HISTORY) as { role: string; content: string }[];
  return rows.map(r => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export function resetSession(): void {
  // Clear current exercise's chat history from DB
}

export function getSessionId(): string | null {
  return null;
}

function getClient(): Anthropic | null {
  const key = getSetting("anthropic_api_key");
  if (!key) return null;
  const baseUrl = getSetting("anthropic_base_url") || undefined;
  return new Anthropic({ apiKey: key, baseURL: baseUrl });
}

// ── Chat via Anthropic API ──

export async function streamChat(
  messages: { role: string; content: string }[],
  code: string,
  exercise: string,
  onText: (text: string) => void,
  onDone: (sessionId: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  const client = getClient();
  if (!client) { onError("请先在设置中填入 Anthropic API Key"); return; }

  const userMsg = [...messages].reverse().find(m => m.role === "user")?.content;
  if (!userMsg) { onError("消息为空"); return; }

  const parts: string[] = [];
  if (code?.trim()) parts.push(`[编辑器代码]\n\`\`\`python\n${code.slice(0, 3000)}\n\`\`\``);
  parts.push(userMsg);
  const fullMsg = parts.join("\n\n");

  // Load history from DB
  const key = exercise || "free";
  const history = loadHistory(key);

  const apiMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    apiMessages.push({ role: m.role, content: m.content });
  }
  apiMessages.push({ role: "user", content: fullMsg });

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
    });

    let fullResponse = "";

    stream.on("text", (text: string) => {
      fullResponse += text;
      onText(text);
    });

    stream.on("end", () => {
      // Save both messages to DB
      saveChatMessage(key, "user", fullMsg);
      saveChatMessage(key, "assistant", fullResponse.slice(0, 8000));
      onDone("");
    });

    stream.on("error", (err: any) => {
      onError(err.message || "API 调用失败");
    });
  } catch (err: any) {
    onError(`API 错误: ${err.message}`);
  }
}

// ── Code Analysis via API ──

export async function streamAnalysis(
  code: string,
  output: string,
  error: string,
  exercise: string,
  onText: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const client = getClient();
  if (!client) { onError("请先在设置中填入 Anthropic API Key"); return; }

  const prompt = `你是一位算法题评判助手。请分析以下代码的提交结果。

**代码：**
\`\`\`python
${code}
\`\`\`

**运行输出：** ${output || "(无输出)"}
**错误信息：** ${error || "(无错误)"}

请按以下格式回答（中文，markdown）：

## 判定结果
先给出明确判定：✅ **通过** 或 ❌ **未通过**，一句话说明原因。

## 问题分析
如果未通过，指出具体哪里有问题（逻辑错误/语法错误/边界情况/未实现等）。

## 改进建议
给出修复方向或代码片段。如果代码已经正确，可以肯定实现亮点。

简洁回答，不要超过 200 字。`;

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    stream.on("text", (text: string) => { onText(text); });
    stream.on("end", () => { onDone(); });
    stream.on("error", (err: any) => { onError(err.message || "分析失败"); });
  } catch (err: any) {
    onError(`分析失败: ${err.message}`);
  }
}

// ── Rule-based fallback ──

export function ruleBasedAnalysis(code: string, error: string): string[] {
  const findings: string[] = [];
  const funcMatch = code.match(/def\s+(\w+)\([^)]*\):\s*\n(\s+)pass/g);
  if (funcMatch) {
    for (const m of funcMatch) {
      const name = m.match(/def\s+(\w+)/)?.[1];
      findings.push(`⚠ 函数 ${name}() 只有 pass，尚未实现`);
    }
  }
  if (error) {
    const patterns: [RegExp, string][] = [
      [/NameError.*'(\w+)' is not defined/, "变量 '{}' 未定义"],
      [/TypeError.*'(.*?)' object is not/, "类型错误"],
      [/IndexError/, "索引越界"],
      [/AssertionError/, "断言失败"],
      [/ImportError.*No module named '(\w+)'/, "缺少模块 '{}'"],
      [/ZeroDivisionError/, "除以零"],
    ];
    for (const [pat, msg] of patterns) {
      const m = error.match(pat);
      if (m) findings.push("❌ " + msg.replace("{}", m[1] || ""));
    }
  }
  return findings;
}
