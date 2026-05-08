const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'dfs_token';
const DB_SLOT_KEY = 'dfs_db_slot';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getDbSlot() {
  const slot = localStorage.getItem(DB_SLOT_KEY);
  return slot === 'db2' ? 'db2' : 'db1';
}

export function setDbSlot(slot) {
  const normalized = slot === 'db2' ? 'db2' : 'db1';
  localStorage.setItem(DB_SLOT_KEY, normalized);
}

/**
 * @param {string} path - e.g. "/tables"
 * @param {RequestInit & { json?: unknown }} opts
 */
export async function api(path, opts = {}) {
  const { json, ...rest } = opts;
  const headers = { ...(rest.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  headers['x-database-slot'] = getDbSlot();

  let body = rest.body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers, body });
  if (res.status === 401) {
    clearToken();
    if (!path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('dfs-auth-lost'));
    }
  }
  return res;
}

export async function apiJson(path, opts = {}) {
  const res = await api(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export { API_BASE };
