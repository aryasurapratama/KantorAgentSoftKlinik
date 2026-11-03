// Shared by the standalone 2D/3D documents as well as embedded views.
let session;
async function ensureSession() {
  session ||= fetch('/api/session', { credentials: 'same-origin', headers: { 'X-Harmes-Bootstrap': '1' } }).then(response => {
    if (!response.ok) throw new Error('Sesi kantor gagal dimulai. Muat ulang aplikasi.');
    return response.json();
  }).catch(error => { session = null; throw error; });
  return session;
}
export async function officeFetch(url, options, retry = true) {
  const { csrfToken } = await ensureSession();
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { ...options?.headers, ...(options?.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) } });
  if (response.status === 401 && retry) { session = null; return officeFetch(url, options, false); }
  return response;
}
