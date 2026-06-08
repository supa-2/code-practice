import React, { useState, useEffect, useCallback } from "react";
import { LeftPane } from "./components/ProblemView";
import { CodeEditor } from "./components/CodeEditor";
import { AIPane } from "./components/AIPane";
import { ProblemSelector } from "./components/ProblemSelector";
import { cn } from "./utils";
import type { ProblemMeta, ProblemFull, AppSettings } from "./types";
import { Sparkles, Play, Pause, Code2, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function App() {
  const [problems, setProblems] = useState<ProblemMeta[]>([]);
  const [activeProblemId, setActiveProblemId] = useState<string>("");
  const [activeProblem, setActiveProblem] = useState<ProblemFull | null>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [selectedCode, setSelectedCode] = useState("");
  const [serverOk, setServerOk] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pythonInput, setPythonInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [leftWidth, setLeftWidth] = useState(400);
  const [aiWidth, setAiWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const isDragging = React.useRef<"left" | "ai" | null>(null);
  const dragStartX = React.useRef(0);
  const dragStartW = React.useRef(0);

  useEffect(() => {
    fetch("/api/problems")
      .then(r => r.json())
      .then(data => {
        const list: ProblemMeta[] = data.problems || [];
        setProblems(list);
        if (list.length > 0) setActiveProblemId(list[0].id);
      })
      .catch(() => {});

    fetch("/api/ping")
      .then(r => r.json())
      .then(() => setServerOk(true))
      .catch(() => setServerOk(false));

    fetch("/api/settings")
      .then(r => r.json())
      .then((s: any) => {
        setSettings(s);
        setPythonInput(s.python_path || "");
        setApiKeyInput(s.has_api_key ? "••••••••" : "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeProblemId) return;
    fetch(`/api/problems/${activeProblemId}`)
      .then(r => r.json())
      .then(setActiveProblem)
      .catch(() => {});
  }, [activeProblemId]);

  useEffect(() => { setTimeElapsed(0); setSelectedCode(""); setIsTimerRunning(true); }, [activeProblemId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isTimerRunning) timer = setInterval(() => setTimeElapsed(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, [activeProblemId, isTimerRunning]);

  useEffect(() => { if (timeElapsed === 1800 && !isAIOpen) setIsAIOpen(true); }, [timeElapsed, isAIOpen]);

  const formatTime = (sec: number) => {
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const h = Math.floor(sec / 3600);
    return h > 0
      ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const savePythonPath = useCallback((v: string) => {
    setPythonInput(v);
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ python_path: v }) });
  }, []);

  const saveApiKey = useCallback((v: string) => {
    if (v === "••••••••") return;
    setApiKeyInput(v);
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anthropic_api_key: v }) })
      .then(() => { if (settings) setSettings({ ...settings, has_api_key: !!v }); });
  }, [settings]);

  // Invisible edge drag for panel resize
  const startDrag = (type: "left" | "ai", e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isDragging.current = type;
    dragStartX.current = e.clientX;
    dragStartW.current = type === "left" ? leftWidth : aiWidth;
    const onMove = (ev: MouseEvent) => {
      if (isDragging.current === "left") {
        setLeftWidth(Math.max(260, Math.min(700, dragStartW.current + ev.clientX - dragStartX.current)));
      } else {
        setAiWidth(Math.max(280, Math.min(560, dragStartW.current + dragStartX.current - ev.clientX)));
      }
    };
    const onUp = () => {
      isDragging.current = null;
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Top Nav */}
      <nav className="flex items-center px-6 justify-between h-14 bg-[#161616] border-b border-[#262626] shrink-0">
        <div className="flex items-center space-x-4 w-1/3">
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-md flex items-center justify-center text-black shadow-sm">
              <Code2 className="w-4 h-4 ml-0.5" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">Code<span className="text-amber-500">Master</span></span>
          </div>
          <button onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={cn("p-1.5 rounded transition-colors", isLeftOpen ? "text-amber-500" : "text-[#888] hover:text-amber-500")}
            title={isLeftOpen ? "收起侧栏" : "展开侧栏"}>
            {isLeftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <ProblemSelector problems={problems} activeProblemId={activeProblemId} onSelectProblem={setActiveProblemId} />
        </div>

        <div className="flex items-center justify-center space-x-1.5 bg-[#262626] p-1 rounded-lg border border-[#363636]">
          <button onClick={() => setShowSettings(!showSettings)}
            className={cn("p-1.5 rounded transition-colors", showSettings ? "bg-[#363636] text-amber-500" : "text-[#888] hover:bg-[#363636] hover:text-amber-500")}
            title="Settings"><Settings className="w-4 h-4" /></button>
          <div className="w-[1px] h-4 bg-[#444] mx-1" />
          <button onClick={() => setIsAIOpen(!isAIOpen)}
            className={cn("p-1.5 rounded transition-colors", isAIOpen ? "bg-[#363636] text-amber-500" : "text-[#888] hover:bg-[#363636] hover:text-amber-500")}
            title="AI Assistant"><Sparkles className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center justify-end space-x-4 w-1/3">
          <div className={cn("flex items-center space-x-1.5 px-3 py-1 rounded-full border transition-colors",
            timeElapsed > 1800 ? "bg-red-950/30 border-red-900/50 text-red-400" : "bg-[#262626] border-[#363636] text-[#888]")}>
            <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="hover:text-[#e0e0e0] focus:outline-none">
              {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="text-xs font-mono">{formatTime(timeElapsed)}</span>
          </div>
          <div className={cn("flex items-center space-x-2 px-3 py-1.5 rounded-full border",
            serverOk ? "bg-[#262626] border-[#363636]" : "bg-red-950/30 border-red-900/50")}>
            <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px]",
              serverOk ? "bg-green-400 shadow-green-400/50" : "bg-red-400 shadow-red-400/50")} />
            <span className={cn("text-[10px] font-medium whitespace-nowrap", serverOk ? "text-green-400" : "text-red-400")}>
              {serverOk ? "系统就绪" : "服务器断开"}
            </span>
            {settings?.has_api_key && <span className="text-[9px] text-green-600">API</span>}
          </div>
        </div>
      </nav>

      {/* Settings */}
      {showSettings && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-[#363636] rounded-lg shadow-2xl p-4 w-[420px]">
          <h3 className="text-sm font-semibold mb-3 text-[#ccc]">设置</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#888] mb-1 block">Python 解释器</label>
              <select value={pythonInput} onChange={e => savePythonPath(e.target.value)}
                className="w-full bg-[#222] border border-[#363636] rounded-md px-3 py-2 text-sm text-[#e0e0e0] focus:outline-none focus:border-amber-500/50">
                <option value="">自动检测</option>
                {settings && (settings as any).pythons?.map((p: any) => (
                  <option key={p.path} value={p.path}>{p.version} — {p.path}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#888] mb-1 block">Anthropic API Key</label>
              <input type="password" value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onBlur={() => saveApiKey(apiKeyInput)}
                onKeyDown={e => { if (e.key === "Enter") saveApiKey(apiKeyInput); }}
                placeholder="sk-ant-..."
                className="w-full bg-[#222] border border-[#363636] rounded-md px-3 py-2 text-sm text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-amber-500/50" />
              <p className="text-[10px] text-[#555] mt-1">用于 AI 对话和代码分析，密钥保存在本地数据库</p>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — smooth collapse */}
        <div
          className={cn("overflow-hidden shrink-0", !isResizing && "transition-[width] duration-300 ease-in-out")}
          style={{ width: isLeftOpen ? leftWidth : 0 }}
        >
          <div className="h-full border-r border-[#262626] bg-[#0f0f0f]" style={{ minWidth: 260 }}>
            <LeftPane problem={activeProblem} />
          </div>
        </div>

        {/* Left edge resize zone — transparent 8px strip */}
        {isLeftOpen && (
          <div
            onMouseDown={(e) => startDrag("left", e)}
            className="w-2 cursor-col-resize shrink-0 hover:bg-amber-500/10 transition-colors"
          />
        )}

        {/* Center: code editor */}
        <div className="flex-1 flex flex-col bg-[#0d0d0d] min-w-[300px]">
          <CodeEditor problem={activeProblem} onSelectionChange={setSelectedCode} />
        </div>

        {/* Right: AI panel */}
        {isAIOpen && (
          <>
            <div
              onMouseDown={(e) => startDrag("ai", e)}
              className="w-2 cursor-col-resize shrink-0 hover:bg-amber-500/10 transition-colors"
            />
            <div
              className={cn("overflow-hidden shrink-0", !isResizing && "transition-[width] duration-300 ease-in-out")}
              style={{ width: aiWidth }}
            >
              <div className="h-full border-l border-[#2b2b2b] bg-[#181818]" style={{ minWidth: 280 }}>
                <AIPane
                  isOpen={isAIOpen}
                  onClose={() => setIsAIOpen(false)}
                  selectedCode={selectedCode}
                  timeElapsed={timeElapsed}
                  problemId={activeProblemId}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
