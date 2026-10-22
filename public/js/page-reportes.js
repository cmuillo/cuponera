/**
 * page-reportes.js — Estadísticas y PDF
 */
const PageReportes = {
  data: [],
  reservas: [],

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
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Sorteo</label>
              <select id="rptSorteo" class="form-select form-select-sm">${sorteoOpts}</select>
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold">Buscar por cédula o celular</label>
              <input type="text" id="rptBuscar" class="form-control form-control-sm" placeholder="Buscar..." />
            </div>
            <div class="col-sm-2">
              <button class="btn btn-primary btn-sm w-100" onclick="PageReportes.loadStats()">
                <i class="bi bi-search me-1"></i>Buscar
              </button>
            </div>
            <div class="col-sm-2">
              <button class="btn btn-success btn-sm w-100" id="btnExcel" onclick="PageReportes.exportarExcel()" title="Exportar el detalle a Excel">
                <i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel
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
            <strong>Exportar Excel</strong> incluye cupones y reservas de cupo en hojas separadas.
            <strong>PDF Cupones</strong> genera únicamente cupones para imprimir y tómbola física (requiere seleccionar un sorteo).
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="row g-3 mb-4" id="statsCards">
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statTotalCupones">—</div>
            <div class="stat-label">Total cupones</div>
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statPersonas">—</div>
            <div class="stat-label">Participantes únicos</div>
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statAcompanantes">—</div>
            <div class="stat-label">Con acompañante</div>
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statAsistentes">—</div>
            <div class="stat-label">Personas a asistir</div>
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statReservas">—</div>
            <div class="stat-label">Reservas de cupo</div>
          </div>
        </div>
        <div class="col-6 col-md-2">
          <div class="stat-card">
            <div class="stat-num" id="statEspaciosReservados">—</div>
            <div class="stat-label">Espacios reservados</div>
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
      const queryString = params.toString();
      const [data, reservas] = await Promise.all([
        API.get(`/api/reportes/estadisticas?${queryString}`),
        API.get(`/api/reportes/reservas-cupo?${queryString}`),
      ]);
      PageReportes.data = data;
      PageReportes.reservas = reservas;

      // Calcular stats globales
      const totales = PageReportes.calcTotales(data);
      const totalesReservas = PageReportes.calcTotalesReservas(reservas);
      document.getElementById('statTotalCupones').textContent = totales.totalCupones;
      document.getElementById('statPersonas').textContent = totales.personas;
      document.getElementById('statAcompanantes').textContent = totales.acompanantes;
      document.getElementById('statAsistentes').textContent = totales.asistentes;
      document.getElementById('statReservas').textContent = totalesReservas.reservas;
      document.getElementById('statEspaciosReservados').textContent = totalesReservas.espacios;

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
                <th class="text-center">Acompañante</th>
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
                    ${row.acompanante
                      ? `<span class="badge bg-success"><i class="bi bi-people-fill me-1"></i>Sí</span>
                         ${row.acompanante_nombre
                           ? `<br><small class="text-muted">${escHtml(row.acompanante_nombre)}</small>` : ''}`
                      : '<span class="text-muted">No</span>'}
                  </td>
                  <td class="text-center">
                    <span class="badge bg-primary rounded-pill fs-6">${row.total_cupones}</span>
                    ${parseInt(row.cupones_pendientes) > 0
                      ? `<br><span class="badge bg-warning text-dark mt-1" title="Cupones pendientes de confirmar pago">${row.cupones_pendientes} por pagar</span>`
                      : ''}
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

  /** Totales agregados, incluyendo la cantidad de personas que asistirán. */
  calcTotales(data) {
    const totalCupones = data.reduce((a, b) => a + parseInt(b.total_cupones), 0);
    const personas = data.length;
    const acompanantes = data.filter(d => d.acompanante).length;
    return {
      totalCupones,
      personas,
      acompanantes,
      asistentes: personas + acompanantes,
      pendientes: data.reduce((a, b) => a + parseInt(b.cupones_pendientes || 0), 0),
    };
  },

  calcTotalesReservas(reservas) {
    return {
      reservas: reservas.length,
      espacios: reservas.reduce((total, reserva) => total + parseInt(reserva.espacios_reservados || 0), 0),
      monto: reservas.reduce((total, reserva) => total + parseInt(reserva.monto_total || 0), 0),
      pendientes: reservas.filter(reserva => reserva.estado_pago === 'pendiente').length,
    };
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

  /** Exporta los detalles de cupones y reservas de cupo en hojas separadas. */
  exportarExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('No se pudo cargar el generador de Excel. Verifique su conexión.', 'danger');
      return;
    }
    const data = PageReportes.data || [];
    const reservas = PageReportes.reservas || [];
    if (data.length === 0 && reservas.length === 0) {
      showToast('No hay datos para exportar', 'warning');
      return;
    }

    const filas = data.map(row => ({
      'Nombre': row.nombre_persona || '',
      'Cédula': row.cedula,
      'Teléfono': row.celular,
      'Acompañante': row.acompanante ? 'Sí' : 'No',
      'Nombre del acompañante': row.acompanante ? (row.acompanante_nombre || '') : '',
      'Personas a asistir': row.acompanante ? 2 : 1,
      'Inscrito en línea': row.inscrito ? 'Sí' : 'No',
      'Cupones': parseInt(row.total_cupones),
      'Cupones pendientes de pago': parseInt(row.cupones_pendientes || 0),
      'Códigos': (row.codigos || []).join(', '),
      'Sorteo': row.sorteo_nombre,
      'Fecha del sorteo': formatDate(row.fecha_sorteo),
    }));

    const t = PageReportes.calcTotales(data);
    const tReservas = PageReportes.calcTotalesReservas(reservas);
    const resumen = [
      { Indicador: 'Participantes únicos', Valor: t.personas },
      { Indicador: 'Con acompañante', Valor: t.acompanantes },
      { Indicador: 'Total de personas a asistir', Valor: t.asistentes },
      { Indicador: 'Total de cupones', Valor: t.totalCupones },
      { Indicador: 'Cupones pendientes de pago', Valor: t.pendientes },
      { Indicador: 'Total de reservas de cupo', Valor: tReservas.reservas },
      { Indicador: 'Espacios reservados', Valor: tReservas.espacios },
      { Indicador: 'Monto total de reservas', Valor: tReservas.monto },
      { Indicador: 'Reservas pendientes de pago', Valor: tReservas.pendientes },
    ];
    const filasReservas = reservas.map(reserva => ({
      'Titular': reserva.nombre || '',
      'Cédula': reserva.cedula,
      'Teléfono': reserva.celular,
      'Acompañante': reserva.acompanante ? (reserva.acompanante_nombre || 'Sí') : 'No',
      'Espacios reservados': parseInt(reserva.espacios_reservados),
      'Monto total': parseInt(reserva.monto_total),
      'Estado de pago': reserva.estado_pago,
      'Sorteo': reserva.sorteo_nombre,
      'Fecha del sorteo': formatDate(reserva.fecha_sorteo),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Participantes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasReservas), 'Reservas de cupo');

    const sel = document.getElementById('rptSorteo');
    const nombre = (sel.value ? sel.options[sel.selectedIndex].text : 'todos-los-sorteos')
      .replace(/[^a-z0-9]/gi, '_').substring(0, 40);
    XLSX.writeFile(wb, `reporte-cupones-${nombre}.xlsx`);
    showToast('Archivo Excel generado', 'success');
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
