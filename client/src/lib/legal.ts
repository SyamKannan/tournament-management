/** Terms & Conditions and Privacy Policy — what the server calls `terms` and `privacy`. */
export type LegalType = 'terms' | 'privacy';

export const LEGAL_TYPES: LegalType[] = ['terms', 'privacy'];

export const LEGAL_TITLES: Record<LegalType, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
};

export const LEGAL_PATHS: Record<LegalType, string> = {
  terms: '/terms',
  privacy: '/privacy',
};

export interface LegalDocument {
  type: LegalType;
  version: number;
  title: string;
  /** Markdown: `##`/`###` headings, `-` lists, `**bold**`, paragraphs. */
  body: string;
  summary_of_changes: string;
  requires_reacceptance: boolean;
  published_at: string | null;
}

export interface PublicLegalDocument extends LegalDocument {
  versions: { version: number; published_at: string | null; summary_of_changes: string }[];
}

export interface AdminLegalVersion extends LegalDocument {
  published_by_name: string;
  acceptances: number;
}

export interface AdminLegalSummary {
  required_version: number | null;
  coverage: { accepted: number; total: number };
  versions: AdminLegalVersion[];
}

export interface LegalAcceptanceRow {
  id: number;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  organization_id: string | null;
  method: 'signup' | 'prompt';
  ip_address: string;
  accepted_at: string | null;
}

/**
 * Raised by the API wrapper when the server refuses a request because this
 * account owes an acceptance. TermsGate listens and puts the documents up.
 */
export const TERMS_REQUIRED_EVENT = 'kickwick:terms-required';
