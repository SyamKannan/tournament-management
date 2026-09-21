const API_BASE = '/api';

/** Per-field messages from a 422, keyed by field path (`players.3.jersey_number`). */
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  data: any;
  /** Stable machine code from the server (`VALIDATION_FAILED`, `RATE_LIMITED`, ...). */
  code: string | null;
  /** Per-field messages, present on a validation failure. */
  fieldErrors: FieldErrors;
  /** Seconds to wait before retrying, when the server said so. */
  retryAfter: number | null;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.code = typeof data?.code === 'string' ? data.code : null;
    this.fieldErrors = data && typeof data.errors === 'object' && !Array.isArray(data.errors) ? data.errors : {};
    this.retryAfter = typeof data?.retry_after === 'number' ? data.retry_after : null;
  }

  /** True when nothing reached the server — offline, or it is not answering. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** The first message for a field, or for any field under it (`players.3`). */
  fieldError(path: string): string | undefined {
    if (this.fieldErrors[path]?.length) return this.fieldErrors[path][0];
    const nested = Object.keys(this.fieldErrors).find(key => key.startsWith(`${path}.`));
    return nested ? this.fieldErrors[nested][0] : undefined;
  }
}

/**
 * The sentence to show for a failed response.
 *
 * The server always sends `error`; `message` is the framework's key and the
 * fallback for anything older. A bare status code is never shown to a person —
 * "Request failed with status 422" told nobody what to fix.
 */
function messageFor(status: number, data: any): string {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
  }

  switch (status) {
    case 400: return 'That request could not be completed. Check the details and try again.';
    case 401: return 'Please sign in to continue.';
    case 403: return 'You do not have permission to do that.';
    case 404: return 'That could not be found. It may have been deleted.';
    case 409: return 'That conflicts with a change made elsewhere. Reload and try again.';
    case 413: return 'That file is too large.';
    case 422: return 'Some of the details entered are not valid.';
    case 429: return 'Too many attempts. Please wait a moment and try again.';
    default:
      return status >= 500
        ? 'Something went wrong on our side. Please try again in a moment.'
        : 'The request could not be completed. Please try again.';
  }
}

/**
 * Raised when a held credential is no longer good — the token expired, or the
 * organization was suspended while someone was working. AuthContext listens and
 * ends the session, so the app doesn't sit there looking signed in while every
 * request fails.
 */
export const SESSION_ENDED_EVENT = 'kickwick:session-ended';

function endSession(reason: string) {
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: { reason } }));
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('sports_saas_token');
  const demoRole = localStorage.getItem('sports_saas_demo_role');
  const demoOrgId = localStorage.getItem('sports_saas_demo_org_id');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (demoRole) {
    headers['x-demo-role'] = demoRole;
    if (demoOrgId) headers['x-demo-org-id'] = demoOrgId;
  }

  let res: Response;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  } catch {
    // Offline, or the API is not answering. "Failed to fetch" means nothing to
    // an organizer standing on a touchline.
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (token) {
      if (res.status === 401) {
        endSession('Your session has expired. Please sign in again.');
      } else if (typeof data?.code === 'string' && data.code.startsWith('ORGANIZATION_')) {
        endSession(data.error);
      }
    }

    throw new ApiError(messageFor(res.status, data), res.status, typeof data === 'object' ? data : undefined);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any) => apiRequest<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(endpoint: string, body?: any) => apiRequest<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' })
};
