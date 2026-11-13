import axios from 'axios';

/** Empty in development (Vite proxies /api and /uploads); the API origin for a separate deployment. */
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'docbook.token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage blocked: the session lasts until the tab closes */
    }
  }
};

const api = axios.create({ baseURL: `${API_ORIGIN}/api`, timeout: 20000 });

api.interceptors.request.use((cfg) => {
  const token = tokenStore.get();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let onUnauthorized = null;
/** Called when a signed-in request comes back 401 (expired token, deactivated account). */
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && err.config?.headers?.Authorization) onUnauthorized?.(err.response.data?.message);
    return Promise.reject(err);
  }
);

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (err?.message === 'Network Error') return 'Cannot reach the server. Check your connection.';
  return fallback;
};

export const errorCode = (err) => err?.response?.data?.code;

export const assetUrl = (path) => (path ? `${API_ORIGIN}${path}` : null);

/** Response body → its `data` field. */
export const unwrap = (res) => res.data.data;

export default api;

/** Fetches a doctor's certificate with the signed-in token (it is not public) as an object URL. */
export async function certificateUrl(doctorId) {
  const res = await api.get(`/doctors/${doctorId}/certificate`, { responseType: 'blob' });
  return { url: URL.createObjectURL(res.data), type: res.data.type };
}

export async function openCertificate(doctorId) {
  // Open the tab first (synchronously) so pop-up blockers allow it, then point it at the file.
  const win = window.open('', '_blank');
  try {
    const { url } = await certificateUrl(doctorId);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
