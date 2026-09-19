const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
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

    throw new ApiError(data?.error || `Request failed with status ${res.status}`, res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any) => apiRequest<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(endpoint: string, body?: any) => apiRequest<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' })
};
