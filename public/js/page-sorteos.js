/**
 * page-sorteos.js — Configuración de Sorteos
 */
const PageSorteos = {
  sorteos: [],
  padronSorteoId: null,

  async render(container) {
    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-gear-fill"></i>Sorteos y Actividades</h1>
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
                <div class="mb-3">
                  <label class="form-label fw-semibold">Monto mínimo por cupón
                    <span class="text-muted fw-normal small">(colones, 0 = sin límite)</span>
                  </label>
                  <div class="input-group">
                    <span class="input-group-text">₡</span>
                    <input type="number" id="sorteoMontoMin" class="form-control" min="0" step="500" placeholder="Ej: 10000" />
                  </div>
                  <div class="form-text">Monto de compra necesario para obtener 1 cupón.</div>
                </div>
                <div class="mb-3 form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="sorteoActivo" checked />
                  <label class="form-check-label" for="sorteoActivo">Sorteo activo</label>
                </div>
                <div class="mb-3 form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="sorteoModoInscripcion"
                         onchange="PageSorteos.onModoInscripcionChange()" />
                  <label class="form-check-label" for="sorteoModoInscripcion">Inscripción pública de invitados</label>
                  <div class="form-text">Habilita una ventana pública donde la persona se inscribe sola y obtiene su cupón.</div>
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold" for="sorteoTipoInscripcion">Tipo de inscripción</label>
                  <select id="sorteoTipoInscripcion" class="form-select"
                          onchange="PageSorteos.onTipoInscripcionChange()">
                    <option value="normal">Normal</option>
                    <option value="cupo_limitado">Cupo limitado</option>
                  </select>
                </div>
                <div class="mb-3 d-none" id="sorteoCupoLimitadoGroup">
                  <div class="row g-2">
                    <div class="col-sm-6">
                      <label class="form-label fw-semibold" for="sorteoCapacidadTotal">Espacios totales</label>
                      <input type="number" id="sorteoCapacidadTotal" class="form-control" min="1" step="1" />
                    </div>
                    <div class="col-sm-6">
                      <label class="form-label fw-semibold" for="sorteoPrecioEspacio">Precio por espacio</label>
                      <div class="input-group">
                        <span class="input-group-text">₡</span>
                        <input type="number" id="sorteoPrecioEspacio" class="form-control" min="1" step="1" />
                      </div>
                    </div>
                  </div>
                  <div class="form-text">El precio se aplica únicamente a nuevas reservas.</div>
                </div>
                <div class="mb-4 ps-3 border-start d-none" id="sorteoPadronGroup">
                  <label class="form-label fw-semibold small">¿Quién puede inscribirse?</label>
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="sorteoAcceso" id="sorteoAccesoLibre" value="libre" checked />
                    <label class="form-check-label" for="sorteoAccesoLibre">Cualquier persona</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="sorteoAcceso" id="sorteoAccesoPadron" value="padron" />
                    <label class="form-check-label" for="sorteoAccesoPadron">Solo cédulas de un listado previo</label>
                  </div>
                  <div class="form-text">El listado se carga desde Excel en la tarjeta del sorteo, una vez guardado.</div>
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
      </div>

      <!-- Modal: listado autorizado (padrón) -->
      <div class="modal fade" id="padronModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Listado autorizado — <span id="padronSorteoNombre"></span></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="padronAlert" class="d-none"></div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Cargar listado desde Excel</label>
                <input type="file" id="padronFile" class="form-control" accept=".xlsx,.xls,.csv" />
                <div class="form-text">
                  El archivo debe tener una columna <strong>cedula</strong> (y opcionalmente <strong>nombre</strong>)
                  en la primera fila. También se aceptan archivos de una sola columna con las cédulas.
                </div>
              </div>
              <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="padronReemplazar" checked />
                <label class="form-check-label" for="padronReemplazar">
                  Reemplazar el listado actual (desmarque para agregar al existente)
                </label>
              </div>
              <button class="btn btn-primary w-100 mb-3" id="padronUploadBtn" onclick="PageSorteos.subirPadron()">
                <i class="bi bi-upload me-1"></i>Cargar listado
              </button>
              <hr />
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>Cédulas autorizadas <span id="padronCount" class="badge bg-primary">—</span></strong>
                <button class="btn btn-sm btn-outline-danger" onclick="PageSorteos.vaciarPadron()">
                  <i class="bi bi-trash me-1"></i>Vaciar listado
                </button>
              </div>
              <div id="padronList"></div>
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
      PageSorteos.sorteos = sorteos;
      if (sorteos.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="bi bi-calendar-x"></i>No hay sorteos registrados.</div>';
        return;
      }
      el.innerHTML = sorteos.map(s => `
        <div class="d-flex align-items-start gap-3 py-3 border-bottom" id="sorteo-${s.id}">
          <div class="flex-fill">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-semibold">${escHtml(s.nombre)}</span>
              <span class="${s.activo ? 'badge-activo' : 'badge-inactivo'}">${s.activo ? 'Activo' : 'Inactivo'}</span>              ${s.monto_minimo > 0 ? `<span class="badge bg-light text-dark border"><i class="bi bi-coin me-1"></i>₡${parseInt(s.monto_minimo).toLocaleString()} mínimo</span>` : ''}
              ${s.modo_inscripcion ? '<span class="badge bg-info text-dark"><i class="bi bi-person-plus me-1"></i>Inscripción pública</span>' : ''}
              ${s.modo_inscripcion && s.restringir_padron ? `<span class="badge bg-warning text-dark"><i class="bi bi-shield-check me-1"></i>Listado previo (${s.padron_total || 0})</span>` : ''}
              ${s.tipo_inscripcion === 'cupo_limitado' ? `<span class="badge bg-primary"><i class="bi bi-people me-1"></i>Cupo ${s.espacios_ocupados || 0}/${s.capacidad_total} (${s.espacios_disponibles} disponibles)</span>` : ''}
            </div>
            <div class="text-muted small mt-1">
              <i class="bi bi-calendar3 me-1"></i>${formatDate(s.fecha_sorteo)}
              ${s.modo_inscripcion ? `<span class="ms-2"><i class="bi bi-people me-1"></i>${s.inscritos_total || 0} inscrito(s)</span>` : ''}
              ${s.descripcion ? `<span class="ms-2 text-truncate d-inline-block" style="max-width:200px" title="${escHtml(s.descripcion)}"><i class="bi bi-text-left me-1"></i>${escHtml(s.descripcion)}</span>` : ''}
            </div>
            ${s.modo_inscripcion ? `
              <div class="input-group input-group-sm mt-2" style="max-width:420px">
                <span class="input-group-text"><i class="bi bi-link-45deg"></i></span>
                <input type="text" class="form-control" readonly value="${PageSorteos.linkInscripcion(s.id)}" />
                <button class="btn btn-outline-secondary" title="Copiar enlace" onclick="PageSorteos.copiarLink(${s.id})">
                  <i class="bi bi-clipboard"></i>
                </button>
                <a class="btn btn-outline-secondary" title="Abrir" target="_blank" rel="noopener noreferrer"
                   href="${PageSorteos.linkInscripcion(s.id)}">
                  <i class="bi bi-box-arrow-up-right"></i>
                </a>
              </div>` : ''}
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            ${s.modo_inscripcion && s.restringir_padron ? `
              <button class="btn btn-sm btn-outline-info" title="Listado autorizado"
                onclick="PageSorteos.abrirPadron(${s.id})">
                <i class="bi bi-list-check"></i>
              </button>` : ''}
            <button class="btn btn-sm btn-outline-secondary" title="${s.activo ? 'Desactivar' : 'Activar'}" onclick="PageSorteos.toggleSorteo(${s.id})">
              <i class="bi bi-${s.activo ? 'pause-circle' : 'play-circle'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary" title="Editar" onclick="PageSorteos.editSorteo(${s.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="PageSorteos.deleteSorteo(${s.id})">
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
    const modoInscripcion = document.getElementById('sorteoModoInscripcion').checked;
    const payload = {
      nombre: document.getElementById('sorteoNombre').value.trim(),
      descripcion: document.getElementById('sorteoDesc').value.trim(),
      fecha_sorteo: document.getElementById('sorteoFecha').value,
      activo: document.getElementById('sorteoActivo').checked,
      monto_minimo: parseInt(document.getElementById('sorteoMontoMin').value) || 0,
      modo_inscripcion: modoInscripcion,
      restringir_padron: modoInscripcion && document.getElementById('sorteoAccesoPadron').checked,
      tipo_inscripcion: document.getElementById('sorteoTipoInscripcion').value,
      capacidad_total: parseInt(document.getElementById('sorteoCapacidadTotal').value, 10),
      precio_espacio: parseInt(document.getElementById('sorteoPrecioEspacio').value, 10),
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
      document.getElementById('sorteoMontoMin').value = s.monto_minimo || 0;
      document.getElementById('sorteoModoInscripcion').checked = !!s.modo_inscripcion;
      document.getElementById('sorteoTipoInscripcion').value = s.tipo_inscripcion || 'normal';
      document.getElementById('sorteoCapacidadTotal').value = s.capacidad_total || '';
      document.getElementById('sorteoPrecioEspacio').value = s.precio_espacio || '';
      document.getElementById('sorteoAccesoPadron').checked = !!s.restringir_padron;
      document.getElementById('sorteoAccesoLibre').checked = !s.restringir_padron;
      PageSorteos.onModoInscripcionChange();
      PageSorteos.onTipoInscripcionChange();
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
    document.getElementById('sorteoAccesoLibre').checked = true;
    document.getElementById('sorteoTipoInscripcion').value = 'normal';
    PageSorteos.onModoInscripcionChange();
    PageSorteos.onTipoInscripcionChange();
    document.getElementById('sorteoFormTitle').textContent = 'Nuevo Sorteo';
    document.getElementById('sorteoSubmitBtn').innerHTML = '<i class="bi bi-plus-circle me-1"></i>Crear Sorteo';
    document.getElementById('sorteoCancelBtn').classList.add('d-none');
    document.getElementById('sorteoFormAlert').classList.add('d-none');
  },

  onModoInscripcionChange() {
    const activo = document.getElementById('sorteoModoInscripcion').checked;
    document.getElementById('sorteoPadronGroup').classList.toggle('d-none', !activo);
  },

  onTipoInscripcionChange() {
    const limitado = document.getElementById('sorteoTipoInscripcion').value === 'cupo_limitado';
    document.getElementById('sorteoCupoLimitadoGroup').classList.toggle('d-none', !limitado);
    document.getElementById('sorteoCapacidadTotal').required = limitado;
    document.getElementById('sorteoPrecioEspacio').required = limitado;
  },

  linkInscripcion(id) {
    return `${location.origin}/inscripcion?sorteo=${id}`;
  },

  async copiarLink(id) {
    const link = PageSorteos.linkInscripcion(id);
    try {
      await navigator.clipboard.writeText(link);
      showToast('Enlace copiado al portapapeles', 'success');
    } catch {
      showToast(`Copie el enlace manualmente: ${link}`, 'warning');
    }
  },

  async toggleSorteo(id) {
    try {
      await API.patch(`/api/sorteos/${id}/toggle`);
      showToast('Estado actualizado', 'success');
      await PageSorteos.loadList();
    } catch (err) { showToast(err.message, 'danger'); }
  },

  async deleteSorteo(id) {
    const s = PageSorteos.sorteos.find(x => x.id === id);
    const nombre = s ? s.nombre : '';
    if (!confirm(`¿Eliminar el sorteo "${nombre}"?\nSolo se puede eliminar si no tiene cupones registrados.`)) return;
    try {
      await API.delete(`/api/sorteos/${id}`);
      showToast('Sorteo eliminado', 'success');
      await PageSorteos.loadList();
    } catch (err) { showToast(err.message, 'danger'); }
  },

  // ---- LISTADO AUTORIZADO (PADRÓN) ----

  async abrirPadron(sorteoId) {
    PageSorteos.padronSorteoId = sorteoId;
    const s = PageSorteos.sorteos.find(x => x.id === sorteoId);
    document.getElementById('padronSorteoNombre').textContent = s ? s.nombre : '';
    document.getElementById('padronAlert').classList.add('d-none');
    document.getElementById('padronFile').value = '';
    new bootstrap.Modal(document.getElementById('padronModal')).show();
    await PageSorteos.loadPadron();
  },

  async loadPadron() {
    const el = document.getElementById('padronList');
    el.innerHTML = '<div class="d-flex justify-content-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
    try {
      const registros = await API.get(`/api/sorteos/${PageSorteos.padronSorteoId}/padron`);
      document.getElementById('padronCount').textContent = registros.length;
      if (registros.length === 0) {
        el.innerHTML = '<div class="empty-state py-3"><i class="bi bi-list-ul"></i>El listado está vacío.</div>';
        return;
      }
      el.innerHTML = `
        <div class="table-responsive" style="max-height:300px;overflow:auto">
          <table class="table table-sm table-hover mb-0">
            <thead class="sticky-top bg-white"><tr><th>Cédula</th><th>Nombre</th></tr></thead>
            <tbody>
              ${registros.map(r => `
                <tr><td><code>${escHtml(r.cedula)}</code></td><td>${escHtml(r.nombre || '—')}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger mb-0">${escHtml(err.message)}</div>`;
    }
  },

  /** Lee el Excel en el navegador (SheetJS) y envía los registros como JSON. */
  async subirPadron() {
    const alertEl = document.getElementById('padronAlert');
    alertEl.classList.add('d-none');
    const input = document.getElementById('padronFile');
    const file = input.files && input.files[0];
    if (!file) {
      return PageSorteos.padronError('Seleccione un archivo Excel.');
    }

    const btn = document.getElementById('padronUploadBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';
    try {
      const registros = await PageSorteos.parseExcel(file);
      if (registros.length === 0) {
        return PageSorteos.padronError('No se encontró ninguna cédula en el archivo.');
      }
      const res = await API.post(`/api/sorteos/${PageSorteos.padronSorteoId}/padron`, {
        registros,
        reemplazar: document.getElementById('padronReemplazar').checked,
      });
      showToast(`${res.procesados} cédula(s) cargada(s). Total: ${res.total}.`, 'success');
      if (res.descartados > 0) {
        alertEl.className = 'alert alert-warning';
        alertEl.textContent = `${res.descartados} fila(s) se descartaron por estar vacías o repetidas.`;
        alertEl.classList.remove('d-none');
      }
      input.value = '';
      await PageSorteos.loadPadron();
      await PageSorteos.loadList();
    } catch (err) {
      PageSorteos.padronError(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-upload me-1"></i>Cargar listado';
    }
  },

  padronError(msg) {
    const alertEl = document.getElementById('padronAlert');
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = msg;
    alertEl.classList.remove('d-none');
  },

  parseExcel(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === 'undefined') {
        return reject(new Error('No se pudo cargar el lector de Excel. Verifique su conexión a internet.'));
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
          resolve(PageSorteos.filasAPadron(filas));
        } catch (err) {
          reject(new Error('El archivo no es un Excel válido.'));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  /** Convierte las filas crudas del Excel en {cedula, nombre}, detectando encabezados. */
  filasAPadron(filas) {
    if (!filas || filas.length === 0) return [];

    const normaliza = (v) => String(v ?? '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const encabezado = (filas[0] || []).map(normaliza);
    let idxCedula = encabezado.findIndex(h => h.includes('cedula') || h === 'id' || h.includes('identificacion'));
    let idxNombre = encabezado.findIndex(h => h.includes('nombre'));
    let inicio = 1;

    // Sin encabezados reconocibles: se asume columna 0 = cédula, columna 1 = nombre
    if (idxCedula === -1) {
      idxCedula = 0;
      idxNombre = encabezado.length > 1 ? 1 : -1;
      inicio = 0;
    }

    const registros = [];
    for (let i = inicio; i < filas.length; i++) {
      const fila = filas[i] || [];
      const cedula = String(fila[idxCedula] ?? '').trim();
      if (!cedula) continue;
      registros.push({
        cedula,
        nombre: idxNombre >= 0 ? String(fila[idxNombre] ?? '').trim() : '',
      });
    }
    return registros;
  },

  async vaciarPadron() {
    if (!confirm('¿Vaciar el listado autorizado de este sorteo?')) return;
    try {
      await API.delete(`/api/sorteos/${PageSorteos.padronSorteoId}/padron`);
      showToast('Listado vaciado', 'success');
      await PageSorteos.loadPadron();
      await PageSorteos.loadList();
    } catch (err) { showToast(err.message, 'danger'); }
  },
};

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
