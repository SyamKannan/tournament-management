/** Same base the api client uses — requests go through the Vite dev proxy. */
const API_BASE = '/api';

/**
 * Pulls a file from the API and hands it to the browser as a download.
 *
 * A plain `<a href>` cannot be used for the organizer-only exports: they need
 * the bearer token, and an anchor sends no Authorization header. So the file is
 * fetched, turned into a blob and clicked programmatically — which also means a
 * 403 surfaces as a thrown error rather than as a downloaded error page.
 */
export const downloadFile = async (path: string, fallbackName: string): Promise<void> => {
  const token = localStorage.getItem('sports_saas_token');

  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? 'You do not have access to that download.'
        : res.status === 404
          ? 'There is nothing to export yet.'
          : 'That download failed. Please try again.'
    );
  }

  // Prefer the name the server chose; it carries the tournament and the date.
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Releasing it immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Opens a printable page in a new tab — the scorecard's "save as PDF" route. */
export const openPrintable = (path: string): void => {
  window.open(`${API_BASE}${path}`, '_blank', 'noopener,noreferrer');
};
