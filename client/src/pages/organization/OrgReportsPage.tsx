import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Tournament } from '../../types';
import { FileText, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TournamentPicker } from '../../components/ui/TournamentPicker';
import { ExportPanel } from '../../components/ExportPanel';
import { EmptyState, Skeleton, SkeletonStats, SkeletonTable } from '../../components/ui/Feedback';
import { label } from '../../lib/labels';

export const OrgReportsPage: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        setLoading(true);
        const res = await api.get('/tournaments');
        setTournaments(res);
        if (res.length > 0) setSelectedTourneyId(res[0].id);
      } catch (err) {
        console.error('Failed to load tournaments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTourneys();
  }, []);

  const fetchReport = async (tourneyId: string) => {
    if (!tourneyId) return;
    try {
      const res = await api.get(`/reports/financials/${tourneyId}`);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load financial report', err);
    }
  };

  useEffect(() => {
    if (selectedTourneyId) fetchReport(selectedTourneyId);
  }, [selectedTourneyId]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!reportData) return;
    const headers = ['Team Name', 'Manager Name', 'Phone', 'Total Ground Fee', 'Paid Amount', 'Remaining Balance', 'Payment Status', 'Payment Method', 'Transaction ID'];
    const rows = reportData.records.map((r: any) => [
      `"${r.team_name}"`,
      `"${r.manager_name}"`,
      `"${r.manager_phone}"`,
      r.total_fee,
      r.paid_amount,
      r.remaining_amount,
      r.status,
      r.payment_method,
      `"${r.transaction_id}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((row: any[]) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ground_Fee_Report_${reportData.tournament.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    link.click();
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (!reportData) return;
    const doc = new jsPDF();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, 'F');

    doc.setTextColor(29, 37, 70);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('GROUND FEE FINANCIAL REPORT (PAYMENT SYSTEM 2)', 14, 18);

    doc.setTextColor(156, 163, 175);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tournament: ${reportData.tournament.name} | Generated: ${new Date().toLocaleDateString()}`, 14, 28);

    // Summary Box
    const sum = reportData.summary;
    autoTable(doc, {
      startY: 45,
      head: [['Metric', 'Value']],
      body: [
        ['Total Registered Teams', `${sum.total_teams} Squads`],
        ['Total Expected Ground Fees', `Rs. ${sum.total_expected.toLocaleString()}`],
        ['Total Ground Fees Collected', `Rs. ${sum.total_collected.toLocaleString()}`],
        ['Total Outstanding Pending Balance', `Rs. ${sum.total_pending.toLocaleString()}`],
        ['Collection Percentage', `${sum.collection_percentage}%`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [29, 37, 70], textColor: [255, 255, 255] }
    });

    // Breakdown Table
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('TEAM PAYMENT BREAKDOWN', 14, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Team Name', 'Manager', 'Fee (INR)', 'Paid (INR)', 'Balance (INR)', 'Status']],
      body: reportData.records.map((r: any) => [
        r.team_name,
        `${r.manager_name} (${r.manager_phone})`,
        `Rs. ${r.total_fee.toLocaleString()}`,
        `Rs. ${r.paid_amount.toLocaleString()}`,
        `Rs. ${r.remaining_amount.toLocaleString()}`,
        r.status.toUpperCase()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
    });

    doc.save(`Financial_Report_${reportData.tournament.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonStats count={4} />
        <SkeletonTable rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Financial & Tournament Reports</h1>
          <p className="text-xs text-slate-400 mt-1">Ground fee collection balance sheets and downloadable PDF receipts</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TournamentPicker
            tournaments={tournaments}
            value={selectedTourneyId}
            onChange={setSelectedTourneyId}
          />
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Official PDF</span>
          </button>
        </div>
      </div>

      {/* The rest of the tournament as files — table, fixtures, stats, squads. */}
      {selectedTourneyId && <ExportPanel tournamentId={selectedTourneyId} />}

      {!reportData ? (
        <EmptyState
          icon={FileText}
          title="No financial data yet"
          message="Once teams register and pay their ground fee, collection totals and receipts appear here."
        />
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl glass-card border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Total Expected</span>
              <div className="text-2xl font-black text-white font-heading font-mono mt-1">
                ₹{reportData.summary.total_expected.toLocaleString()}
              </div>
            </div>

            <div className="p-5 rounded-2xl glass-card border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Collected Revenue</span>
              <div className="text-2xl font-black text-emerald-400 font-heading font-mono mt-1">
                ₹{reportData.summary.total_collected.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-400 mt-0.5">{reportData.summary.collection_percentage}% Collected</div>
            </div>

            <div className="p-5 rounded-2xl glass-card border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Outstanding Due</span>
              <div className="text-2xl font-black text-amber-400 font-heading font-mono mt-1">
                ₹{reportData.summary.total_pending.toLocaleString()}
              </div>
            </div>

            <div className="p-5 rounded-2xl glass-card border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold uppercase">Total Squads</span>
              <div className="text-2xl font-black text-white font-heading font-mono mt-1">
                {reportData.summary.total_teams}
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
            <div className="overflow-x-auto">
              <table className="responsive-table w-full min-w-[820px] text-xs text-left">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Team Name</th>
                    <th className="px-4 py-3.5">Manager Contact</th>
                    <th className="px-4 py-3.5">Total Fee</th>
                    <th className="px-4 py-3.5">Paid Amount</th>
                    <th className="px-4 py-3.5">Remaining</th>
                    <th className="px-4 py-3.5">Method</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {reportData.records.map((r: any) => (
                    <tr key={r.team_id} className="hover:bg-slate-800/40 transition-colors">
                      <td data-label="Team Name" className="px-5 py-3.5 font-bold text-white text-xs rt-full">{r.team_name}</td>
                      <td data-label="Manager Contact" className="px-4 py-3.5 text-slate-300 rt-full">{r.manager_name} ({r.manager_phone})</td>
                      <td data-label="Total Fee" className="px-4 py-3.5 font-mono text-slate-200">₹{r.total_fee.toLocaleString()}</td>
                      <td data-label="Paid Amount" className="px-4 py-3.5 font-mono font-bold text-emerald-400">₹{r.paid_amount.toLocaleString()}</td>
                      <td data-label="Remaining" className="px-4 py-3.5 font-mono font-bold text-amber-400">₹{r.remaining_amount.toLocaleString()}</td>
                      <td data-label="Method" className="px-4 py-3.5 uppercase font-mono text-[11px] text-slate-400">{r.payment_method}</td>
                      <td data-label="Status" className="px-4 py-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                          r.status === 'fully_paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {label(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
