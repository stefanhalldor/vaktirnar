export function trackEvent(event_type: string, opts?: { idea_id?: string }) {
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type,
      path: window.location.pathname,
      idea_id: opts?.idea_id,
      referrer: document.referrer || undefined,
    }),
    keepalive: true,
  }).catch(() => {})
}
