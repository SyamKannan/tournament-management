import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Ear, TriangleAlert } from 'lucide-react';

/** Matches the `ExtraType` the scorer console already posts. */
export type VoiceExtra = 'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';

export type VoiceCall =
  | { kind: 'runs'; runs: number; extra: VoiceExtra }
  | { kind: 'wicket'; wicketType: string }
  | { kind: 'undo' };

/**
 * Scoring a cricket over by speaking it.
 *
 * The scorer at a village ground is holding a phone in one hand and a pen in the
 * other, often standing at the boundary rope. Tapping through a runs button, an
 * extras toggle and a confirm for every ball is the slowest part of the job, and
 * the reason a scorecard falls behind the match.
 *
 * Deliberately narrow: it recognises the handful of things that are actually
 * called out at a ground, requires an explicit confirmation for a wicket (the
 * one call that is expensive to get wrong), and never guesses. Anything it does
 * not understand is shown back to the scorer rather than acted on.
 */

/** What the browser exposes; not in the DOM typings. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

const recognitionClass = (): (new () => SpeechRecognitionLike) | null => {
  const w = window as any;

  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/**
 * Turn a spoken phrase into a call, or null.
 *
 * Word forms first, because "four" is heard far more reliably than "4", and
 * scorers say "dot ball" and "no run" as often as "zero".
 */
export const parseVoiceCall = (raw: string): VoiceCall | null => {
  const said = raw.toLowerCase().trim().replace(/[.,!]/g, '');

  if (!said) return null;

  if (/\b(undo|cancel that|mistake|scratch that)\b/.test(said)) {
    return { kind: 'undo' };
  }

  // A wicket is named by how it happened, so the scorer does not have to pick
  // from a list afterwards.
  const wickets: [RegExp, string][] = [
    [/\b(bowled|clean bowled)\b/, 'bowled'],
    [/\b(caught and bowled|caught n bowled)\b/, 'caught_and_bowled'],
    [/\b(caught|catch)\b/, 'caught'],
    [/\b(lbw|leg before)\b/, 'lbw'],
    [/\b(run out|runout)\b/, 'run_out'],
    [/\b(stumped)\b/, 'stumped'],
    [/\b(hit wicket)\b/, 'hit_wicket'],
  ];

  for (const [pattern, wicketType] of wickets) {
    if (pattern.test(said)) return { kind: 'wicket', wicketType };
  }

  if (/\b(out|wicket|howzat)\b/.test(said)) {
    return { kind: 'wicket', wicketType: 'bowled' };
  }

  const extra: VoiceExtra =
    /\bno ball\b|\bnoball\b/.test(said) ? 'no_ball'
      : /\bwide\b/.test(said) ? 'wide'
        : /\bleg bye\b|\blegbye\b/.test(said) ? 'leg_bye'
          : /\bbye\b/.test(said) ? 'bye'
            : 'none';

  const words: Record<string, number> = {
    zero: 0, dot: 0, 'no run': 0, none: 0,
    one: 1, single: 1, two: 2, double: 2, three: 3, four: 4, boundary: 4,
    five: 5, six: 6, maximum: 6,
  };

  for (const [word, runs] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`).test(said)) {
      return { kind: 'runs', runs, extra };
    }
  }

  const digits = said.match(/\b([0-6])\b/);

  if (digits) {
    return { kind: 'runs', runs: Number(digits[1]), extra };
  }

  // "wide" or "no ball" on its own is a legal call with no runs off the bat.
  if (extra !== 'none') {
    return { kind: 'runs', runs: 0, extra };
  }

  return null;
};

export const VoiceScoring: React.FC<{
  onCall: (call: VoiceCall) => void;
  disabled?: boolean;
}> = ({ onCall, disabled = false }) => {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ call: VoiceCall; phrase: string } | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const supported = recognitionClass() !== null;

  const handlePhrase = useCallback((phrase: string) => {
    const call = parseVoiceCall(phrase);
    setHeard(phrase);

    if (!call) {
      setRejected(phrase);
      return;
    }

    setRejected(null);

    // A wicket is confirmed by hand. Everything else is cheap to undo; a wicket
    // wrongly given interrupts the match while it is sorted out.
    if (call.kind === 'wicket') {
      setPending({ call, phrase });
      return;
    }

    onCall(call);
  }, [onCall]);

  useEffect(() => {
    if (!listening) {
      recognition.current?.stop();
      return;
    }

    const Recognition = recognitionClass();
    if (!Recognition) return;

    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = false;
    // Indian English: the accent the scorers using this actually have.
    instance.lang = 'en-IN';

    instance.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) handlePhrase(String(last[0].transcript));
    };

    instance.onerror = () => setListening(false);
    // Browsers stop listening on their own after a pause; start again so the
    // scorer does not have to press the button between overs.
    instance.onend = () => {
      if (listening) {
        try { instance.start(); } catch { /* already restarting */ }
      }
    };

    try {
      instance.start();
      recognition.current = instance;
    } catch {
      setListening(false);
    }

    return () => {
      instance.onend = null;
      instance.stop();
    };
  }, [listening, handlePhrase]);

  if (!supported) {
    return (
      <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
        <MicOff className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>Voice scoring needs Chrome or Edge. Everything still works by tapping.</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Ear className="w-3.5 h-3.5 text-violet-400" />
            Voice scoring
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Say “four”, “dot ball”, “wide two”, “bowled”, or “undo”.
          </p>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setListening(v => !v)}
          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
            listening
              ? 'bg-rose-600/20 border-rose-500/40 text-rose-300'
              : 'bg-violet-600/20 border-violet-500/40 text-violet-300 hover:bg-violet-600/30'
          }`}
        >
          {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{listening ? 'Stop' : 'Start'}</span>
        </button>
      </div>

      {listening && (
        <div className="flex items-center gap-2 text-[11px] text-violet-300">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span>Listening{heard ? ` — heard “${heard}”` : '…'}</span>
        </div>
      )}

      {rejected && (
        <div className="text-[11px] text-amber-400 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Did not catch “{rejected}”. Say it again, or tap it in.</span>
        </div>
      )}

      {pending && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
          <p className="text-[11px] text-amber-200">
            Heard “{pending.phrase}” — give it out?
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => { onCall(pending.call); setPending(null); }}
              className="px-3 py-1.5 rounded-lg bg-amber-600/30 border border-amber-500/40 text-amber-100 text-[11px] font-bold"
            >
              Yes, wicket
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
