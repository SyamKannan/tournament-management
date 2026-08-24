import { db } from '../db/database.js';
import { RegistrationPayment, RegistrationReceipt, Tournament, Team, PaymentStatus } from '../types.js';

export class TournamentPaymentService {
  /**
   * Calculate ground fee options for team registration
   */
  public static calculatePaymentOptions(tournament: Tournament): {
    totalFee: number;
    allowPartial: boolean;
    partialPercentage?: number;
    partialAmount?: number;
    fullAmount: number;
  } {
    const totalFee = tournament.ground_fee || 0;
    const allowPartial = Boolean(tournament.payment_config?.allow_partial);
    
    let partialAmount = totalFee;
    let partialPercentage = 100;

    if (allowPartial && tournament.payment_config) {
      if (tournament.payment_config.min_partial_type === 'percentage') {
        partialPercentage = tournament.payment_config.min_partial_value || 50;
        partialAmount = Math.round((totalFee * partialPercentage) / 100);
      } else {
        partialAmount = tournament.payment_config.min_partial_value || Math.round(totalFee / 2);
        partialPercentage = totalFee > 0 ? Math.round((partialAmount / totalFee) * 100) : 0;
      }
    }

    return {
      totalFee,
      allowPartial,
      partialPercentage,
      partialAmount,
      fullAmount: totalFee
    };
  }

  /**
   * Process a team registration payment (Online or Offline)
   */
  public static processPayment(params: {
    teamId: string;
    tournamentId: string;
    organizationId: string;
    paymentOption: 'full' | 'partial';
    paymentMethod: 'online' | 'cash' | 'upi' | 'bank_transfer' | 'other';
    customAmount?: number;
    transactionId?: string;
    notes?: string;
    recordedByAdmin?: boolean;
    adminUserId?: string;
  }): { payment: RegistrationPayment; receipt: RegistrationReceipt } {
    const tournament = db.tournaments.find(t => t.id === params.tournamentId);
    const team = db.teams.find(t => t.id === params.teamId);
    const org = db.organizations.find(o => o.id === params.organizationId);

    if (!tournament || !team || !org) {
      throw new Error('Tournament, Team or Organization not found');
    }

    const options = this.calculatePaymentOptions(tournament);
    let amountToPay = 0;

    if (params.customAmount !== undefined && params.customAmount > 0) {
      amountToPay = params.customAmount;
    } else if (params.paymentOption === 'partial') {
      amountToPay = options.partialAmount || options.totalFee;
    } else {
      amountToPay = options.fullAmount;
    }

    // Check existing payment
    let payment = db.registration_payments.find(p => p.team_id === params.teamId && p.tournament_id === params.tournamentId);
    const now = new Date().toISOString();

    if (payment) {
      // Add to already paid amount
      const newPaid = payment.paid_amount + amountToPay;
      const remaining = Math.max(0, payment.total_fee - newPaid);
      payment.paid_amount = newPaid;
      payment.remaining_amount = remaining;
      payment.status = remaining === 0 ? 'fully_paid' : 'partially_paid';
      payment.payment_method = params.paymentMethod;
      payment.transaction_id = params.transactionId || payment.transaction_id || 'TXN-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      payment.notes = params.notes || payment.notes;
      if (params.recordedByAdmin) {
        payment.recorded_by_admin = true;
        payment.recorded_by_user_id = params.adminUserId;
      }
      payment.updated_at = now;
    } else {
      const remaining = Math.max(0, options.totalFee - amountToPay);
      const status: PaymentStatus = remaining === 0 ? 'fully_paid' : amountToPay > 0 ? 'partially_paid' : 'unpaid';
      const receiptNo = 'REC-' + team.short_name + '-' + Math.floor(1000 + Math.random() * 9000);

      payment = {
        id: 'pay_' + Date.now(),
        team_id: team.id,
        tournament_id: tournament.id,
        organization_id: org.id,
        total_fee: options.totalFee,
        paid_amount: amountToPay,
        remaining_amount: remaining,
        payment_option: params.paymentOption,
        status,
        payment_method: params.paymentMethod,
        transaction_id: params.transactionId || 'TXN-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        receipt_number: receiptNo,
        notes: params.notes,
        recorded_by_admin: Boolean(params.recordedByAdmin),
        recorded_by_user_id: params.adminUserId,
        created_at: now,
        updated_at: now
      };
      db.registration_payments.push(payment);
    }

    // Generate/Update Registration Receipt
    const receiptId = 'rec_' + Date.now();
    const qrSignature = `AUTH-SIG-${team.id}-${payment.receipt_number}-${Date.now().toString(36).toUpperCase()}`;

    const receipt: RegistrationReceipt = {
      id: receiptId,
      payment_id: payment.id,
      team_id: team.id,
      tournament_id: tournament.id,
      organization_id: org.id,
      receipt_number: payment.receipt_number,
      issued_at: now,
      receipt_data: {
        tournament_name: tournament.name,
        organization_name: org.name,
        team_name: team.name,
        manager_name: team.manager_name,
        manager_phone: team.manager_phone,
        total_fee: payment.total_fee,
        paid_amount: payment.paid_amount,
        remaining_balance: payment.remaining_amount,
        payment_method: params.paymentMethod.toUpperCase(),
        transaction_id: payment.transaction_id,
        status: payment.status,
        qr_code_signature: qrSignature
      }
    };
    db.registration_receipts.push(receipt);

    db.logAudit({
      organization_id: org.id,
      user_id: params.adminUserId || team.id,
      user_name: params.recordedByAdmin ? 'Admin / Organizer' : team.manager_name,
      user_role: params.recordedByAdmin ? 'ORG_ADMIN' : 'TEAM_MANAGER',
      action: 'RECORDED_TOURNAMENT_GROUND_FEE',
      entity_type: 'RegistrationPayment',
      entity_id: payment.id,
      details: `Payment of ₹${amountToPay} recorded for team [${team.name}]. Status: ${payment.status}, Remaining: ₹${payment.remaining_amount}`
    });

    db.save();
    return { payment, receipt };
  }
}
