/**
 * inscripcion.js — Ventana pública de inscripción (sin autenticación)
 */
const Inscripcion = {
  sorteoId: null,
  sorteo: null,
  config: { whatsapp_comprobantes: '', paquetes_cupones: [] },
  cedulaVerificada: null,
  cedulaInscrita: null,

  async init() {
    const params = new URLSearchParams(location.search);
    this.sorteoId = parseInt(params.get('sorteo'), 10);

    if (!Number.isInteger(this.sorteoId)) {
      return this.fatal('El enlace es inválido: falta el identificador de la actividad.');
    }

    try {
      const [sorteo, config] = await Promise.all([
        this.get(`/api/inscripciones/sorteo/${this.sorteoId}`),
        this.get('/api/config/publica').catch(() => ({ whatsapp_comprobantes: '', paquetes_cupones: [] })),
      ]);
      this.sorteo = sorteo;
      this.config = config;
    } catch (err) {
      return this.fatal(err.message);
    }

    this.renderHeader();
    document.getElementById('inscBody').classList.remove('d-none');

    if (this.sorteo.restringir_padron) {
      document.getElementById('inscPadronHint').innerHTML =
        '<i class="bi bi-shield-check me-1"></i>Esta actividad es solo para personas del listado autorizado. Su cédula será validada.';
    }

    document.getElementById('inscForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.inscribir();
    });
    document.getElementById('compraVerifyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.verificarCedula();
    });
  },

  // ---- RENDER ----

  renderHeader() {
    document.getElementById('inscHeader').innerHTML = `
      <h1 class="h3 fw-bold mb-1">${escHtml(this.sorteo.nombre)}</h1>
      <div class="text-muted"><i class="bi bi-calendar3 me-1"></i>${formatDate(this.sorteo.fecha_sorteo)}</div>
      ${this.sorteo.descripcion ? `<p class="text-muted small mt-2 mb-0">${escHtml(this.sorteo.descripcion)}</p>` : ''}`;
  },

  fatal(msg) {
    document.getElementById('inscHeader').innerHTML = '<h1 class="h3 fw-bold">🎟️ Cuponera</h1>';
    const el = document.getElementById('inscFatal');
    el.textContent = msg;
    el.classList.remove('d-none');
  },

  // ---- TAB 1: INSCRIPCIÓN ----

  async inscribir() {
    const alertEl = document.getElementById('inscAlert');
    alertEl.classList.add('d-none');
    const btn = document.getElementById('inscBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';

    try {
      const data = await this.post('/api/inscripciones', {
        sorteo_id: this.sorteoId,
        nombre: document.getElementById('inscNombre').value.trim(),
        cedula: document.getElementById('inscCedula').value.trim(),
        celular: document.getElementById('inscCelular').value.trim(),
        acompanante: document.getElementById('inscAcompanante').checked,
      });

      document.getElementById('inscForm').classList.add('d-none');
      this.cedulaInscrita = data.inscripcion.cedula;
      const res = document.getElementById('inscResult');
      res.classList.remove('d-none');
      res.innerHTML = `
        <div class="text-center">
          <div class="display-6 mb-2">✅</div>
          <h2 class="h5 fw-bold">¡Inscripción completada!</h2>
          <p class="text-muted small">Guarde su número de cupón.</p>
          ${this.cuponesHtml(data.cupones)}
          <div class="alert alert-light border mt-3 text-start small mb-3">
            <div><strong>Nombre:</strong> ${escHtml(data.inscripcion.nombre)}</div>
            <div><strong>Cédula:</strong> ${escHtml(data.inscripcion.cedula)}</div>
            <div><strong>Teléfono:</strong> ${escHtml(data.inscripcion.celular)}</div>
            <div><strong>Acompañante:</strong> ${data.inscripcion.acompanante ? 'Sí' : 'No'}</div>
          </div>
          <button class="btn btn-outline-primary" onclick="Inscripcion.irACompra()">
            <i class="bi bi-cart-plus me-1"></i>Comprar cupones adicionales
          </button>
        </div>`;
      showToast('Inscripción registrada correctamente', 'success');
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-ticket-perforated me-1"></i>Inscribirme y generar mi cupón';
    }
  },

  irACompra() {
    document.querySelector('[data-bs-target="#tabCompra"]').click();
    document.getElementById('compraCedula').value = this.cedulaInscrita || '';
    this.verificarCedula();
  },

  // ---- TAB 2: COMPRA ----

  async verificarCedula() {
    const alertEl = document.getElementById('compraAlert');
    const paquetesEl = document.getElementById('compraPaquetes');
    const resultEl = document.getElementById('compraResult');
    alertEl.classList.add('d-none');
    paquetesEl.classList.add('d-none');
    resultEl.classList.add('d-none');
    resultEl.innerHTML = '';

    const cedula = document.getElementById('compraCedula').value.trim();
    if (!cedula) return;

    const btn = document.getElementById('compraVerifyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
      const estado = await this.get(
        `/api/inscripciones/estado?sorteo_id=${this.sorteoId}&cedula=${encodeURIComponent(cedula)}`
      );
      if (!estado.inscrito) {
        alertEl.className = 'alert alert-warning';
        alertEl.innerHTML =
          '<i class="bi bi-exclamation-triangle me-1"></i>Esta cédula aún no está inscrita. ' +
          'Complete primero la pestaña <strong>Inscripción</strong>.';
        alertEl.classList.remove('d-none');
        this.cedulaVerificada = null;
        return;
      }

      this.cedulaVerificada = cedula;
      this.renderPaquetes(estado);
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
      this.cedulaVerificada = null;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-search me-1"></i>Verificar';
    }
  },

  renderPaquetes(estado) {
    const el = document.getElementById('compraPaquetes');
    const paquetes = this.config.paquetes_cupones || [];

    if (paquetes.length === 0) {
      el.innerHTML = '<div class="alert alert-warning mb-0">No hay paquetes de cupones configurados por el momento.</div>';
      el.classList.remove('d-none');
      return;
    }

    el.innerHTML = `
      <div class="alert alert-success py-2 small">
        <i class="bi bi-check-circle-fill me-1"></i>
        Inscripción encontrada: <strong>${escHtml(estado.nombre || '')}</strong>
        — ${estado.cupones.length} cupón(es) registrado(s).
      </div>
      <label class="form-label fw-semibold">Seleccione un paquete</label>
      <div class="row g-2 mb-3">
        ${paquetes.map((p, i) => `
          <div class="col-12 col-sm-4">
            <input type="radio" class="btn-check" name="paqueteCupon" id="paq${i}" value="${p.monto}" ${i === 0 ? 'checked' : ''} />
            <label class="btn btn-outline-primary w-100 py-3" for="paq${i}">
              <div class="fw-bold fs-5">₡${formatColones(p.monto)}</div>
              <div class="small">${p.cupones} ${p.cupones === 1 ? 'cupón' : 'cupones'}</div>
            </label>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary w-100 py-2" id="compraGenerarBtn" onclick="Inscripcion.comprar()">
        <i class="bi bi-ticket-perforated me-1"></i>Generar cupones
      </button>`;
    el.classList.remove('d-none');
  },

  async comprar() {
    const alertEl = document.getElementById('compraAlert');
    alertEl.classList.add('d-none');
    const seleccion = document.querySelector('input[name="paqueteCupon"]:checked');
    if (!seleccion || !this.cedulaVerificada) return;

    const btn = document.getElementById('compraGenerarBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

    try {
      const data = await this.post('/api/inscripciones/compra', {
        sorteo_id: this.sorteoId,
        cedula: this.cedulaVerificada,
        monto: parseInt(seleccion.value, 10),
      });
      this.renderCompraResult(data);
      showToast('Cupones generados. Envíe su comprobante de pago.', 'success');
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-ticket-perforated me-1"></i>Generar cupones';
    }
  },

  renderCompraResult(data) {
    document.getElementById('compraPaquetes').classList.add('d-none');
    const el = document.getElementById('compraResult');

    const numero = data.whatsapp_comprobantes;
    const texto =
      `🧾 *Comprobante de pago — ${data.sorteo.nombre}*\n\n` +
      `👤 ${data.inscripcion.nombre}\n` +
      `🪪 Cédula: ${data.inscripcion.cedula}\n` +
      `📱 Teléfono: ${data.inscripcion.celular}\n` +
      `💵 Monto: ₡${formatColones(data.paquete.monto)}\n` +
      `🎟️ Cupones generados (${data.cupones.length}):\n• ${data.cupones.map(c => c.codigo).join('\n• ')}\n\n` +
      `Adjunto el comprobante de pago. ¡Gracias!`;

    const botonComprobante = numero
      ? `<a href="${buildWaLink(numero, texto)}" target="_blank" rel="noopener noreferrer"
            class="btn btn-success btn-lg w-100 py-3">
           <i class="bi bi-whatsapp me-2"></i>Enviar comprobante
         </a>`
      : `<div class="alert alert-warning mb-0">
           No hay un número de WhatsApp configurado para recibir comprobantes. Contacte a la organización.
         </div>`;

    el.innerHTML = `
      <div class="text-center">
        <div class="display-6 mb-2">🎟️</div>
        <h2 class="h5 fw-bold">${data.cupones.length} cupón(es) generado(s)</h2>
        ${this.cuponesHtml(data.cupones)}
        <div class="alert alert-warning text-start small mt-3">
          <i class="bi bi-exclamation-triangle-fill me-1"></i>
          Sus cupones quedan <strong>pendientes de confirmación de pago</strong>.
          Envíe el comprobante por WhatsApp para activarlos.
        </div>
        ${botonComprobante}
        <button class="btn btn-link mt-2" onclick="Inscripcion.verificarCedula()">
          Comprar otro paquete
        </button>
      </div>`;
    el.classList.remove('d-none');
  },

  cuponesHtml(cupones) {
    if (cupones.length === 1) {
      return `<div class="my-3" style="font-size:2.4rem;font-weight:800;letter-spacing:.08em;color:#4f46e5;">
                ${escHtml(cupones[0].codigo)}
              </div>`;
    }
    return `<div class="d-flex flex-wrap gap-2 justify-content-center my-3">
              ${cupones.map(c => `<span class="badge bg-primary fs-6">${escHtml(c.codigo)}</span>`).join('')}
            </div>`;
  },

  // ---- HTTP ----

  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error del servidor.');
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
};

// ---- Utilidades locales (la ventana pública no carga main.js) ----

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).substring(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatColones(n) {
  return String(parseInt(n, 10) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function normalizePhone(cel) {
  const digits = String(cel).replace(/\D/g, '');
  if (digits.startsWith('506') && digits.length >= 11) return digits;
  if (digits.length === 8) return '506' + digits;
  return digits;
}

function buildWaLink(celular, text) {
  return `https://wa.me/${normalizePhone(celular)}?text=${encodeURIComponent(text)}`;
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('appToast');
  el.className = `toast align-items-center border-0 text-bg-${type}`;
  document.getElementById('toastMsg').textContent = msg;
  new bootstrap.Toast(el, { delay: 3500 }).show();
}

Inscripcion.init();
