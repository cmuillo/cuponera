/**
 * page-historial.js — Historial de cupones
 */
const PageHistorial = {
  async render(container) {
    let sorteos = [];
    try { sorteos = await API.get('/api/sorteos'); } catch(e) {}

    const sorteoOpts = ['<option value="">Todos los sorteos</option>',
      ...sorteos.map(s => `<option value="${s.id}">${escHtml(s.nombre)}</option>`)
    ].join('');

    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-clock-history"></i>Historial de Cupones</h1>
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-sm-4">
              <label class="form-label small fw-semibold">Sorteo</label>
              <select id="filtroSorteo" class="form-select form-select-sm">${sorteoOpts}</select>
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Cédula</label>
              <input type="text" id="filtroCedula" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Celular</label>
              <input type="text" id="filtroCelular" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-2">
              <button class="btn btn-primary btn-sm w-100" onclick="PageHistorial.loadCupones()">
                <i class="bi bi-search me-1"></i>Buscar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>Cupones <span id="cuponesCount" class="badge bg-primary ms-1">—</span></span>
        </div>
        <div class="card-body p-0">
          <div id="historialTable" class="p-3">
            <div class="d-flex justify-content-center py-4">
              <div class="spinner-border text-primary"></div>
            </div>
          </div>
        </div>
      </div>`;

    // Búsqueda con Enter
    ['filtroCedula','filtroCelular'].forEach(id => {
      document.getElementById(id).addEventListener('keypress', e => {
        if (e.key === 'Enter') PageHistorial.loadCupones();
      });
    });

    await PageHistorial.loadCupones();
  },

  async loadCupones() {
    const el = document.getElementById('historialTable');
    const countEl = document.getElementById('cuponesCount');
    el.innerHTML = '<div class="d-flex justify-content-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    const params = new URLSearchParams();
    const sorteoId = document.getElementById('filtroSorteo').value;
    const cedula = document.getElementById('filtroCedula').value.trim();
    const celular = document.getElementById('filtroCelular').value.trim();
    if (sorteoId) params.set('sorteoId', sorteoId);
    if (cedula) params.set('cedula', cedula);
    if (celular) params.set('celular', celular);

    try {
      const cupones = await API.get(`/api/cupones?${params.toString()}`);
      countEl.textContent = cupones.length;

      if (cupones.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="bi bi-search"></i>No se encontraron cupones.</div>';
        return;
      }

      el.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Código</th>
                <th>Sorteo</th>
                <th>Titular</th>
                <th>Cédula</th>
                <th>Celular</th>
                <th>Fecha reg.</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${cupones.map(c => `
                <tr>
                  <td><code class="fw-bold text-primary">${escHtml(c.codigo)}</code>
                    ${c.ganador ? '<span class="badge bg-warning text-dark ms-1"><i class="bi bi-trophy-fill"></i> Ganador</span>' : ''}
                  </td>
                  <td><span class="d-inline-block text-truncate" style="max-width:130px" title="${escHtml(c.sorteo_nombre)}">${escHtml(c.sorteo_nombre)}</span></td>
                  <td>${escHtml(c.nombre_persona || '—')}</td>
                  <td>${escHtml(c.cedula)}</td>
                  <td>${escHtml(c.celular)}</td>
                  <td class="text-muted small">${new Date(c.created_at).toLocaleDateString('es-ES')}</td>
                  <td>
                    <a href="${buildWaLink(c.celular, buildCuponWaText(c))}" target="_blank" rel="noopener noreferrer"
                       class="btn btn-whatsapp btn-sm me-1" title="Enviar por WhatsApp">
                      <i class="bi bi-whatsapp"></i>
                    </a>
                    <button class="btn btn-outline-danger btn-sm" title="Eliminar cupón"
                      onclick="PageHistorial.deleteCupon(${c.id}, '${escHtml(c.codigo).replace(/'/g,"\\'")}')">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger m-2">${err.message}</div>`;
    }
  },

  async deleteCupon(id, codigo) {
    if (!confirm(`¿Eliminar el cupón ${codigo}?`)) return;
    try {
      await API.delete(`/api/cupones/${id}`);
      showToast('Cupón eliminado', 'success');
      await PageHistorial.loadCupones();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },
};
