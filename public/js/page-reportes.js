/**
 * page-reportes.js — Estadísticas y PDF
 */
const PageReportes = {
  async render(container) {
    let sorteos = [];
    try { sorteos = await API.get('/api/sorteos'); } catch(e) {}

    const sorteoOpts = ['<option value="">Todos los sorteos</option>',
      ...sorteos.map(s => `<option value="${s.id}">${escHtml(s.nombre)}</option>`)
    ].join('');

    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-bar-chart-fill"></i>Reportes</h1>

      <!-- Filtros -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-sm-4">
              <label class="form-label small fw-semibold">Sorteo</label>
              <select id="rptSorteo" class="form-select form-select-sm">${sorteoOpts}</select>
            </div>
            <div class="col-sm-4">
              <label class="form-label small fw-semibold">Buscar por cédula o celular</label>
              <input type="text" id="rptBuscar" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-2">
              <button class="btn btn-primary btn-sm w-100" onclick="PageReportes.loadStats()">
                <i class="bi bi-search me-1"></i>Buscar
              </button>
            </div>
            <div class="col-sm-2">
              <button class="btn btn-danger btn-sm w-100" id="btnPdf" onclick="PageReportes.descargarPDF()" title="Generar PDF de cupones para tómbola">
                <i class="bi bi-file-earmark-pdf me-1"></i>PDF Cupones
              </button>
            </div>
          </div>
          <div class="form-text mt-1">
            <i class="bi bi-info-circle me-1"></i>
            El botón <strong>PDF Cupones</strong> genera la hoja de cupones para imprimir y tómbola física (requiere seleccionar un sorteo).
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="row g-3 mb-4" id="statsCards">
        <div class="col-6 col-md-3">
          <div class="stat-card">
            <div class="stat-num" id="statTotalCupones">—</div>
            <div class="stat-label">Total cupones</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card">
            <div class="stat-num" id="statPersonas">—</div>
            <div class="stat-label">Participantes únicos</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card">
            <div class="stat-num" id="statMax">—</div>
            <div class="stat-label">Máx. cupones/persona</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="stat-card">
            <div class="stat-num" id="statAvg">—</div>
            <div class="stat-label">Promedio cupones</div>
          </div>
        </div>
      </div>

      <!-- Tabla por persona -->
      <div class="card">
        <div class="card-header">Resumen por participante</div>
        <div class="card-body p-0">
          <div id="rptTable" class="p-3">
            <div class="d-flex justify-content-center py-4">
              <div class="spinner-border text-primary"></div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('rptBuscar').addEventListener('keypress', e => {
      if (e.key === 'Enter') PageReportes.loadStats();
    });

    await PageReportes.loadStats();
  },

  async loadStats() {
    const el = document.getElementById('rptTable');
    el.innerHTML = '<div class="d-flex justify-content-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    const params = new URLSearchParams();
    const sorteoId = document.getElementById('rptSorteo').value;
    const buscar = document.getElementById('rptBuscar').value.trim();
    if (sorteoId) params.set('sorteoId', sorteoId);
    if (buscar) params.set('buscar', buscar);

    try {
      const data = await API.get(`/api/reportes/estadisticas?${params.toString()}`);

      // Calcular stats globales
      const totalCupones = data.reduce((a, b) => a + parseInt(b.total_cupones), 0);
      const personas = data.length;
      const max = data.length > 0 ? Math.max(...data.map(d => parseInt(d.total_cupones))) : 0;
      const avg = personas > 0 ? (totalCupones / personas).toFixed(1) : 0;

      document.getElementById('statTotalCupones').textContent = totalCupones;
      document.getElementById('statPersonas').textContent = personas;
      document.getElementById('statMax').textContent = max;
      document.getElementById('statAvg').textContent = avg;

      if (data.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="bi bi-graph-up"></i>No hay datos para mostrar.</div>';
        return;
      }

      el.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Participante</th>
                <th>Cédula</th>
                <th>Celular</th>
                <th>Sorteo</th>
                <th class="text-center">Cupones</th>
                <th>Códigos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td class="fw-semibold">${escHtml(row.nombre_persona || '—')}</td>
                  <td>${escHtml(row.cedula)}</td>
                  <td>${escHtml(row.celular)}</td>
                  <td>
                    <span class="d-inline-block text-truncate" style="max-width:120px" title="${escHtml(row.sorteo_nombre)}">
                      ${escHtml(row.sorteo_nombre)}
                    </span><br>
                    <small class="text-muted">${formatDate(row.fecha_sorteo)}</small>
                  </td>
                  <td class="text-center">
                    <span class="badge bg-primary rounded-pill fs-6">${row.total_cupones}</span>
                  </td>
                  <td>
                    <div class="d-flex flex-wrap gap-1">
                      ${(row.codigos || []).map(cod =>
                        `<code class="small text-primary">${escHtml(cod)}</code>`
                      ).join(', ')}
                    </div>
                  </td>
                  <td>
                    <a href="${buildWaLink(row.celular, PageReportes.buildResumenWa(row))}"
                       target="_blank" rel="noopener noreferrer"
                       class="btn btn-whatsapp btn-sm" title="Enviar resumen por WhatsApp">
                      <i class="bi bi-whatsapp"></i>
                    </a>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger m-2">${err.message}</div>`;
    }
  },

  buildResumenWa(row) {
    const codigos = (row.codigos || []).join('\n• ');
    return `📊 *Resumen de cupones — ${row.sorteo_nombre}*\n\n` +
      `👤 ${row.nombre_persona || 'Participante'}\n` +
      `🪪 Cédula: ${row.cedula}\n` +
      `📱 Celular: ${row.celular}\n\n` +
      `🎟️ Tienes *${row.total_cupones}* cupón(es) registrado(s):\n• ${codigos}\n\n` +
      `📅 Fecha del sorteo: ${formatDate(row.fecha_sorteo)}\n\n¡Mucha suerte! 🍀`;
  },

  async descargarPDF() {
    const sorteoId = document.getElementById('rptSorteo').value;
    if (!sorteoId) {
      showToast('Seleccione un sorteo para generar el PDF', 'warning');
      return;
    }
    const btn = document.getElementById('btnPdf');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando...';
    try {
      await API.downloadPDF(`/api/reportes/pdf/${sorteoId}`);
      showToast('PDF generado. Revise las pestañas del navegador.', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-file-earmark-pdf me-1"></i>PDF Cupones';
    }
  },
};
