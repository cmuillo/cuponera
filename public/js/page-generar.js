/**
 * page-generar.js — Generación de cupones
 */
const PageGenerar = {
  lastCupon: null,

  async render(container) {
    // Cargar sorteos activos
    let sorteos = [];
    try {
      sorteos = await API.get('/api/sorteos?activo=true');
    } catch (e) { /* se maneja abajo */ }

    const sorteoOptions = sorteos.length === 0
      ? '<option value="">— No hay sorteos activos —</option>'
      : ['<option value="">Seleccione un sorteo...</option>',
          ...sorteos.map(s => `<option value="${s.id}" data-nombre="${escHtml(s.nombre)}" data-fecha="${s.fecha_sorteo}" data-desc="${escHtml(s.descripcion||'')}">${escHtml(s.nombre)} — ${formatDate(s.fecha_sorteo)}</option>`)
        ].join('');

    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-plus-circle-fill"></i>Generar Cupón</h1>
      <div class="row g-4 justify-content-center">
        <div class="col-md-8 col-lg-6">
          <div class="card">
            <div class="card-header">Datos del participante</div>
            <div class="card-body p-4">
              <div id="generarAlert" class="d-none"></div>
              <form id="generarForm" autocomplete="off">
                <div class="mb-3">
                  <label class="form-label fw-semibold">Sorteo *</label>
                  <select id="generarSorteo" class="form-select" required>
                    ${sorteoOptions}
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold">Nombre del participante</label>
                  <input type="text" id="generarNombre" class="form-control" placeholder="Opcional" maxlength="255" />
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold">Cédula *</label>
                  <input type="text" id="generarCedula" class="form-control" placeholder="Ej: 12345678" maxlength="25" required />
                </div>
                <div class="mb-4">
                  <label class="form-label fw-semibold">Celular *</label>
                  <div class="input-group">
                    <span class="input-group-text">📱</span>
                    <input type="tel" id="generarCelular" class="form-control" placeholder="Ej: 3001234567" maxlength="20" required />
                  </div>
                  <div class="form-text">Para Colombia: 10 dígitos. El código de país (+57) se agrega automáticamente.</div>
                </div>
                <button type="submit" class="btn btn-primary w-100 py-2" id="generarBtn" ${sorteos.length === 0 ? 'disabled' : ''}>
                  <i class="bi bi-ticket-perforated me-1"></i>Generar Cupón
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- Resultado -->
        <div class="col-md-8 col-lg-6 d-none" id="cuponResultCol">
          <div class="card border-0" style="background: linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
            <div class="card-body p-4 text-center">
              <div class="mb-2" style="font-size:.9rem;opacity:.85;">🎟️ CUPÓN GENERADO</div>
              <div id="resCodigo" style="font-size:2.8rem;font-weight:800;letter-spacing:.1em;line-height:1.1;"></div>
              <div id="resSorteo" class="mt-2" style="font-size:1rem;opacity:.9;"></div>
              <div id="resFecha" style="font-size:.85rem;opacity:.75;"></div>
              <hr style="border-color:rgba(255,255,255,.3);" />
              <div id="resDatos" style="font-size:.9rem;opacity:.9;"></div>
              <div class="mt-4 d-flex gap-2 justify-content-center flex-wrap">
                <a id="btnWaResult" href="#" target="_blank" rel="noopener noreferrer"
                   class="btn btn-whatsapp btn-lg px-4">
                  <i class="bi bi-whatsapp me-1"></i>Enviar por WhatsApp
                </a>
                <button class="btn btn-light btn-lg px-4" onclick="PageGenerar.nuevoForm()">
                  <i class="bi bi-plus me-1"></i>Nuevo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    container.querySelector('#generarForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await PageGenerar.crearCupon();
    });
  },

  async crearCupon() {
    const alertEl = document.getElementById('generarAlert');
    alertEl.classList.add('d-none');
    const btn = document.getElementById('generarBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

    try {
      const cupon = await API.post('/api/cupones', {
        sorteo_id: parseInt(document.getElementById('generarSorteo').value),
        celular: document.getElementById('generarCelular').value.trim(),
        cedula: document.getElementById('generarCedula').value.trim(),
        nombre_persona: document.getElementById('generarNombre').value.trim() || null,
      });

      PageGenerar.lastCupon = cupon;
      PageGenerar.showResult(cupon);
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-ticket-perforated me-1"></i>Generar Cupón';
    }
  },

  showResult(cupon) {
    document.getElementById('resCodigo').textContent = cupon.codigo;
    document.getElementById('resSorteo').textContent = `📋 ${cupon.sorteo_nombre}`;
    document.getElementById('resFecha').textContent = `📅 Sorteo: ${formatDate(cupon.fecha_sorteo)}`;
    document.getElementById('resDatos').innerHTML =
      `👤 ${escHtml(cupon.nombre_persona || 'Sin nombre')} &nbsp;|&nbsp; 🪪 ${escHtml(cupon.cedula)} &nbsp;|&nbsp; 📱 ${escHtml(cupon.celular)}`;

    const waText = buildCuponWaText(cupon);
    document.getElementById('btnWaResult').href = buildWaLink(cupon.celular, waText);

    document.getElementById('cuponResultCol').classList.remove('d-none');
    document.getElementById('generarForm').reset();
    showToast('¡Cupón generado exitosamente!', 'success');
  },

  nuevoForm() {
    document.getElementById('cuponResultCol').classList.add('d-none');
    document.getElementById('generarForm').reset();
    document.getElementById('generarSorteo').focus();
  },
};
