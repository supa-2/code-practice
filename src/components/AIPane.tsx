import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { AlignLeft, Sparkles, User, Send, X, Code2, RefreshCw } from 'lucide-react';
import { cn } from '../utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedCode?: string;
  timeElapsed?: number;
  problemId?: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export function AIPane({ isOpen, onClose, selectedCode, timeElapsed, problemId }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, isOpen]);
  useEffect(() => { setMessages([]); }, [problemId]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMsg = inputValue.trim();
    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          code: selectedCode || "",
          exercise: problemId || "free",
        }),
      });

      if (!response.ok || !response.body) throw new Error("Failed to send message");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + data.text,
                };
                return updated;
              });
            }
            if (data.error && !messages.length) {
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: "⚠ " + data.error,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    await fetch("/api/chat/new", { method: "POST" }).catch(() => {});
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2b2b2b] bg-[#1a1a1a]">
        <h2 className="text-[#cccccc] font-medium text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#bf9c6e]" />
          AI 助手 (Claude)
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="text-[#888] hover:text-[#ccc] transition-colors p-1"
            title="新对话"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMessages([])}
            className="text-[#888] hover:text-[#ccc] transition-colors p-1"
            title="清除对话"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-[#2b2b2b] rounded text-[#888] hover:text-[#cccccc] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-4">
            <div className="w-12 h-12 bg-[#2b2b2b] rounded-2xl flex items-center justify-center border border-[#3a3a3a] shadow-sm">
              <Sparkles className="w-6 h-6 text-[#bf9c6e]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[#e0e0e0] font-medium">今天想学习什么？</h3>
              <p className="text-[#888] text-xs">通过 Claude CLI 驱动，可以分析代码、找 bug、讲解算法。</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="flex flex-col space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#888] mb-1">
                {msg.role === "user" ? (
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> You</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#bf9c6e]" /> Claude</span>
                )}
              </div>
              <div className={cn(
                "prose prose-sm prose-invert max-w-none prose-pre:bg-[#1e1e1e] prose-pre:border border-[#2b2b2b] rounded-lg",
                msg.role === "user" ? "text-[#e0e0e0]" : "text-[#cccccc]"
              )}>
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#888] mb-1">
              <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#bf9c6e]" /> Claude</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#888]">
              <div className="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-[#888] rounded-full animate-bounce" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-[#1a1a1a] border-t border-[#2b2b2b]">
        {selectedCode && (
          <div className="mb-3 px-3 py-2 bg-[#222] border border-[#333] rounded-lg text-xs font-mono text-[#888] shadow-sm max-h-24 overflow-hidden relative">
            <div className="flex items-center gap-1.5 mb-1 text-[#aaa] font-sans font-medium">
              <Code2 className="w-3.5 h-3.5 text-[#bf9c6e]" /> 当前代码
            </div>
            <div className="text-[#666] line-clamp-3 whitespace-pre-wrap">{selectedCode}</div>
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#222] to-transparent pointer-events-none" />
          </div>
        )}
        <div className="relative flex items-end bg-[#222222] border border-[#333333] rounded-xl focus-within:border-[#555] transition-colors shadow-sm">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
            }}
            placeholder="问我关于这道题的任何问题..."
            className="w-full bg-transparent border-none pl-4 pr-12 py-3 text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none resize-none"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "200px" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="absolute right-2 bottom-2 p-1.5 m-0.5 bg-[#bf9c6e] text-black rounded-lg disabled:opacity-50 disabled:bg-[#333] disabled:text-[#666] transition-colors hover:bg-[#a6865d]"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center mt-3 flex items-center justify-center gap-3">
          <span className="text-[10px] text-[#666]">⇧ + ↵ 换行</span>
          <span className="text-[10px] text-[#666]">Anthropic API 驱动</span>
        </div>
      </div>
    </div>
  );
}
