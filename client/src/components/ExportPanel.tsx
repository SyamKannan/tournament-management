import React, { useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { downloadFile } from '../lib/download';
import { useToast } from './ui/Toast';

type ExportItem = { key: string; label: string; hint: string; path: string; file: string };

/**
 * The downloads an organizer takes off the platform.
 *
 * Everything here is already on a screen somewhere; the file exists because a
 * village tournament's paperwork does not live in a browser. The fee sheet gets
 * printed for the committee, the squad list gets checked against ID cards at the
 * gate, and the table gets sent to a WhatsApp group.
 */
export const ExportPanel: React.FC<{ tournamentId: string; includePrivate?: boolean }> = ({
  tournamentId,
  includePrivate = true,
}) => {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const items: ExportItem[] = [
    {
      key: 'standings',
      label: 'Points table',
      hint: 'Positions, results and fair-play points',
      path: `/exports/tournaments/${tournamentId}/standings.csv`,
      file: 'points-table.csv',
    },
    {
      key: 'fixtures',
      label: 'Fixture list',
      hint: 'Every match with ground, time and result',
      path: `/exports/tournaments/${tournamentId}/fixtures.csv`,
      file: 'fixtures.csv',
    },
    {
      key: 'stats',
      label: 'Player statistics',
      hint: 'Scorers, wickets and appearances',
      path: `/exports/tournaments/${tournamentId}/player-stats.csv`,
      file: 'player-stats.csv',
    },
    ...(includePrivate
      ? [
          {
            key: 'fees',
            label: 'Fee collection',
            hint: 'Who has paid, what is outstanding, and the number to ring',
            path: `/exports/tournaments/${tournamentId}/fees.csv`,
            file: 'fee-collection.csv',
          },
          {
            key: 'squads',
            label: 'Squad lists',
            hint: 'Every player, with jersey number and player code',
            path: `/exports/tournaments/${tournamentId}/squads.csv`,
            file: 'squads.csv',
          },
        ]
      : []),
  ];

  const run = async (item: ExportItem) => {
    setBusy(item.key);
    try {
      await downloadFile(item.path, item.file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That download failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          Downloads
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Opens in Excel or Google Sheets. Names and numbers are kept as text, so nothing gets
          reformatted on the way in.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            disabled={busy !== null}
            onClick={() => run(item)}
            className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/40 text-left transition-colors disabled:opacity-60 flex items-start gap-2.5"
          >
            {busy === item.key
              ? <Loader2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 animate-spin" />
              : <Download className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            <span className="min-w-0">
              <span className="block text-xs font-bold text-white">{item.label}</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{item.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
