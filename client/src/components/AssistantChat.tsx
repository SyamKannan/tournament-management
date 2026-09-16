import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Send, X } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { ScoreyAvatar } from './ScoreyAvatar';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const STORAGE_KEY = 'sports_saas_assistant_chat';
const MAX_HISTORY = 20;
const SUGGESTIONS = ['Any live matches right now? ⚽', 'How do I host a tournament?', 'How do I find my Player Code?', 'How does team registration work?'];

function loadHistory(): ChatMessage[] {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Inline markdown the assistant is told to use: **bold** and [label](/internal-path) links. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={key} className="font-semibold text-white">{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    // Only same-site paths become links — never an arbitrary URL from model output.
    if (link && link[2].startsWith('/') && !link[2].startsWith('//')) {
      return <Link key={key} to={link[2]} className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">{link[1]}</Link>;
    }
    return link ? link[1] : part;
  });
}

function renderMessage(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => {
    // Numbered how-to steps keep their numbers; other list items get a dot.
    const bullet = line.match(/^\s*([-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const marker = /\d/.test(bullet[1]) ? bullet[1] : '•';
      return <div key={i} className="flex gap-2 pl-1"><span className="shrink-0 text-emerald-400">{marker}</span><span>{renderInline(bullet[2], String(i))}</span></div>;
    }
    return line.trim() === '' ? <div key={i} className="h-2" /> : <div key={i}>{renderInline(line.replace(/^#+\s*/, ''), String(i))}</div>;
  });
}

export const AssistantChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage unavailable — the chat still works for this page view.
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const next = [...messages, { role: 'user' as const, content: question.slice(0, 2000) }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      // The API wants the history to start with a user turn.
      let history = next.slice(-MAX_HISTORY);
      while (history.length && history[0].role !== 'user') history = history.slice(1);

      const res = await api.post<{ reply: string }>('/assistant/chat', { messages: history });
      setMessages([...next, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'You are asking a little fast — wait a minute and try again.'
          : err instanceof Error ? err.message : 'Something went wrong.'
      );
      // Drop the unanswered question so the history stays user/assistant pairs.
      setMessages(messages);
      setInput(question);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Chat with Scorey"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-slate-900 p-1.5 font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:border-emerald-400 sm:pr-4"
      >
        <ScoreyAvatar size={40} animated />
        <span className="hidden sm:inline">Ask Scorey</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chat with Scorey"
      className="fixed inset-x-3 bottom-3 z-50 flex h-[min(600px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
    >
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <ScoreyAvatar size={40} animated />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Scorey</div>
          <div className="text-xs text-slate-400">Your Sportivo buddy · scores, stats & how-tos</div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setError(null); }} aria-label="New conversation" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 pb-1 pt-2 text-center">
              <ScoreyAvatar size={72} animated />
              <p className="text-slate-300">Hi, I'm <strong className="text-white">Scorey</strong>! 👋 Ask me about live scores, fixtures, points tables, player stats — or how anything on Sportivo works.</p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-slate-700 px-3 py-2 text-left text-slate-200 hover:border-emerald-500/60 hover:bg-slate-800">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-end justify-start gap-2'}>
            {m.role === 'assistant' && <ScoreyAvatar size={26} className="shrink-0" />}
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-emerald-500 px-3 py-2 text-slate-950'
                  : 'max-w-[90%] space-y-0.5 break-words rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-slate-200'
              }
            >
              {m.role === 'user' ? m.content : renderMessage(m.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <ScoreyAvatar size={26} animated className="shrink-0" /> Scorey is checking…
          </div>
        )}
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-300">{error}</div>}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-end gap-2 border-t border-slate-800 p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder="Ask Scorey anything…"
          className="max-h-28 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="rounded-xl bg-emerald-500 p-2.5 text-slate-950 transition hover:bg-emerald-400 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
