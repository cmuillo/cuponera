/**
 * page-generar.js — Generación de cupones (con monto de venta y multi-cupón)
 */
const PageGenerar = {
  sorteos: [],

  async render(container) {
    try {
      PageGenerar.sorteos = await API.get('/api/sorteos?activo=true');
    } catch (e) { PageGenerar.sorteos = []; }

    const sorteos = PageGenerar.sorteos;
    const sorteoOptions = sorteos.length === 0
      ? '<option value="">— No hay sorteos activos —</option>'
      : ['<option value="">Seleccione un sorteo...</option>',
          ...sorteos.map(s =>
            `<option value="${s.id}" data-monto="${s.monto_minimo || 0}">${escHtml(s.nombre)} — ${formatDate(s.fecha_sorteo)}</option>`)
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
                  <select id="generarSorteo" class="form-select" required onchange="PageGenerar.onSorteoChange()">
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
                <div class="mb-3">
                  <label class="form-label fw-semibold">Celular *</label>
                  <div class="input-group">
                    <span class="input-group-text">📱</span>
                    <input type="tel" id="generarCelular" class="form-control" placeholder="Ej: 88001234" maxlength="20" required />
                  </div>
                  <div class="form-text">Para Costa Rica: 8 dígitos. El código de país (+506) se agrega automáticamente.</div>
                </div>
                <!-- Monto de venta (visible solo si el sorteo tiene monto mínimo) -->
                <div class="mb-3 d-none" id="montoVentaGroup">
                  <label class="form-label fw-semibold">Monto de venta *</label>
                  <div class="input-group">
                    <span class="input-group-text">₡</span>
                    <input type="number" id="generarMonto" class="form-control" min="0" step="500"
                           placeholder="Ej: 45000" oninput="PageGenerar.updatePreview()" />
                  </div>
                  <!-- Preview de cupones -->
                  <div id="cuponesPreview" class="mt-2 d-none">
                    <div class="alert alert-info py-2 mb-0 d-flex align-items-center gap-2">
                      <i class="bi bi-ticket-perforated-fill fs-5"></i>
                      <span id="previewText"></span>
                    </div>
                  </div>
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
              <div id="resHeader" class="mb-2" style="font-size:.95rem;opacity:.85;font-weight:600;"></div>
              <div id="resCodigos"></div>
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

  onSorteoChange() {
    const sel = document.getElementById('generarSorteo');
    const opt = sel.options[sel.selectedIndex];
    const montoMin = parseInt(opt?.dataset?.monto || '0');
    const group = document.getElementById('montoVentaGroup');
    const montoInput = document.getElementById('generarMonto');
    if (montoMin > 0) {
      group.classList.remove('d-none');
      montoInput.setAttribute('required', 'required');
    } else {
      group.classList.add('d-none');
      montoInput.removeAttribute('required');
      document.getElementById('cuponesPreview').classList.add('d-none');
    }
    PageGenerar.updatePreview();
  },

  updatePreview() {
    const sel = document.getElementById('generarSorteo');
    const opt = sel.options[sel.selectedIndex];
    const montoMin = parseInt(opt?.dataset?.monto || '0');
    const montoVenta = parseInt(document.getElementById('generarMonto')?.value || '0');
    const preview = document.getElementById('cuponesPreview');
    const previewText = document.getElementById('previewText');
    if (!montoMin || !montoVenta) { preview.classList.add('d-none'); return; }
    const cantidad = Math.floor(montoVenta / montoMin);
    if (cantidad < 1) {
      previewText.innerHTML = `<strong class="text-danger">Monto insuficiente.</strong> Se necesitan al menos ₡${montoMin.toLocaleString()} por cupón.`;
    } else {
      previewText.innerHTML = `Se generarán <strong>${cantidad} cupón${cantidad > 1 ? 'es' : ''}</strong> (₡${montoMin.toLocaleString()} c/u)`;
    }
    preview.classList.remove('d-none');
  },

  async crearCupon() {
    const alertEl = document.getElementById('generarAlert');
    alertEl.classList.add('d-none');
    const btn = document.getElementById('generarBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

    try {
      const cupones = await API.post('/api/cupones', {
        sorteo_id: parseInt(document.getElementById('generarSorteo').value),
        celular: document.getElementById('generarCelular').value.trim(),
        cedula: document.getElementById('generarCedula').value.trim(),
        nombre_persona: document.getElementById('generarNombre').value.trim() || null,
        monto_venta: parseInt(document.getElementById('generarMonto')?.value || '0'),
      });

      PageGenerar.showResult(cupones);
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-ticket-perforated me-1"></i>Generar Cupón';
    }
  },

  showResult(cupones) {
    // cupones es siempre un array
    const c = cupones[0];
    const cantidad = cupones.length;

    document.getElementById('resHeader').textContent =
      `🎟️ ${cantidad === 1 ? 'CUPÓN GENERADO' : `${cantidad} CUPONES GENERADOS`}`;

    // Mostrar códigos
    if (cantidad === 1) {
      document.getElementById('resCodigos').innerHTML =
        `<div style="font-size:2.8rem;font-weight:800;letter-spacing:.1em;line-height:1.1;">${escHtml(c.codigo)}</div>`;
    } else {
      const grid = cupones.map(cu =>
        `<span class="badge bg-white text-primary fw-bold" style="font-size:1rem;letter-spacing:.05em;">${escHtml(cu.codigo)}</span>`
      ).join(' ');
      document.getElementById('resCodigos').innerHTML =
        `<div class="d-flex flex-wrap gap-2 justify-content-center my-2">${grid}</div>`;
    }

    document.getElementById('resSorteo').textContent = `📋 ${c.sorteo_nombre}`;
    document.getElementById('resFecha').textContent = `📅 Sorteo: ${formatDate(c.fecha_sorteo)}`;
    document.getElementById('resDatos').innerHTML =
      `👤 ${escHtml(c.nombre_persona || 'Sin nombre')} &nbsp;|&nbsp; 🪪 ${escHtml(c.cedula)} &nbsp;|&nbsp; 📱 ${escHtml(c.celular)}`;

    // Mensaje WhatsApp con todos los códigos
    const codigos = cupones.map(cu => cu.codigo).join('\n• ');
    const waText = `🎟️ *¡Tus cupones han sido registrados!*\n\n` +
      `📋 Sorteo: *${c.sorteo_nombre}*\n` +
      `📅 Fecha del sorteo: ${formatDate(c.fecha_sorteo)}\n` +
      `🎫 ${cantidad === 1 ? 'Número de cupón' : `Tus ${cantidad} cupones`}:\n• ${codigos}\n` +
      `👤 Titular: ${c.nombre_persona || 'Participante'}\n` +
      `🪪 Cédula: ${c.cedula}\n` +
      `📱 Celular: ${c.celular}\n` +
      (c.sorteo_descripcion ? `\nℹ️ ${c.sorteo_descripcion}\n` : '') +
      `\n¡Mucha suerte! 🍀`;

    document.getElementById('btnWaResult').href = buildWaLink(c.celular, waText);
    document.getElementById('cuponResultCol').classList.remove('d-none');
    document.getElementById('generarForm').reset();
    document.getElementById('montoVentaGroup').classList.add('d-none');
    document.getElementById('cuponesPreview').classList.add('d-none');
    showToast(`¡${cantidad} cupón${cantidad > 1 ? 'es generados' : ' generado'} exitosamente!`, 'success');
  },

  nuevoForm() {
    document.getElementById('cuponResultCol').classList.add('d-none');
    document.getElementById('generarForm').reset();
    document.getElementById('montoVentaGroup').classList.add('d-none');
    document.getElementById('cuponesPreview').classList.add('d-none');
    document.getElementById('generarSorteo').focus();
  },
};

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
