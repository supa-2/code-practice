import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Cloud, CheckCircle2, XCircle, TerminalSquare, Sparkles, Lightbulb, Loader2, ChevronRight, Eye } from 'lucide-react';
import type { ProblemFull, RunResult, TestResult } from '../types';
import { cn } from '../utils';

interface CodeEditorProps {
  problem: ProblemFull | null;
  onSelectionChange?: (code: string) => void;
  onNextProblem?: () => void;
}

interface CaseResult {
  name: string;
  output: string;
  error: string;
  passed: boolean;
  returncode: number;
}

export function CodeEditor({ problem, onSelectionChange, onNextProblem }: CodeEditorProps) {
  const isMobile = window.innerWidth < 768;
  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [caseResults, setCaseResults] = useState<CaseResult[] | null>(null);
  const [revealedCases, setRevealedCases] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [savedUserCode, setSavedUserCode] = useState("");
  const [activePaneTab, setActivePaneTab] = useState<"TESTCASE" | "RESULT">("TESTCASE");
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTCIdx, setActiveTCIdx] = useState(0);
  const [showTests, setShowTests] = useState(false);
  const editorRef = useRef<any>(null);
  const mobilePreRef = useRef<HTMLPreElement>(null);
  // Ref to always-forward latest handlers (avoids stale closure in Monaco keybindings)
  const handlersRef = useRef<{ run: () => void; submit: () => void }>({ run: () => {}, submit: () => {} });

  // Update code when problem changes
  useEffect(() => {
    if (!problem) {
      setCode("# 选择左侧题目开始练习\nprint('Hello, CodeMaster!')\n");
      return;
    }
    setAnswerVisible(false);
    setAnalysisText("");

    // Prefer localStorage (always most recent edits) over DB submissions
    const localSaved = localStorage.getItem(`cm_code_${problem.id}`);
    if (localSaved) {
      setCode(localSaved);
    } else {
      fetch(`/api/latest/${problem.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.code) {
            setCode(data.code);
          } else {
            setCode(problem.starterCode);
          }
        })
        .catch(() => setCode(problem.starterCode));
    }

    setResult(null);
    setTestResult(null);
    setCaseResults(null);
    setRevealedCases(0);
    setActivePaneTab("TESTCASE");
  }, [problem]);

  useEffect(() => { setActiveTCIdx(0); }, [problem?.id]);

  // Auto-save to localStorage
  useEffect(() => {
    if (!problem || answerVisible) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`cm_code_${problem.id}`, code);
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, problem, answerVisible]);

  // Animate case reveal — auto-switch detail panel to follow
  useEffect(() => {
    if (!caseResults) return;
    if (revealedCases > 0) setActiveTCIdx(Math.min(revealedCases - 1, caseResults.length - 1));
    if (revealedCases >= caseResults.length) return;
    const timer = setTimeout(() => setRevealedCases(r => r + 1), 800);
    return () => clearTimeout(timer);
  }, [caseResults, revealedCases]);

  const handleEditorDidMount = (editor: any, monacoRef: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection((e: any) => {
      const selectedText = editor.getModel().getValueInRange(e.selection);
      onSelectionChange?.(selectedText);
    });
    // Use addAction for reliable keybinding — delegates to handlersRef to avoid stale closures
    editor.addAction({
      id: "codemaster-run",
      label: "Run Code",
      keybindings: [monacoRef.KeyMod.CtrlCmd | monacoRef.KeyCode.Enter],
      run: () => handlersRef.current.run(),
    });
    editor.addAction({
      id: "codemaster-submit",
      label: "Submit Code",
      keybindings: [monacoRef.KeyMod.CtrlCmd | monacoRef.KeyMod.Shift | monacoRef.KeyCode.Enter],
      run: () => handlersRef.current.submit(),
    });
  };

  const handleRun = async () => {
    setIsRunning(true);
    setResult(null);
    setTestResult(null);
    setCaseResults(null);
    setRevealedCases(0);
    setAnalysisText("");
    // Stay on TESTCASE tab — show animated case results there
    if (activePaneTab !== "TESTCASE") setActivePaneTab("TESTCASE");
    // Save code to DB on every Run (not just Submit) so edits never get lost
    if (problem?.id) {
      fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise: problem.id, type: "run", code, output: "", passed: false }),
      }).catch(() => {});
    }
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, problemId: problem?.id }),
      });
      const data = await response.json();
      if (data.cases) {
        setCaseResults(data.cases);
      } else {
        // No structured cases — show raw result inline on TESTCASE tab
        setResult(data as RunResult);
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
    setCaseResults(null);
    setRevealedCases(0);
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
      // Always trigger AI analysis
      setTimeout(() => triggerAnalysis(data), 500);
    } catch (err: any) {
      setTestResult({ passed: false, output: "", error: err.message, elapsed_ms: 0 });
    } finally {
      setIsTesting(false);
    }
  };

  // Keep handlersRef in sync so Monaco keybindings always call the latest closures
  handlersRef.current.run = handleRun;
  handlersRef.current.submit = handleSubmit;

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

  // Bottom panel resizable height
  const [bottomH, setBottomH] = useState(isMobile ? 180 : 280);
  const [mobileBottomOpen, setMobileBottomOpen] = useState(false);
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
        {isMobile ? (
          <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: "#1e1e1e" }}>
            {/* Highlighted code layer — moved via transform on scroll */}
            <pre
              ref={mobilePreRef}
              className="absolute top-0 left-0 right-0 pointer-events-none"
              style={{ fontFamily: "'Consolas','Courier New',monospace", fontSize: "14px", lineHeight: "1.6", padding: "16px", margin: 0, tabSize: 4, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#d4d4d4", overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: highlightPython(code) + "\n" }}
            />
            {/* Transparent textarea on top — scrollable */}
            <textarea
              value={code}
              onChange={e => { if (!answerVisible) setCode(e.target.value); }}
              onScroll={e => {
                if (mobilePreRef.current) {
                  const t = e.currentTarget;
                  mobilePreRef.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={{
                position: "absolute", inset: 0,
                fontFamily: "'Consolas','Courier New',monospace",
                fontSize: "14px", lineHeight: "1.6", padding: "16px",
                tabSize: 4, WebkitAppearance: "none",
                color: "transparent", caretColor: "#fff",
                backgroundColor: "transparent",
                WebkitTextFillColor: "transparent",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
                resize: "none", border: "none", outline: "none",
                overflow: "auto", WebkitOverflowScrolling: "touch",
              }}
              className="w-full h-full"
              placeholder="在这里写代码..."
            />
          </div>
        ) : (
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
        )}
      </div>

      {/* Bottom panel resize zone (desktop only) */}
      {!isMobile && <div onMouseDown={handleBottomDrag} className="h-2 cursor-row-resize shrink-0 hover:bg-amber-500/10 transition-colors" />}

      {/* Mobile: floating Run/Submit buttons */}
      {isMobile && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#282828] border-t border-[#333] shrink-0">
          <button onClick={handleRun} disabled={isRunning || !code.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold bg-[#262626] text-green-500 disabled:opacity-50">
            <Play className="w-3.5 h-3.5 fill-current" /> Run
          </button>
          <button onClick={handleSubmit} disabled={isTesting || !problem}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold bg-green-600/20 text-green-500 disabled:opacity-50">
            <Cloud className="w-3.5 h-3.5" /> Submit
          </button>
          {(caseResults || testResult || result) && (
            <button onClick={() => setMobileBottomOpen(!mobileBottomOpen)}
              className="flex items-center gap-1 px-2 py-2 rounded-md text-xs font-semibold bg-[#262626] text-amber-500">
              {mobileBottomOpen ? "收起" : "结果"}
            </button>
          )}
        </div>
      )}

      {/* Bottom panel: desktop always visible, mobile only when expanded */}
      {(!isMobile || mobileBottomOpen) && (
        <div style={{ height: isMobile ? 200 : bottomH }} className={cn("border-t border-[#333] bg-[#1e1e1e] flex flex-col flex-shrink-0", isMobile && "fixed bottom-14 left-0 right-0 z-40 rounded-t-lg shadow-lg border-x")}>
        {/* Toolbar */}
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
            <Play className="w-3.5 h-3.5 fill-current" /> Run
          </button>
          <button onClick={handleSubmit} disabled={isTesting || !problem} className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-green-600/20 hover:bg-green-600/30 text-green-500 transition-colors disabled:opacity-50">
            <Cloud className="w-3.5 h-3.5" /> Submit
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-[#1e1e1e]">
          {activePaneTab === "TESTCASE" && (
            <div className="p-4">
              {!hasStructuredTC ? (
                <div className="text-sm text-[#555] text-center py-8">暂无测试用例</div>
              ) : (
                <div className="space-y-3">
                  {/* Case tabs with status icons */}
                  <div className="flex gap-1">
                    {problem!.testcases.map((tc, i) => {
                      const cr = caseResults?.[i];
                      const isVisible = cr && i < revealedCases;
                      return (
                        <button key={i} onClick={() => setActiveTCIdx(i)} className={cn(
                          "px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5",
                          activeTCIdx === i ? "bg-[#333] text-white border border-[#555]" : "text-[#888] hover:text-[#bbb] hover:bg-[#282828] border border-transparent"
                        )}>
                          {isRunning && !caseResults && <Loader2 className="w-3 h-3 animate-spin text-green-500" />}
                          {isVisible && cr.passed && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                          {isVisible && !cr.passed && <XCircle className="w-3 h-3 text-red-400" />}
                          {(!cr || i >= revealedCases) && !isRunning && <span className="w-3" />}
                          Case {i + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Running animation */}
                  {isRunning && !caseResults && (
                    <div className="flex items-center gap-2 py-3 text-[#888]">
                      <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                      <span className="text-xs">Running test cases...</span>
                    </div>
                  )}

                  {/* Case detail with animated result */}
                  {problem!.testcases[activeTCIdx] && (() => {
                    const cr = caseResults?.[activeTCIdx];
                    const isVisible = cr && activeTCIdx < revealedCases;
                    return (
                      <div className={cn(
                        "space-y-2 bg-[#111] rounded-md p-3 border transition-all",
                        isVisible && cr
                          ? cr.passed ? "border-green-900/40" : "border-red-900/40"
                          : "border-[#333]"
                      )}>
                        <div className="text-[10px] text-amber-500/80 font-semibold mb-2">
                          {problem!.testcases[activeTCIdx].name}
                          {isVisible && cr && (
                            <span className={cn("ml-2", cr.passed ? "text-green-500" : "text-red-400")}>
                              {cr.passed ? "Passed" : "Failed"}
                            </span>
                          )}
                        </div>
                        {problem!.testcases[activeTCIdx].inputs.map((inp, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="text-[10px] text-[#888] font-mono min-w-[70px] pt-1">{inp.key}:</span>
                            <div className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm font-mono text-[#ccc]">{inp.value}</div>
                          </div>
                        ))}
                        {problem!.testcases[activeTCIdx].expected && (
                          <div className="flex items-start gap-2 mt-2 pt-2 border-t border-[#333]">
                            <span className="text-[10px] text-green-500 font-mono min-w-[70px] pt-1">Expected:</span>
                            <div className="flex-1 bg-green-900/10 border border-green-900/30 rounded px-2 py-1 text-sm font-mono text-green-400">{problem!.testcases[activeTCIdx].expected}</div>
                          </div>
                        )}
                        {isVisible && cr && (() => {
                          // Show output if present, otherwise show error (concise)
                          const displayText = cr.output
                            || (cr.error ? cr.error.split("\n").filter(l => l.trim()).slice(-2).join("\n")
                            : "(no output)");
                          return (
                          <div className="flex items-start gap-2 mt-2 pt-2 border-t border-[#333]">
                            <span className="text-[10px] text-[#888] font-mono min-w-[70px] pt-1">{cr.output ? "Output:" : "Error:"}</span>
                            <div className={cn(
                              "flex-1 rounded px-2 py-1 text-sm font-mono",
                              cr.passed ? "bg-green-900/10 border border-green-900/30 text-green-400" : "bg-red-900/10 border border-red-900/30 text-red-400"
                            )}>{displayText}</div>
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Raw run result fallback on TESTCASE tab (for problems without structured testcases) */}
              {result && !caseResults && !isRunning && (
                <div className="mt-4 p-3 bg-[#111] border border-[#333] rounded-md">
                  {typeof result.elapsed_ms === "number" && (
                    <div className="text-[10px] text-[#888] mb-2">
                      {(result.elapsed_ms / 1000).toFixed(3)}s · return: {result.returncode ?? "?"}
                    </div>
                  )}
                  {result.stdout && <pre className="text-[#ccc] whitespace-pre-wrap text-xs font-mono">{result.stdout}</pre>}
                  {result.stderr && <pre className="text-red-400 whitespace-pre-wrap text-xs font-mono">{result.stderr.split("\n").slice(-8).join("\n")}</pre>}
                  {!result.stdout && !result.stderr && <span className="text-[#555] text-xs">(no output)</span>}
                </div>
              )}

              {/* Show test code (read-only) */}
              {problem?.tests && (
                <div className="mt-4">
                  <button onClick={() => setShowTests(!showTests)}
                    className="flex items-center gap-1.5 text-[10px] text-[#666] hover:text-[#aaa] transition-colors">
                    <Eye className="w-3 h-3" />
                    {showTests ? "隐藏测试代码" : "查看测试代码"}
                  </button>
                  {showTests && (
                    <pre className="mt-2 bg-[#111] border border-[#262626] rounded-md p-3 text-[10px] font-mono text-[#888] whitespace-pre-wrap overflow-auto max-h-40 select-text">
                      {problem.tests}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {activePaneTab === "RESULT" && (
            <div className="p-4 font-mono text-sm text-[#e0e0e0]">
              {/* Empty state */}
              {(!testResult && !isTesting && !analysisText) && (
                <div className="text-[#555] italic text-center py-8">Ctrl+Enter 运行 · Ctrl+Shift+Enter 提交测试</div>
              )}

              {/* Testing spinner */}
              {isTesting && (
                <div className="space-y-4 py-4">
                  <div className="text-[#888] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-green-500" /> 测试中...
                  </div>
                  {hasStructuredTC && problem!.testcases.map((tc, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-[#262626]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-green-500 shrink-0" />
                      <span className="text-xs text-[#888]">Case {i + 1}: {tc.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-case results (LeetCode style) */}
              {caseResults && testResult && !isTesting && (
                <div className="space-y-3">
                  {/* Overall status */}
                  <div className={cn("flex items-center gap-2 py-2 font-bold text-lg", testResult.passed ? "text-green-500" : "text-red-400")}>
                    {testResult.passed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    {testResult.passed ? "Accepted" : "Wrong Answer"}
                  </div>

                  {/* Per-case cards */}
                  {caseResults.map((cr, i) => {
                    const isVisible = i < revealedCases;
                    const tc = hasStructuredTC ? problem!.testcases[i] : null;
                    return (
                      <div key={i} className={cn(
                        "bg-[#111] border rounded-lg overflow-hidden transition-all duration-300",
                        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 h-0",
                        cr.passed ? "border-green-900/40" : "border-red-900/40"
                      )}>
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#262626]">
                          {cr.passed
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          }
                          <span className="text-xs font-medium">Case {i + 1}</span>
                          {tc && <span className="text-[10px] text-[#666] ml-1">{tc.name}</span>}
                        </div>
                        {isVisible && (
                          <div className="p-3 space-y-2 text-xs">
                            {tc?.inputs.map((inp, j) => (
                              <div key={j} className="flex gap-2">
                                <span className="text-[#888] min-w-[70px]">{inp.key}:</span>
                                <span className="text-[#ccc] font-mono">{inp.value}</span>
                              </div>
                            ))}
                            <div className="flex gap-2 pt-1 border-t border-[#262626]">
                              <span className="text-[#888] min-w-[70px]">Output:</span>
                              <span className={cn("font-mono", cr.passed ? "text-green-400" : "text-[#ccc]")}>{cr.output || "(empty)"}</span>
                            </div>
                            {tc?.expected && (
                              <div className="flex gap-2">
                                <span className="text-[#888] min-w-[70px]">Expected:</span>
                                <span className="text-green-400 font-mono">{tc.expected}</span>
                              </div>
                            )}
                            {cr.error && (
                              <div className="flex gap-2">
                                <span className="text-[#888] min-w-[70px]">Error:</span>
                                <pre className="text-red-400 font-mono whitespace-pre-wrap flex-1">{cr.error.split("\n").slice(-3).join("\n")}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fallback: no case results, show raw output */}
              {testResult && !caseResults && !isTesting && (
                <div className="space-y-3">
                  <div className={cn("flex items-center gap-2 font-bold", testResult.passed ? "text-green-500" : "text-red-400")}>
                    {testResult.passed ? "Accepted" : "Wrong Answer"}
                  </div>
                  {testResult.output && <pre className="text-[#ccc] whitespace-pre-wrap bg-[#111] p-3 rounded-md border border-[#333]">{testResult.output}</pre>}
                  {testResult.error && <pre className="text-red-400 whitespace-pre-wrap bg-[#111] p-3 rounded-md border border-red-900/50">{testResult.error.split("\n").slice(-8).join("\n")}</pre>}
                </div>
              )}

              {/* AI Analysis */}
              {isAnalyzing && !analysisText && <div className="mt-3 text-[#888] flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />AI 分析中...</div>}
              {analysisText && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-amber-500 font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI 分析</div>
                  <pre className="text-[#ccc] whitespace-pre-wrap text-xs leading-relaxed">{analysisText}</pre>
                </div>
              )}

              {/* Next problem button after submit */}
              {testResult && !isTesting && !isAnalyzing && (
                <button onClick={() => onNextProblem?.()} className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-500 text-sm font-semibold transition-colors">
                  下一题 <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile Python syntax highlighter ──

function highlightPython(code: string): string {
  // Escape HTML first
  let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  type Span = { start: number; end: number; color: string };
  const spans: Span[] = [];

  const COL = { kw: "#c586c0", str: "#ce9178", cmt: "#6a9955", bi: "#dcdcaa", num: "#b5cea8", dec: "#dcdcaa" };

  // Single-line strings
  for (const q of ['"', "'"]) {
    const re = new RegExp(q + `[^${q}\\n]*` + q, "g");
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!spans.some(sp => m!.index >= sp.start && m!.index < sp.end))
        spans.push({ start: m.index, end: m.index + m[0].length, color: COL.str });
    }
  }
  // Comments
  const commentRe = /#[^\n]*/g;
  let cm;
  while ((cm = commentRe.exec(html)) !== null) {
    if (!spans.some(sp => cm!.index >= sp.start && cm!.index < sp.end))
      spans.push({ start: cm.index, end: cm.index + cm[0].length, color: COL.cmt });
  }
  // Keywords
  const kwRe = /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|is|True|False|None|pass|break|continue|yield|lambda|raise|global|nonlocal|assert|del)\b/g;
  let kw;
  while ((kw = kwRe.exec(html)) !== null) {
    if (!spans.some(sp => kw!.index >= sp.start && kw!.index < sp.end))
      spans.push({ start: kw.index, end: kw.index + kw[0].length, color: COL.kw });
  }
  // Built-in functions
  const biRe = /\b(print|len|range|int|float|str|list|dict|tuple|set|type|isinstance|enumerate|zip|map|filter|sorted|abs|max|min|sum|any|all|open|super|input|round|hex|bin|oct|chr|ord|format)\b/g;
  let bi;
  while ((bi = biRe.exec(html)) !== null) {
    if (!spans.some(sp => bi!.index >= sp.start && bi!.index < sp.end))
      spans.push({ start: bi.index, end: bi.index + bi[0].length, color: COL.bi });
  }
  // Decorators
  const decRe = /@\w+/g;
  let dc;
  while ((dc = decRe.exec(html)) !== null) {
    if (!spans.some(sp => dc!.index >= sp.start && dc!.index < sp.end))
      spans.push({ start: dc.index, end: dc.index + dc[0].length, color: COL.dec });
  }
  // Numbers
  const numRe = /\b\d+\.?\d*\b/g;
  let nm;
  while ((nm = numRe.exec(html)) !== null) {
    if (!spans.some(sp => nm!.index >= sp.start && nm!.index < sp.end))
      spans.push({ start: nm.index, end: nm.index + nm[0].length, color: COL.num });
  }

  spans.sort((a, b) => a.start - b.start);
  const clean: Span[] = [];
  for (const sp of spans) {
    if (!clean.length || sp.start >= clean[clean.length - 1].end) clean.push(sp);
  }

  const result: string[] = [];
  let pos = 0;
  for (const sp of clean) {
    if (sp.start > pos) result.push(html.slice(pos, sp.start));
    result.push(`<span style="color:${sp.color}">${html.slice(sp.start, sp.end)}</span>`);
    pos = sp.end;
  }
  result.push(html.slice(pos));
  return result.join("");
}
