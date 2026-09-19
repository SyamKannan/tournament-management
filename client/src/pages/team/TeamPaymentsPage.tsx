import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertTriangle, Download, FileText, Receipt, Wallet } from 'lucide-react';
import { api, ApiError } from '../../services/api';
import type { RegistrationReceipt } from '../../types';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { ReceiptModal } from '../../components/ReceiptModal';
import { label } from '../../lib/labels';
import { useManagedTeams, feeState, PayFeeButtons, PageHeader, money as teamMoney } from './teamShared';

interface PaymentRow {
  receipt: RegistrationReceipt;
  team_id: string;
  team_name: string;
  tournament_name: string;
  organization_name: string;
  issued_at: string;
  amount: number;
  method: string;
  transaction_id: string;
  total_fee: number;
  paid_to_date: number;
  balance_after: number;
}

interface PaymentReport {
  payments: PaymentRow[];
  totals: { total_fees: number; paid: number; due: number };
}

const money = (n: number) => `₹${Number(n || 0).toLocaleString()}`;
// jsPDF's built-in font has no ₹ glyph.
const pdfMoney = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The team manager's ground-fee payments across all their teams, with receipts and a PDF report. */
export const TeamPaymentsPage: React.FC = () => {
  const [report, setReport] = useState<PaymentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState('all');
  const [openReceipt, setOpenReceipt] = useState<RegistrationReceipt | null>(null);

  const { teams: managed, reload: reloadTeams } = useManagedTeams();

  const loadReport = useCallback(() => {
    api.get('/teams/my-payments')
      .then(setReport)
      .catch(err => setError(err instanceof ApiError ? err.message : 'Failed to load your payments'));
  }, []);

  useEffect(loadReport, [loadReport]);

  const afterPayment = () => {
    loadReport();
    reloadTeams();
  };
  const owing = (managed ?? []).map(t => ({ entry: t, ...feeState(t) })).filter(f => f.canPay);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    report?.payments.forEach(p => seen.set(p.team_id, `${p.team_name} · ${p.tournament_name}`));
    return [...seen.entries()];
  }, [report]);

  if (error) return <EmptyState icon={Receipt} title="Couldn't load your payments" message={error} />;
  if (!report) return <LoadingState label="Loading your payments…" />;

  // Registering with "pay at the ground" issues a ₹0 receipt; it isn't a payment.
  const rows = report.payments.filter(p => p.amount > 0 && (teamFilter === 'all' || p.team_id === teamFilter));
  const shownTotal = rows.reduce((sum, p) => sum + p.amount, 0);

  const downloadReport = () => {
    const doc = new jsPDF();
    doc.setFillColor(3, 7, 18);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(29, 37, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('GROUND FEE PAYMENT REPORT', 14, 16);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `${teamFilter === 'all' ? 'All teams' : teams.find(([id]) => id === teamFilter)?.[1] ?? ''}  |  Generated ${new Date().toLocaleDateString()}`,
      14, 25,
    );

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Receipt No', 'Team / Tournament', 'Method', 'Amount', 'Balance after']],
      body: rows.map(p => [
        formatDate(p.issued_at),
        p.receipt.receipt_number,
        `${p.team_name}\n${p.tournament_name}`,
        label(p.method.toLowerCase()),
        pdfMoney(p.amount),
        pdfMoney(p.balance_after),
      ]),
      foot: [['', '', '', 'Total paid', pdfMoney(shownTotal), '']],
      theme: 'striped',
      headStyles: { fillColor: [29, 37, 70] },
      footStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8.5 },
    });

    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    if (teamFilter === 'all') {
      doc.text(`Total ground fees: ${pdfMoney(report.totals.total_fees)}`, 14, y);
      doc.text(`Paid: ${pdfMoney(report.totals.paid)}`, 14, y + 6);
      doc.text(`Still due: ${pdfMoney(report.totals.due)}`, 14, y + 12);
    }
    doc.save(`Ground_Fee_Payments_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Invoices"
        subtitle="Pay ground fees, and find every payment with its official receipt"
        action={
        <button
          type="button"
          onClick={downloadReport}
          disabled={rows.length === 0}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Download report (PDF)
        </button>
        }
      />

      {/* Fees still owed: pay half or the full balance */}
      {owing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white font-heading">Fees due</h2>
          {owing.map(f => (
            <div key={f.entry.team.id} className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-200">{teamMoney(f.due)} due · {f.entry.team.name}</p>
                  <p className="text-xs text-amber-200/70">
                    {f.entry.tournament?.name} · ground fee {teamMoney(f.totalFee)}{f.paid > 0 ? `, paid ${teamMoney(f.paid)}` : ''}
                  </p>
                </div>
              </div>
              <PayFeeButtons entry={f.entry} onPaid={afterPayment} />
            </div>
          ))}
        </section>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Total icon={FileText} label="Total ground fees" value={money(report.totals.total_fees)} />
        <Total icon={Wallet} label="Paid" value={money(report.totals.paid)} tone="text-emerald-400" />
        <Total icon={Receipt} label="Still due" value={money(report.totals.due)} tone={report.totals.due > 0 ? 'text-amber-400' : 'text-white'} />
      </div>

      {teams.length > 1 && (
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          aria-label="Filter by team"
        >
          <option value="all">All teams</option>
          {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          message="Payments you make for your teams' ground fees show up here with their receipts."
          action={{ label: 'Join a tournament', to: '/team/join' }}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left font-bold px-4 py-3">Date</th>
                <th className="text-left font-bold px-4 py-3">Team / Tournament</th>
                <th className="text-left font-bold px-4 py-3">Method</th>
                <th className="text-right font-bold px-4 py-3">Amount</th>
                <th className="text-right font-bold px-4 py-3">Balance after</th>
                <th className="px-4 py-3"><span className="sr-only">Receipt</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map(p => (
                <tr key={p.receipt.id} className="bg-slate-950/40 hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {formatDate(p.issued_at)}
                    <span className="block font-mono text-[10px] text-slate-500">{p.receipt.receipt_number}</span>
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <span className="block font-semibold text-white">{p.team_name}</span>
                    <span className="block text-[11px] text-slate-400">{p.tournament_name}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{label(p.method.toLowerCase())}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400 whitespace-nowrap">{money(p.amount)}</td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap ${p.balance_after > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {p.balance_after > 0 ? money(p.balance_after) : 'Settled'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenReceipt(p.receipt)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] whitespace-nowrap"
                    >
                      View receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openReceipt && <ReceiptModal receipt={openReceipt} onClose={() => setOpenReceipt(null)} />}
    </div>
  );
};

const Total: React.FC<{ icon: React.ElementType; label: string; value: string; tone?: string }> = ({ icon: Icon, label: text, value, tone }) => (
  <div className="p-4 rounded-2xl glass-card border border-slate-800">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" /> {text}
    </p>
    <p className={`mt-1 text-xl font-black ${tone ?? 'text-white'}`}>{value}</p>
  </div>
);
