import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { FileText, BookOpen, MessageCircle, ThumbsUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProblemFull, DiscussComment } from '../types';
import { cn } from '../utils';

interface LeftPaneProps {
  problem: ProblemFull | null;
}

export function LeftPane({ problem }: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<"DESCRIPTION" | "LEARN" | "SOLUTIONS" | "DISCUSS">("DESCRIPTION");
  const [learnContent, setLearnContent] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === "LEARN" && problem && learnContent === null) {
      fetch(`/api/problems/${problem.id}/learn`)
        .then(r => r.json())
        .then(data => setLearnContent(data.content || null))
        .catch(() => setLearnContent(null));
    }
    if (tab === "SOLUTIONS" && problem && answer === null) {
      fetch(`/api/problems/${problem.id}/answer`)
        .then(r => r.json())
        .then(data => setAnswer(data.answer || null))
        .catch(() => setAnswer(null));
    }
  };

  React.useEffect(() => { setAnswer(null); setLearnContent(null); }, [problem?.id]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0f0f0f]">
      <div className="flex items-center justify-between border-b border-[#262626] bg-[#161616] shrink-0 overflow-x-auto">
        <div className="flex shrink-0">
          {[
            { key: "DESCRIPTION" as const, label: "题目描述", icon: <FileText className="w-3 h-3" /> },
            { key: "LEARN" as const, label: "学习问答", icon: <BookOpen className="w-3 h-3 text-amber-500" /> },
            { key: "SOLUTIONS" as const, label: "题解", icon: <FileText className="w-3 h-3" /> },
            { key: "DISCUSS" as const, label: "社区讨论", icon: <MessageCircle className="w-3 h-3" /> },
          ].map(tab => (
            <button key={tab.key} onClick={() => handleTabChange(tab.key)}
              className={cn(
                "px-4 py-2.5 text-[11px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap",
                activeTab === tab.key ? "text-white border-b-2 border-amber-500 mb-[-1px]" : "text-[#888] border-b-2 border-transparent hover:text-[#e0e0e0] mb-[-1px]"
              )}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
        {activeTab === "LEARN" && (
          <div className="pr-3 shrink-0"><span className="text-[10px] text-amber-500/60">导师预习材料</span></div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!problem ? (
          <div className="h-full flex flex-col items-center justify-center text-[#555] space-y-4">
            <FileText className="w-12 h-12 text-[#333]" />
            <p className="text-sm">从顶部导航选择一道题目</p>
          </div>
        ) : activeTab === "DESCRIPTION" ? (
          <>
            <h1 className="text-xl font-medium mb-3 text-[#e0e0e0]">{problem.title}</h1>
            <div className="flex flex-wrap space-x-2 mb-6">
              <span className={["px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#262626] border border-[#363636]",
                problem.difficulty === "Easy" ? "text-green-500" :
                problem.difficulty === "Medium" ? "text-yellow-500" : "text-red-500"].join(" ")}>
                {problem.difficulty === "Easy" ? "简单" : problem.difficulty === "Medium" ? "中等" : "困难"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#262626] text-[#888] text-[10px] font-medium border border-[#363636]">{problem.category}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#262626] text-amber-500/70 text-[10px] font-medium border border-[#363636]">{problem.module}</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none text-[#b0b0b0] leading-relaxed marker:text-[#666] prose-pre:bg-[#111] prose-pre:border border-[#262626]">
              <Markdown>{problem.description}</Markdown>
            </div>
          </>
        ) : activeTab === "LEARN" ? (
          <div className="h-full">
            {learnContent === null ? (
              <div className="h-full flex flex-col items-center justify-center text-[#555] space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#161616] flex items-center justify-center border border-[#262626]">
                  <BookOpen className="w-8 h-8 text-[#666]" />
                </div>
                <p className="text-sm">暂无预习材料</p>
                <p className="text-xs text-[#444]">导师尚未为本题布置预习内容</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none text-[#b0b0b0] leading-relaxed marker:text-[#666] prose-pre:bg-[#111] prose-pre:border border-[#262626]">
                <Markdown>{learnContent}</Markdown>
              </div>
            )}
          </div>
        ) : activeTab === "SOLUTIONS" ? (
          <div className="space-y-6">
            {answer === null ? (
              <div className="text-[#555] text-sm mt-20 text-center">加载中...</div>
            ) : answer ? (
              <div className="bg-[#111] border border-[#262626] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#262626]">
                  <h2 className="text-[#e0e0e0] font-semibold text-lg">参考答案</h2>
                  <span className="text-xs text-[#888]">点击编辑器右侧"查看答案"按钮可加载到编辑器</span>
                </div>
                <div className="p-5">
                  <pre className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-sm text-[#b0b0b0] font-mono whitespace-pre-wrap overflow-auto">{answer}</pre>
                </div>
              </div>
            ) : (
              <div className="text-[#555] text-sm mt-20 text-center">暂无参考答案</div>
            )}
            {/* Submission history under solutions */}
            <div>
              <button onClick={() => setShowSubmissions(!showSubmissions)}
                className="flex items-center gap-2 text-sm text-[#888] hover:text-[#bbb] transition-colors">
                {showSubmissions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                提交记录
              </button>
              {showSubmissions && <SubmissionHistory exerciseId={problem.id} />}
            </div>
          </div>
        ) : activeTab === "DISCUSS" ? (
          <DiscussPanel comments={problem.discuss || []} />
        ) : null}
      </div>
    </div>
  );
}

// ── Community Discussion Panel ──

function DiscussPanel({ comments }: { comments: DiscussComment[] }) {
  if (!comments.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#555] space-y-4">
        <MessageCircle className="w-12 h-12 text-[#333]" />
        <p className="text-sm">暂无讨论</p>
      </div>
    );
  }

  const avatarColors = [
    "bg-blue-600", "bg-green-600", "bg-amber-600", "bg-purple-600",
    "bg-pink-600", "bg-cyan-600", "bg-red-600", "bg-indigo-600",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[#e0e0e0] font-semibold text-sm">社区讨论</h3>
        <span className="text-[10px] text-[#555]">{comments.length} 条评论</span>
      </div>
      {comments.map((c, i) => {
        const color = avatarColors[i % avatarColors.length];
        return (
          <div key={i} className="bg-[#111] border border-[#262626] rounded-lg overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", color)}>
                {c.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-[#e0e0e0]">{c.user}</span>
                  <span className="text-[10px] text-[#555]">{c.time}</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-[#b0b0b0] leading-relaxed prose-pre:bg-[#0a0a0a] prose-pre:border border-[#262626] prose-code:text-amber-400 prose-code:before:content-none prose-code:after:content-none">
                  <Markdown>{c.content}</Markdown>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t border-[#1a1a1a]">
                  <button className="flex items-center gap-1 text-[10px] text-[#555] hover:text-amber-500 transition-colors">
                    <ThumbsUp className="w-3 h-3" /> {c.votes}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Submission History ──

function SubmissionHistory({ exerciseId }: { exerciseId: string }) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  React.useEffect(() => {
    fetch(`/api/submissions?exercise=${exerciseId}&limit=20`)
      .then(r => r.json())
      .then(setSubmissions)
      .catch(() => {});
  }, [exerciseId]);

  if (!submissions.length) {
    return <div className="text-[#555] text-sm mt-4">暂无提交记录</div>;
  }

  return (
    <div className="space-y-2 mt-3">
      {submissions.map((sub, i) => (
        <div key={i} className="bg-[#111] border border-[#262626] rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded",
              sub.passed ? "bg-green-900/30 text-green-500" : "bg-red-900/30 text-red-400"
            )}>
              {sub.type === "test" ? (sub.passed ? "Accepted" : "Wrong Answer") : "Run"}
            </span>
            <span className="text-[9px] text-[#555]">{new Date(sub.time).toLocaleString("zh-CN")}</span>
          </div>
          <pre className="text-[10px] text-[#777] font-mono whitespace-pre-wrap max-h-20 overflow-auto">{sub.code?.slice(0, 200)}</pre>
        </div>
      ))}
    </div>
  );
}
