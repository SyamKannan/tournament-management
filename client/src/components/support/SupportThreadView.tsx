import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Paperclip, Send, X } from 'lucide-react';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { useDraft } from '../../lib/useDraft';
import { useToast } from '../ui/Toast';
import { formatWhen, uploadScreenshot, type SupportThread } from '../../lib/support';

interface Props {
  thread: SupportThread;
  side: 'club' | 'admin';
  /** Resolves once the thread has been refetched. */
  onReply: (body: string, attachments: string[], internal: boolean) => Promise<void>;
  /** Shown instead of the composer when replying is not possible. */
  closedNote?: string | null;
}

/** Screenshots picked for a message, before it is sent. Up to three, like the API. */
export const AttachmentPicker: React.FC<{ value: string[]; onChange: (next: string[]) => void; id: string }> = ({ value, onChange, id }) => {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 3 - value.length);
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) urls.push(await uploadScreenshot(file));
      onChange([...value, ...urls]);
    } catch (err: any) {
      toast.error(err?.message || 'Could not attach that screenshot.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map(url => (
        <span key={url} className="relative">
          <img src={url} alt="Attached screenshot" className="w-14 h-14 rounded-lg object-cover ring-1 ring-slate-700" />
          <button
            type="button"
            onClick={() => onChange(value.filter(item => item !== url))}
            aria-label="Remove screenshot"
            className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-slate-900 ring-1 ring-slate-600 text-slate-300 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {value.length < 3 && (
        <label
          htmlFor={id}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/70 hover:bg-slate-700 cursor-pointer"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          {uploading ? 'Attaching…' : 'Add screenshot'}
          <input id={id} type="file" accept="image/*" multiple className="sr-only" onChange={pick} disabled={uploading} />
        </label>
      )}
    </div>
  );
};

export const SupportThreadView: React.FC<Props> = ({ thread, side, onReply, closedNote }) => {
  const { ticket, messages } = thread;
  const draft = useDraft<{ body: string }>(`support-reply:${side}:${ticket.id}`);
  const [body, setBody] = useState(draft.initial?.body ?? '');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [internal, setInternal] = useState(false);
  const { run, busy } = useSingleFlight();
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    run(async () => {
      try {
        await onReply(body.trim(), attachments, internal);
        setBody('');
        setAttachments([]);
        setInternal(false);
        draft.clear();
      } catch (err: any) {
        toast.error(err?.message || 'Could not send that reply.');
      }
    });
  };

  // Messages from "our" side sit on the right.
  const ours = side === 'club' ? 'user' : 'admin';

  return (
    <div className="flex flex-col gap-4">
      <ol className="space-y-3" aria-label="Messages">
        {messages.map(message => {
          const mine = message.author_side === ours;
          return (
            <li key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 py-3 ring-1 ${
                  message.is_internal
                    ? 'bg-amber-500/10 ring-amber-500/30'
                    : mine
                      ? 'bg-emerald-500/10 ring-emerald-500/25'
                      : 'bg-slate-800/70 ring-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  {message.is_internal && <Lock className="w-3 h-3 text-amber-300" aria-hidden="true" />}
                  <span className="font-semibold text-slate-200">{message.author_name}</span>
                  {message.is_internal && <span className="text-amber-300 font-semibold">Internal note</span>}
                  <span>{formatWhen(message.created_at)}</span>
                </div>
                <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{message.body}</p>
                {message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.attachments.map(url => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="Screenshot" className="w-24 h-24 rounded-lg object-cover ring-1 ring-slate-700 hover:ring-emerald-500" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />

      {closedNote ? (
        <p className="text-sm text-slate-400 text-center py-3 rounded-xl bg-slate-900/60 ring-1 ring-slate-800">{closedNote}</p>
      ) : (
        <form onSubmit={send} className="space-y-3 rounded-2xl p-3 bg-slate-900/60 ring-1 ring-slate-800">
          <label htmlFor={`reply-${ticket.id}`} className="sr-only">Your reply</label>
          <textarea
            id={`reply-${ticket.id}`}
            rows={3}
            value={body}
            maxLength={5000}
            onChange={e => { setBody(e.target.value); draft.save({ body: e.target.value }); }}
            placeholder={internal ? 'Note for platform admins only — the club never sees this' : 'Write a reply…'}
            className={`w-full px-3.5 py-2.5 rounded-xl glass-input text-sm ${internal ? 'ring-1 ring-amber-500/40' : ''}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <AttachmentPicker id={`attach-${ticket.id}`} value={attachments} onChange={setAttachments} />
              {side === 'admin' && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} className="accent-amber-500" />
                  Internal note
                </label>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {internal ? 'Save note' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
