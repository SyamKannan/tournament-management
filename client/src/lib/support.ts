import { api } from '../services/api';

/** Help & Support: a club's tickets to the platform, and the admin's inbox. */

export type SupportCategory = 'billing' | 'account_access' | 'bug' | 'tournament_help' | 'feature_request' | 'other';
export type SupportStatus = 'open' | 'awaiting_reply' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  reference: string;
  category: SupportCategory;
  priority: 'normal' | 'urgent';
  status: SupportStatus;
  subject: string;
  /** Unread by whoever is looking — the club, or the platform. */
  unread: boolean;
  last_message_at: string | null;
  resolved_at: string | null;
  created_at: string;
  // Admin side only.
  organization_id?: string | null;
  organization_name?: string | null;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  assigned_to?: string | null;
  context?: Record<string, string>;
}

export interface SupportMessage {
  id: string;
  author_name: string;
  author_side: 'user' | 'admin';
  body: string;
  attachments: string[];
  created_at: string;
  is_internal?: boolean;
}

export interface SupportThread {
  ticket: SupportTicket;
  messages: SupportMessage[];
  matched_accounts?: {
    id: string;
    name: string;
    email: string;
    role: string;
    organization_id: string | null;
    organization_name: string | null;
  }[];
}

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  billing: 'Billing & payments',
  account_access: "Can't sign in",
  bug: 'Something is broken',
  tournament_help: 'Help running a tournament',
  feature_request: 'Idea or request',
  other: 'Something else',
};

/** The same status reads differently depending on who is waiting on whom. */
export const STATUS_LABELS: Record<'club' | 'admin', Record<SupportStatus, string>> = {
  club: {
    open: 'Waiting on KickWick',
    awaiting_reply: 'Reply from KickWick',
    resolved: 'Resolved',
    closed: 'Closed',
  },
  admin: {
    open: 'Needs a reply',
    awaiting_reply: 'Waiting on club',
    resolved: 'Resolved',
    closed: 'Closed',
  },
};

export const STATUS_TONES: Record<SupportStatus, string> = {
  open: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  awaiting_reply: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  closed: 'bg-slate-700/40 text-slate-400 ring-slate-600/40',
};

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

/** Screenshots go to the support folder, which never counts against a club's storage. */
export async function uploadScreenshot(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Attach a screenshot (JPG, PNG, GIF or WEBP).');
  if (file.size > 10 * 1024 * 1024) throw new Error('That image is larger than 10 MB.');
  const res = await api.post<{ url: string }>('/upload', { base64: await readAsDataUrl(file), folder: 'support' });
  return res.url;
}

export const formatWhen = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** Tells the sidebar badge to look again after a ticket was read or changed. */
export const notifySupportChanged = () => window.dispatchEvent(new Event('support:changed'));
