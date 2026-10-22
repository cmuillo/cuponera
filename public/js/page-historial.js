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
      <h1 class="page-title"><i class="bi bi-clock-history"></i>Historial</h1>
      <div class="card mb-4">
        <div class="card-body">
          <div class="row g-2 align-items-end">
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Sorteo</label>
              <select id="filtroSorteo" class="form-select form-select-sm">${sorteoOpts}</select>
            </div>
            <div class="col-sm-2">
              <label class="form-label small fw-semibold">Cédula</label>
              <input type="text" id="filtroCedula" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-2">
              <label class="form-label small fw-semibold">Celular</label>
              <input type="text" id="filtroCelular" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Estado de pago</label>
              <select id="filtroEstadoPago" class="form-select form-select-sm">
                <option value="">Todos</option>
                <option value="pendiente">Pendientes de pago</option>
                <option value="confirmado">Confirmados</option>
              </select>
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
          <span>Cupones y reservas <span id="cuponesCount" class="badge bg-primary ms-1">—</span></span>
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
    const estadoPago = document.getElementById('filtroEstadoPago').value;
    if (sorteoId) params.set('sorteoId', sorteoId);
    if (cedula) params.set('cedula', cedula);
    if (celular) params.set('celular', celular);
    if (estadoPago) params.set('estadoPago', estadoPago);

    try {
      const query = params.toString();
      const [cupones, reservas] = await Promise.all([
        API.get(`/api/cupones?${query}`),
        API.get(`/api/reservas-cupo?${query}`),
      ]);
      const registros = [
        ...cupones.map(cupon => ({ ...cupon, tipo_registro: 'cupon' })),
        ...reservas.map(reserva => ({ ...reserva, tipo_registro: 'reserva' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      countEl.textContent = registros.length;

      if (registros.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="bi bi-search"></i>No se encontraron registros.</div>';
        return;
      }

      el.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr>
                <th>Registro</th>
                <th>Sorteo</th>
                <th>Titular</th>
                <th>Cédula</th>
                <th>Celular</th>
                <th>Origen</th>
                <th>Pago</th>
                <th>Fecha reg.</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${registros.map(registro => PageHistorial.renderRegistro(registro)).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="alert alert-danger m-2">${err.message}</div>`;
    }
  },

  origenBadge(origen) {
    const mapa = {
      inscripcion: '<span class="badge bg-info text-dark">Inscripción</span>',
      compra: '<span class="badge bg-primary">Compra</span>',
    };
    return mapa[origen] || '<span class="badge bg-secondary">Manual</span>';
  },

  renderRegistro(registro) {
    if (registro.tipo_registro === 'reserva') {
      const nombre = escHtml(registro.nombre || '—');
      const acompanante = registro.acompanante
        ? `<span class="badge bg-light text-dark border ms-1" title="Acompañante: ${escHtml(registro.acompanante_nombre || 'sin nombre')}"><i class="bi bi-people-fill"></i></span>`
        : '';
      const pago = registro.estado_pago === 'pendiente'
        ? '<span class="badge bg-warning text-dark">Pendiente</span>'
        : '<span class="badge bg-success">Confirmado</span>';
      const mensaje = registro.estado_pago === 'pendiente'
        ? PageHistorial.recordatorioReserva(registro)
        : PageHistorial.pagoVerificadoReserva(registro);
      return `
        <tr>
          <td><span class="badge bg-info text-dark">Reserva</span>
            <div class="small text-muted mt-1">${registro.espacios_reservados} ${registro.espacios_reservados === 1 ? 'espacio' : 'espacios'} · ₡${Number(registro.monto_total).toLocaleString('es-ES')}</div>
          </td>
          <td><span class="d-inline-block text-truncate" style="max-width:130px" title="${escHtml(registro.sorteo_nombre)}">${escHtml(registro.sorteo_nombre)}</span></td>
          <td>${nombre}${acompanante}</td>
          <td>${escHtml(registro.cedula)}</td>
          <td>${escHtml(registro.celular)}</td>
          <td><span class="badge bg-info text-dark">Cupo limitado</span></td>
          <td>${pago}</td>
          <td class="text-muted small">${new Date(registro.created_at).toLocaleDateString('es-ES')}</td>
          <td class="text-nowrap">
            ${registro.estado_pago === 'pendiente'
              ? `<button class="btn btn-success btn-sm me-1" title="Confirmar pago de reserva"
                   onclick="PageHistorial.confirmarReserva(${registro.id})">
                   <i class="bi bi-cash-coin"></i>
                 </button>`
              : ''}
            <a href="${buildWaLink(registro.celular, mensaje)}" target="_blank" rel="noopener noreferrer"
               class="btn btn-whatsapp btn-sm me-1" title="Enviar aviso por WhatsApp">
              <i class="bi bi-whatsapp"></i>
            </a>
            <button class="btn btn-outline-danger btn-sm" title="Eliminar reserva"
              onclick="PageHistorial.deleteReserva(${registro.id})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`;
    }

    return `
      <tr>
        <td><code class="fw-bold text-primary">${escHtml(registro.codigo)}</code>
          ${registro.ganador ? '<span class="badge bg-warning text-dark ms-1"><i class="bi bi-trophy-fill"></i> Ganador</span>' : ''}
        </td>
        <td><span class="d-inline-block text-truncate" style="max-width:130px" title="${escHtml(registro.sorteo_nombre)}">${escHtml(registro.sorteo_nombre)}</span></td>
        <td>${escHtml(registro.nombre_persona || '—')}
          ${registro.acompanante ? `<span class="badge bg-light text-dark border ms-1" title="Asiste con acompañante: ${escHtml(registro.acompanante_nombre || 'sin nombre')}"><i class="bi bi-people-fill"></i></span>` : ''}
        </td>
        <td>${escHtml(registro.cedula)}</td>
        <td>${escHtml(registro.celular)}</td>
        <td>${PageHistorial.origenBadge(registro.origen)}</td>
        <td>${registro.estado_pago === 'pendiente'
          ? '<span class="badge bg-warning text-dark">Pendiente</span>'
          : '<span class="badge bg-success">Confirmado</span>'}</td>
        <td class="text-muted small">${new Date(registro.created_at).toLocaleDateString('es-ES')}</td>
        <td class="text-nowrap">
          ${registro.estado_pago === 'pendiente'
            ? `<button class="btn btn-success btn-sm me-1" title="Confirmar pago"
                 onclick="PageHistorial.setPago(${registro.id}, 'confirmado')">
                 <i class="bi bi-cash-coin"></i>
               </button>`
            : ''}
          <a href="${buildWaLink(registro.celular, buildCuponWaText(registro))}" target="_blank" rel="noopener noreferrer"
             class="btn btn-whatsapp btn-sm me-1" title="Enviar por WhatsApp">
            <i class="bi bi-whatsapp"></i>
          </a>
          <button class="btn btn-outline-danger btn-sm" title="Eliminar cupón"
            onclick="PageHistorial.deleteCupon(${registro.id}, '${escHtml(registro.codigo).replace(/'/g, "\\'")}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
  },

  recordatorioReserva(reserva) {
    return `Hola ${reserva.nombre || ''}, te recordamos enviar el comprobante de pago de tu reserva para ${reserva.sorteo_nombre}. ` +
      `Monto pendiente: ₡${Number(reserva.monto_total).toLocaleString('es-ES')} por ${reserva.espacios_reservados} espacio(s).`;
  },

  pagoVerificadoReserva(reserva) {
    return `Hola ${reserva.nombre || ''}, pago verificado y espacio reservado para ${reserva.sorteo_nombre}. ` +
      `Quedan confirmados ${reserva.espacios_reservados} espacio(s).`;
  },

  async setPago(id, estado) {
    try {
      await API.patch(`/api/cupones/${id}/pago`, { estado_pago: estado });
      showToast('Estado de pago actualizado', 'success');
      await PageHistorial.loadCupones();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  async confirmarReserva(id) {
    try {
      await API.patch(`/api/reservas-cupo/${id}/pago`, {});
      showToast('Pago de reserva confirmado', 'success');
      await PageHistorial.loadCupones();
    } catch (err) {
      showToast(err.message, 'danger');
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

  async deleteReserva(id) {
    if (!confirm('¿Eliminar esta reserva? Los espacios volverán a estar disponibles.')) return;
    try {
      await API.delete(`/api/reservas-cupo/${id}`);
      showToast('Reserva eliminada y espacios liberados', 'success');
      await PageHistorial.loadCupones();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },
};
