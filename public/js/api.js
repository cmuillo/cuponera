/**
 * api.js — Wrapper de fetch con JWT automático
 */
const API = {
  getToken() {
    return localStorage.getItem('token');
  },

  headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getToken()}`,
      ...extra,
    };
  },

  async request(method, url, body) {
    const opts = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);

    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.replace('/login.html');
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      return data;
    }

    if (!res.ok) throw new Error('Error del servidor');
    return res;
  },

  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body) { return this.request('PUT', url, body); },
  patch(url, body) { return this.request('PATCH', url, body); },
  delete(url) { return this.request('DELETE', url); },

  /** Descarga un PDF (devuelve blob y abre en nueva pestaña) */
  async downloadPDF(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.getToken()}` } });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.location.replace('/login.html');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al generar PDF');
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 30000);
  },
};
