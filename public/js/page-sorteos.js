/**
 * page-sorteos.js — Configuración de Sorteos
 */
const PageSorteos = {
  async render(container) {
    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-gear-fill"></i>Configuración de Sorteos</h1>
      <div class="row g-4">
        <!-- Formulario -->
        <div class="col-lg-4">
          <div class="card">
            <div class="card-header" id="sorteoFormTitle">Nuevo Sorteo</div>
            <div class="card-body p-4">
              <div id="sorteoFormAlert" class="d-none"></div>
              <form id="sorteoForm">
                <input type="hidden" id="sorteoId" />
                <div class="mb-3">
                  <label class="form-label fw-semibold">Nombre del sorteo *</label>
                  <input type="text" id="sorteoNombre" class="form-control" maxlength="255" required />
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold">Descripción</label>
                  <textarea id="sorteoDesc" class="form-control" rows="3" maxlength="1000"></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold">Fecha del sorteo *</label>
                  <input type="date" id="sorteoFecha" class="form-control" required />
                </div>
                <div class="mb-4 form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="sorteoActivo" checked />
                  <label class="form-check-label" for="sorteoActivo">Sorteo activo</label>
                </div>
                <div class="d-flex gap-2">
                  <button type="submit" class="btn btn-primary flex-fill" id="sorteoSubmitBtn">
                    <i class="bi bi-plus-circle me-1"></i>Crear Sorteo
                  </button>
                  <button type="button" class="btn btn-outline-secondary d-none" id="sorteoCancelBtn" onclick="PageSorteos.cancelEdit()">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- Lista -->
        <div class="col-lg-8">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              Sorteos registrados
              <button class="btn btn-sm btn-outline-primary" onclick="PageSorteos.loadList()">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>
            <div class="card-body p-0">
              <div id="sorteosList" class="p-3">
                <div class="d-flex justify-content-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Formulario submit
    container.querySelector('#sorteoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await PageSorteos.saveSorteo();
    });

    await PageSorteos.loadList();
  },

  async loadList() {
    const el = document.getElementById('sorteosList');
    if (!el) return;
    el.innerHTML = '<div class="d-flex justify-content-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
    try {
      const sorteos = await API.get('/api/sorteos');
      if (sorteos.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="bi bi-calendar-x"></i>No hay sorteos registrados.</div>';
        return;
      }
      el.innerHTML = sorteos.map(s => `
        <div class="d-flex align-items-start gap-3 py-3 border-bottom" id="sorteo-${s.id}">
          <div class="flex-fill">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-semibold">${escHtml(s.nombre)}</span>
              <span class="${s.activo ? 'badge-activo' : 'badge-inactivo'}">${s.activo ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div class="text-muted small mt-1">
              <i class="bi bi-calendar3 me-1"></i>${formatDate(s.fecha_sorteo)}
              ${s.descripcion ? `<span class="ms-2 text-truncate d-inline-block" style="max-width:200px" title="${escHtml(s.descripcion)}"><i class="bi bi-text-left me-1"></i>${escHtml(s.descripcion)}</span>` : ''}
            </div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn btn-sm btn-outline-secondary" title="${s.activo ? 'Desactivar' : 'Activar'}" onclick="PageSorteos.toggleSorteo(${s.id})">
              <i class="bi bi-${s.activo ? 'pause-circle' : 'play-circle'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" title="Editar" onclick="PageSorteos.editSorteo(${s.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="PageSorteos.deleteSorteo(${s.id}, '${escHtml(s.nombre).replace(/'/g, "\\'")}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>`).join('');
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger m-2">${err.message}</div>`;
    }
  },

  async saveSorteo() {
    const alertEl = document.getElementById('sorteoFormAlert');
    alertEl.classList.add('d-none');
    const id = document.getElementById('sorteoId').value;
    const payload = {
      nombre: document.getElementById('sorteoNombre').value.trim(),
      descripcion: document.getElementById('sorteoDesc').value.trim(),
      fecha_sorteo: document.getElementById('sorteoFecha').value,
      activo: document.getElementById('sorteoActivo').checked,
    };
    try {
      if (id) {
        await API.put(`/api/sorteos/${id}`, payload);
        showToast('Sorteo actualizado correctamente', 'success');
      } else {
        await API.post('/api/sorteos', payload);
        showToast('Sorteo creado correctamente', 'success');
      }
      PageSorteos.cancelEdit();
      await PageSorteos.loadList();
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    }
  },

  async editSorteo(id) {
    try {
      const sorteos = await API.get('/api/sorteos');
      const s = sorteos.find(x => x.id === id);
      if (!s) return;
      document.getElementById('sorteoId').value = s.id;
      document.getElementById('sorteoNombre').value = s.nombre;
      document.getElementById('sorteoDesc').value = s.descripcion || '';
      document.getElementById('sorteoFecha').value = s.fecha_sorteo ? s.fecha_sorteo.split('T')[0] : '';
      document.getElementById('sorteoActivo').checked = s.activo;
      document.getElementById('sorteoFormTitle').textContent = 'Editar Sorteo';
      document.getElementById('sorteoSubmitBtn').innerHTML = '<i class="bi bi-check2 me-1"></i>Guardar Cambios';
      document.getElementById('sorteoCancelBtn').classList.remove('d-none');
      document.getElementById('sorteoNombre').focus();
    } catch (err) { showToast(err.message, 'danger'); }
  },

  cancelEdit() {
    document.getElementById('sorteoId').value = '';
    document.getElementById('sorteoForm').reset();
    document.getElementById('sorteoActivo').checked = true;
    document.getElementById('sorteoFormTitle').textContent = 'Nuevo Sorteo';
    document.getElementById('sorteoSubmitBtn').innerHTML = '<i class="bi bi-plus-circle me-1"></i>Crear Sorteo';
    document.getElementById('sorteoCancelBtn').classList.add('d-none');
    document.getElementById('sorteoFormAlert').classList.add('d-none');
  },

  async toggleSorteo(id) {
    try {
      await API.patch(`/api/sorteos/${id}/toggle`);
      showToast('Estado actualizado', 'success');
      await PageSorteos.loadList();
    } catch (err) { showToast(err.message, 'danger'); }
  },

  async deleteSorteo(id, nombre) {
    if (!confirm(`¿Eliminar el sorteo "${nombre}"?\nSolo se puede eliminar si no tiene cupones registrados.`)) return;
    try {
      await API.delete(`/api/sorteos/${id}`);
      showToast('Sorteo eliminado', 'success');
      await PageSorteos.loadList();
    } catch (err) { showToast(err.message, 'danger'); }
  },
};

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
