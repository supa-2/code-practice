import React, { useState, useRef, useEffect } from 'react';
import { List, ChevronLeft, ChevronRight, Shuffle, ChevronDown, Check, Circle } from 'lucide-react';
import type { ProblemMeta } from '../types';
import { cn } from '../utils';

interface Props {
  problems: ProblemMeta[];
  activeProblemId: string;
  onSelectProblem: (id: string) => void;
}

type FilterMode = "all" | "todo" | "passed";

export function ProblemSelector({ problems, activeProblemId, onSelectProblem }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentIndex = problems.findIndex(p => p.id === activeProblemId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrev = () => {
    if (currentIndex > 0) onSelectProblem(problems[currentIndex - 1].id);
  };

  const handleNext = () => {
    if (currentIndex < problems.length - 1) onSelectProblem(problems[currentIndex + 1].id);
  };

  const handleRandom = () => {
    const todo = problems.filter(p => p.status !== "passed");
    const pool = todo.length > 0 ? todo : problems;
    const randomIndex = Math.floor(Math.random() * pool.length);
    onSelectProblem(pool[randomIndex].id);
  };

  const activeProblem = problems.find(p => p.id === activeProblemId);

  const filtered = filter === "all" ? problems
    : filter === "todo" ? problems.filter(p => p.status !== "passed")
    : problems.filter(p => p.status === "passed");

  // Group by module, sort: new/tried before passed within each group
  const modules = [...new Set(filtered.map(p => p.module))];
  const sorted = (ps: ProblemMeta[]) => [...ps].sort((a, b) => {
    const order = { new: 0, tried: 1, passed: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });

  const statusIcon = (status: string) => {
    if (status === "passed") return <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />;
    if (status === "tried") return <Circle className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />;
    return <Circle className="w-3.5 h-3.5 text-[#444] shrink-0" />;
  };

  return (
    <div className="relative flex items-center bg-[#262626] rounded-md transition-all" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#333] transition-colors rounded-l-md border-r border-[#363636] text-sm text-[#e0e0e0]"
      >
        <List className="w-4 h-4" />
        <span className="font-medium whitespace-nowrap">
          {activeProblem ? activeProblem.title : "题目列表"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#888] ml-1" />
      </button>

      <button
        onClick={handlePrev}
        disabled={currentIndex <= 0}
        className="p-1.5 hover:bg-[#333] transition-colors border-r border-[#363636] disabled:opacity-50 text-[#888] hover:text-[#ccc]"
        title="上一题"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={handleNext}
        disabled={currentIndex < 0 || currentIndex >= problems.length - 1}
        className="p-1.5 hover:bg-[#333] transition-colors border-r border-[#363636] disabled:opacity-50 text-[#888] hover:text-[#ccc]"
        title="下一题"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <button
        onClick={handleRandom}
        className="p-1.5 hover:bg-[#333] transition-colors rounded-r-md text-[#888] hover:text-[#ccc]"
        title="随机题目（跳过已完成）"
      >
        <Shuffle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-[#161616] border border-[#262626] rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Filter tabs */}
          <div className="flex border-b border-[#262626] bg-[#1a1a1a]">
            {([
              { key: "all" as const, label: "全部" },
              { key: "todo" as const, label: "未完成" },
              { key: "passed" as const, label: "已通过" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn(
                  "flex-1 py-2 text-[11px] font-semibold transition-colors",
                  filter === f.key ? "text-amber-500 border-b-2 border-amber-500" : "text-[#666] hover:text-[#aaa]"
                )}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-[#555] text-sm text-center py-8">
                {filter === "todo" ? "全部已完成！" : "暂无题目"}
              </div>
            ) : (
              modules.map(mod => (
                <div key={mod}>
                  <div className="px-4 py-2 bg-[#1a1a1a] text-[#888] text-[10px] font-bold uppercase tracking-wider border-b border-[#262626]">
                    {mod}
                  </div>
                  {sorted(filtered.filter(p => p.module === mod)).map(problem => (
                    <button
                      key={problem.id}
                      onClick={() => {
                        onSelectProblem(problem.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b border-[#262626] hover:bg-[#1d1d1d] transition-colors flex items-center gap-3",
                        activeProblemId === problem.id ? "bg-[#1d1d1d] text-amber-500" : "text-[#ccc]"
                      )}
                    >
                      {statusIcon(problem.status)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-sm">{problem.title}</div>
                        <div className="text-xs text-[#666] mt-0.5">{problem.category}</div>
                      </div>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded border whitespace-nowrap",
                        problem.difficulty === "Easy" ? "bg-green-900/30 text-green-500 border-green-900/50" :
                        problem.difficulty === "Medium" ? "bg-yellow-900/30 text-yellow-500 border-yellow-900/50" :
                        "bg-red-900/30 text-red-500 border-red-900/50"
                      )}>
                        {problem.difficulty === "Easy" ? "简单" : problem.difficulty === "Medium" ? "中等" : "困难"}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
