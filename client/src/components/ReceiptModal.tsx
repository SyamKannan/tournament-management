import React, { useRef } from 'react';
import type { RegistrationReceipt } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Printer, Download, X, CheckCircle2, QrCode, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  receipt: RegistrationReceipt | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const data = receipt.receipt_data;
  const isFullyPaid = data.status === 'fully_paid';

  const handleDownloadPDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFillColor(3, 7, 18);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('OFFICIAL TOURNAMENT REGISTRATION RECEIPT', 14, 20);

    doc.setTextColor(156, 163, 175);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Receipt No: ${data.receipt_number}  |  Issued: ${new Date(receipt.issued_at).toLocaleDateString()}`, 14, 30);

    // Organization & Tournament
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOURNAMENT & ORGANIZER DETAILS', 14, 52);

    autoTable(doc, {
      startY: 56,
      head: [['Field', 'Information']],
      body: [
        ['Tournament', data.tournament_name],
        ['Host Organization', data.organization_name],
        ['Registered Team', data.team_name],
        ['Team Manager', `${data.manager_name} (${data.manager_phone})`],
        ['Payment Method', data.payment_method],
        ['Transaction Ref / ID', data.transaction_id],
        ['Payment Status', isFullyPaid ? 'FULLY PAID (100%)' : `PARTIALLY PAID (Balance Due: Rs. ${data.remaining_balance})`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 4 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    // Financial Table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('GROUND FEE FINANCIAL BREAKDOWN', 14, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Description', 'Amount (INR)']],
      body: [
        ['Total Ground Registration Fee', `Rs. ${data.total_fee.toLocaleString()}`],
        ['Amount Received / Paid', `Rs. ${data.paid_amount.toLocaleString()}`],
        ['Outstanding Balance Due', `Rs. ${data.remaining_balance.toLocaleString()}`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 4 }
    });

    const finalY2 = (doc as any).lastAutoTable.finalY + 20;

    // Verification & Signatures
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`Digital Verification Signature: ${data.qr_code_signature}`, 14, finalY2);
    doc.text('This is a computer generated official SaaS tournament entry receipt.', 14, finalY2 + 6);

    doc.save(`Receipt_${data.receipt_number}_${data.team_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-heading">Official Registration Receipt</h3>
              <p className="text-[11px] text-slate-400 font-mono">{data.receipt_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200">
          {/* Status banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isFullyPaid 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  {isFullyPaid ? 'Registration Fee Fully Paid' : 'Partially Paid (Advance Confirmed)'}
                </div>
                <div className="text-[11px] opacity-80">
                  {isFullyPaid ? 'Team eligible for tournament fixture placement.' : `Remaining ₹${data.remaining_balance.toLocaleString()} payable before first match.`}
                </div>
              </div>
            </div>
            <div className="text-right font-mono font-bold text-base">
              ₹{data.paid_amount.toLocaleString()}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 block text-[11px]">Tournament</span>
              <span className="font-semibold text-white">{data.tournament_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Organizing Body</span>
              <span className="font-semibold text-white">{data.organization_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Registered Team</span>
              <span className="font-bold text-emerald-400 text-sm">{data.team_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Team Manager</span>
              <span className="font-medium text-white">{data.manager_name} ({data.manager_phone})</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Payment Mode</span>
              <span className="font-medium text-white">{data.payment_method}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Transaction ID</span>
              <span className="font-mono text-slate-300 truncate block">{data.transaction_id}</span>
            </div>
          </div>

          {/* Amount breakdown table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Description</th>
                  <th className="px-4 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="px-4 py-2.5 text-slate-300">Total Ground Fee</td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-white">₹{data.total_fee.toLocaleString()}</td>
                </tr>
                <tr className="bg-emerald-500/5">
                  <td className="px-4 py-2.5 text-emerald-300 font-medium">Amount Paid (Recorded)</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">₹{data.paid_amount.toLocaleString()}</td>
                </tr>
                <tr className={data.remaining_balance > 0 ? 'bg-amber-500/5' : ''}>
                  <td className="px-4 py-2.5 text-slate-400">Remaining Balance Due</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">₹{data.remaining_balance.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* QR Verification String */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
            <QrCode className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div className="truncate">
              <div className="font-semibold text-slate-300">Digital Authenticity Signature</div>
              <div className="font-mono text-slate-500 truncate">{data.qr_code_signature}</div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Issued on {new Date(receipt.issued_at).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
