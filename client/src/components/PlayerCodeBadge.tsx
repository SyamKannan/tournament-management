import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A player's code for "Player Stats" (e.g. SP-7K4Q2), with a copy button so
 * it can be pasted into a message to the player.
 */
export const PlayerCodeBadge: React.FC<{ code?: string | null; size?: 'sm' | 'md' }> = ({ code, size = 'md' }) => {
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is still on screen to read out.
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-mono font-black ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      title="Player Code — use it on Player Stats"
    >
      {size === 'md' && <span className="font-sans font-bold text-cyan-400/70 uppercase text-[10px] tracking-wider">Player Code</span>}
      <span>{code}</span>
      <button type="button" onClick={copy} aria-label={`Copy player code ${code}`} className="text-cyan-400/70 hover:text-white">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
};
