import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Cloud, CheckCircle2, TerminalSquare, Sparkles, Lightbulb } from 'lucide-react';
import type { ProblemFull, RunResult, TestResult } from '../types';
import { cn } from '../utils';

interface CodeEditorProps {
  problem: ProblemFull | null;
  onSelectionChange?: (code: string) => void;
}

export function CodeEditor({ problem, onSelectionChange }: CodeEditorProps) {
  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [savedUserCode, setSavedUserCode] = useState("");
  const [activePaneTab, setActivePaneTab] = useState<"TESTCASE" | "RESULT">("TESTCASE");
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const editorRef = useRef<any>(null);

  // Update code when problem changes
  useEffect(() => {
    if (!problem) {
      setCode("# 选择左侧题目开始练习\nprint('Hello, CodeMaster!')\n");
      return;
    }
    setAnswerVisible(false);
    setAnalysisText("");

    // Try restore from DB, then localStorage, then starter
    fetch(`/api/latest/${problem.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.code) {
          setCode(data.code);
        } else {
          const saved = localStorage.getItem(`cm_code_${problem.id}`);
          setCode(saved || problem.starterCode);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem(`cm_code_${problem.id}`);
        setCode(saved || problem.starterCode);
      });

    setResult(null);
    setTestResult(null);
    setActivePaneTab("TESTCASE");
  }, [problem]);

  // Auto-save to localStorage
  useEffect(() => {
    if (!problem || answerVisible) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`cm_code_${problem.id}`, code);
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, problem, answerVisible]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection((e: any) => {
      const selectedText = editor.getModel().getValueInRange(e.selection);
      onSelectionChange?.(selectedText);
    });

    // Ctrl+Enter = Run
    editor.addCommand(
      (window as any).monaco?.KeyMod?.CtrlCmd | (window as any).monaco?.KeyCode?.Enter || 2048 | 3,
      () => handleRun()
    );
    // Ctrl+Shift+Enter = Submit
    editor.addCommand(
      (window as any).monaco?.KeyMod?.CtrlCmd | (window as any).monaco?.KeyMod?.Shift | (window as any).monaco?.KeyCode?.Enter || 2048 | 1024 | 3,
      () => handleSubmit()
    );
  };

  const handleRun = async () => {
    setIsRunning(true);
    setResult(null);
    setTestResult(null);
    setAnalysisText("");
    setActivePaneTab("RESULT");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: RunResult = await response.json();
      setResult(data);
      if (problem) {
        fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exercise: problem.id, code, output: data.stdout || data.stderr, passed: data.returncode === 0, type: "run" }),
        }).catch(() => {});
      }
    } catch (err: any) {
      setResult({ stdout: "", stderr: err.message, returncode: -1, elapsed_ms: 0 });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem) return;
    setIsTesting(true);
    setResult(null);
    setTestResult(null);
    setAnalysisText("");
    setActivePaneTab("RESULT");
    try {
      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, code }),
      });
      const data: TestResult = await response.json();
      setTestResult(data);
      if (!data.passed) setTimeout(() => triggerAnalysis(data), 500);
    } catch (err: any) {
      setTestResult({ passed: false, output: "", error: err.message, elapsed_ms: 0 });
    } finally {
      setIsTesting(false);
    }
  };

  const triggerAnalysis = async (testRes?: TestResult) => {
    if (!problem) return;
    setIsAnalyzing(true);
    setAnalysisText("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, output: testRes?.output || result?.stdout || "",
          error: testRes?.error || result?.stderr || "", exercise: problem.id,
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) { full += data.text; setAnalysisText(full); }
          } catch {}
        }
      }
    } catch {} finally { setIsAnalyzing(false); }
  };

  const showAnswer = async () => {
    if (!problem) return;
    if (!answerVisible) {
      setSavedUserCode(code);
      try {
        const res = await fetch(`/api/problems/${problem.id}/answer`);
        const data = await res.json();
        setCode(data.answer || "# 暂无参考答案");
      } catch {}
      setAnswerVisible(true);
    } else {
      setCode(savedUserCode);
      setAnswerVisible(false);
    }
  };

  const hasStructuredTC = problem?.testcases && problem.testcases.length > 0;
  const [activeTCIdx, setActiveTCIdx] = useState(0);
  useEffect(() => { setActiveTCIdx(0); }, [problem?.id]);

  // Bottom panel resizable height
  const [bottomH, setBottomH] = useState(280);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleBottomDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomH;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setBottomH(Math.max(120, Math.min(600, startH + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e]">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-[#888]">Python 3</span>
          {answerVisible && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">查看答案中</span>}
        </div>
        <div className="flex items-center space-x-2">
          {problem && (
            <button onClick={showAnswer} className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              answerVisible ? "text-amber-500 bg-amber-500/10" : "text-[#888] hover:text-amber-500 hover:bg-amber-500/10"
            )}>
              <Lightbulb className="w-3.5 h-3.5" />
              {answerVisible ? "返回我的代码" : "查看答案"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          value={code}
          onChange={(val) => { if (!answerVisible) setCode(val || ""); }}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false }, fontSize: 14, lineHeight: 24,
            padding: { top: 16 }, scrollBeyondLastLine: false, smoothScrolling: true,
          }}
        />
      </div>

      {/* Bottom panel resize zone — transparent 8px strip */}
      <div
        onMouseDown={handleBottomDrag}
        className="h-2 cursor-row-resize shrink-0 hover:bg-amber-500/10 transition-colors"
      />

      <div style={{ height: bottomH }} className="border-t border-[#333] bg-[#1e1e1e] flex flex-col flex-shrink-0">
        <div className="flex px-4 py-2 bg-[#282828] border-b border-[#333] items-center space-x-6">
          <button onClick={() => setActivePaneTab("TESTCASE")} className={cn(
            "text-xs font-semibold py-1 transition-colors flex items-center gap-1.5",
            activePaneTab === "TESTCASE" ? "text-white" : "text-[#888] hover:text-[#bbb]"
          )}>
            <CheckCircle2 className={cn("w-3.5 h-3.5", activePaneTab === "TESTCASE" ? "text-green-500" : "text-[#888]")} />
            Testcase
          </button>
          <button onClick={() => setActivePaneTab("RESULT")} className={cn(
            "text-xs font-semibold py-1 transition-colors flex items-center gap-1.5",
            activePaneTab === "RESULT" ? "text-white" : "text-[#888] hover:text-[#bbb]"
          )}>
            <TerminalSquare className={cn("w-3.5 h-3.5", activePaneTab === "RESULT" ? "text-green-500" : "text-[#888]")} />
            Result
            {(isRunning || isTesting) && <span className="w-2 h-2 ml-1 rounded-full border border-t-green-500 animate-spin" />}
          </button>
          <div className="flex-1" />
          <button onClick={handleRun} disabled={isRunning || !code.trim()} className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#262626] hover:bg-[#333] text-green-500 transition-colors disabled:opacity-50">
            <Play className="w-3.5 h-3.5 fill-current" /> 运行
          </button>
          <button onClick={handleSubmit} disabled={isTesting || !problem} className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-green-600/20 hover:bg-green-600/30 text-green-500 transition-colors disabled:opacity-50">
            <Cloud className="w-3.5 h-3.5" /> 提交测试
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[#1e1e1e]">
          {activePaneTab === "TESTCASE" && (
            <div className="p-4">
              {!hasStructuredTC ? (
                <div className="text-sm text-[#555] text-center py-8">暂无测试用例</div>
              ) : (
                <div className="space-y-3">
                  {/* Tab buttons */}
                  <div className="flex gap-1">
                    {problem.testcases.map((tc, i) => (
                      <button key={i} onClick={() => setActiveTCIdx(i)} className={cn(
                        "px-3 py-1 rounded text-xs font-medium transition-colors",
                        activeTCIdx === i
                          ? "bg-[#333] text-white border border-[#555]"
                          : "text-[#888] hover:text-[#bbb] hover:bg-[#282828]"
                      )}>
                        Case {i + 1}
                      </button>
                    ))}
                  </div>
                  {/* Active test case detail */}
                  {problem.testcases[activeTCIdx] && (
                    <div className="space-y-2 bg-[#111] rounded-md p-3 border border-[#333]">
                      <div className="text-[10px] text-amber-500/80 font-semibold mb-2">
                        {problem.testcases[activeTCIdx].name}
                      </div>
                      {problem.testcases[activeTCIdx].inputs.map((inp, j) => (
                        <div key={j} className="flex items-start gap-2">
                          <span className="text-[10px] text-[#888] font-mono min-w-[60px] pt-1">{inp.key}:</span>
                          <div className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm font-mono text-[#ccc]">
                            {inp.value}
                          </div>
                        </div>
                      ))}
                      {problem.testcases[activeTCIdx].expected && (
                        <div className="flex items-start gap-2 mt-2 pt-2 border-t border-[#333]">
                          <span className="text-[10px] text-green-500 font-mono min-w-[60px] pt-1">Expected:</span>
                          <div className="flex-1 bg-green-900/10 border border-green-900/30 rounded px-2 py-1 text-sm font-mono text-green-400">
                            {problem.testcases[activeTCIdx].expected}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activePaneTab === "RESULT" && (
            <div className="p-4 font-mono text-sm text-[#e0e0e0]">
              {(!result && !testResult && !isRunning && !isTesting && !analysisText) && (
                <div className="text-[#555] italic">Ctrl+Enter 运行 · Ctrl+Shift+Enter 提交测试</div>
              )}
              {isRunning && <div className="text-[#888] flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-[#555] border-t-green-500 animate-spin" />运行中...</div>}
              {isTesting && <div className="text-[#888] flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-[#555] border-t-green-500 animate-spin" />测试中...</div>}
              {result && !testResult && (
                <div className="space-y-2">
                  <div className="text-xs text-[#888]">{(result.elapsed_ms / 1000).toFixed(3)}s · 返回码: {result.returncode}</div>
                  {result.stdout && <pre className="text-[#ccc] whitespace-pre-wrap">{result.stdout}</pre>}
                  {result.stderr && <pre className="text-red-400 whitespace-pre-wrap">{result.stderr.split("\n").slice(-8).join("\n")}</pre>}
                  {!result.stdout && !result.stderr && <span className="text-[#555]">(无输出)</span>}
                </div>
              )}
              {testResult && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 font-bold">
                    <span className={testResult.passed ? "text-green-500" : "text-red-400"}>
                      {testResult.passed ? "✔ Accepted" : "✘ Wrong Answer"}
                    </span>
                    <span className="text-xs text-[#888] font-normal">{(testResult.elapsed_ms / 1000).toFixed(3)}s</span>
                  </div>
                  {testResult.output && <pre className="text-[#ccc] whitespace-pre-wrap bg-[#111] p-3 rounded-md border border-[#333]">{testResult.output}</pre>}
                  {testResult.error && <pre className="text-red-400 whitespace-pre-wrap bg-[#111] p-3 rounded-md border border-red-900/50">{testResult.error.split("\n").slice(-8).join("\n")}</pre>}
                </div>
              )}
              {isAnalyzing && !analysisText && <div className="mt-3 text-[#888] flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />AI 分析中...</div>}
              {analysisText && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-amber-500 font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI 分析</div>
                  <pre className="text-[#ccc] whitespace-pre-wrap text-xs leading-relaxed">{analysisText}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
