import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice } from '../types';

/** Builds and downloads a PDF for a platform subscription invoice. */
export function downloadInvoicePdf(invoice: Invoice): void {
  const doc = new jsPDF();
  const money = (n: number) => `${invoice.currency === 'INR' || !invoice.currency ? 'Rs.' : invoice.currency} ${n.toLocaleString()}`;

  doc.setFillColor(3, 7, 18);
  doc.rect(0, 0, 210, 40, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 14, 20);

  doc.setTextColor(156, 163, 175);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice No: ${invoice.invoice_number}  |  Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 14, 30);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 196, 30, { align: 'right' });

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('BILLED TO', 14, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const billedTo = [invoice.billing_name, invoice.billing_email, invoice.billing_address].filter(Boolean);
  billedTo.forEach((line, i) => doc.text(String(line), 14, 59 + i * 6));

  autoTable(doc, {
    startY: 59 + billedTo.length * 6 + 6,
    head: [['Description', 'Amount']],
    body: [
      ['KickWick platform subscription', money(invoice.amount)],
    ],
    foot: [['Total', money(invoice.amount)]],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
    footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 10, cellPadding: 4 },
  });

  const y = (doc as any).lastAutoTable.finalY + 12;

  autoTable(doc, {
    startY: y,
    body: [
      ['Payment Method', invoice.payment_method.toUpperCase()],
      ['Transaction Reference', invoice.transaction_reference],
    ],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });

  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('This is a computer generated invoice and does not require a signature.', 14, (doc as any).lastAutoTable.finalY + 14);

  doc.save(`Invoice_${invoice.invoice_number}.pdf`);
}
