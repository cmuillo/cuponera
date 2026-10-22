/**
 * page-config.js — Configuración general del sistema
 */
const PageConfig = {
  config: { whatsapp_comprobantes: '', paquetes_cupones: [], compras_adicionales_habilitadas: true },

  async render(container) {
    try {
      PageConfig.config = await API.get('/api/config');
    } catch (e) {
      PageConfig.config = { whatsapp_comprobantes: '', paquetes_cupones: [], compras_adicionales_habilitadas: true };
    }

    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-sliders"></i>Configuración del Sistema</h1>
      <div class="row g-4">
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header">Compras adicionales</div>
            <div class="card-body p-4">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="cfgComprasAdicionales"
                       ${PageConfig.config.compras_adicionales_habilitadas !== false ? 'checked' : ''} />
                <label class="form-check-label fw-semibold" for="cfgComprasAdicionales">
                  Permitir compra de cupones adicionales
                </label>
              </div>
              <div class="form-text">
                Si se desactiva, la pestaña de compra no aparecerá en la ventana pública.
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="card">
            <div class="card-header">WhatsApp de respaldo para comprobantes</div>
            <div class="card-body p-4">
              <div id="configAlert" class="d-none"></div>
              <label class="form-label fw-semibold">Número de respaldo que recibe los comprobantes de pago</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-whatsapp text-success"></i></span>
                <input type="tel" id="cfgWhatsapp" class="form-control" maxlength="20"
                       placeholder="Ej: 88001234" value="${escHtml(PageConfig.config.whatsapp_comprobantes)}" />
              </div>
              <div class="form-text">
                Para Costa Rica basta con los 8 dígitos; el código de país (+506) se agrega automáticamente.
                Se usa únicamente cuando la actividad no tiene un WhatsApp propio configurado.
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              Paquetes de cupones adicionales
              <button class="btn btn-sm btn-outline-primary" onclick="PageConfig.addPaquete()">
                <i class="bi bi-plus-lg"></i> Agregar
              </button>
            </div>
            <div class="card-body p-4">
              <div id="paquetesList"></div>
              <div class="form-text mt-2">
                Opciones de compra que verá la persona en la ventana pública de inscripción.
              </div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <button class="btn btn-primary px-4" id="cfgSaveBtn" onclick="PageConfig.save()">
            <i class="bi bi-check2-circle me-1"></i>Guardar configuración
          </button>
        </div>
      </div>`;

    PageConfig.renderPaquetes();
  },

  renderPaquetes() {
    const el = document.getElementById('paquetesList');
    const paquetes = PageConfig.config.paquetes_cupones || [];
    if (paquetes.length === 0) {
      el.innerHTML = '<div class="empty-state py-3"><i class="bi bi-cart-x"></i>Sin paquetes configurados.</div>';
      return;
    }
    el.innerHTML = paquetes.map((p, i) => `
      <div class="row g-2 align-items-end mb-2">
        <div class="col-5">
          <label class="form-label small fw-semibold mb-1">Monto</label>
          <div class="input-group input-group-sm">
            <span class="input-group-text">₡</span>
            <input type="number" class="form-control" min="1" step="500"
                   value="${p.monto}" onchange="PageConfig.updatePaquete(${i}, 'monto', this.value)" />
          </div>
        </div>
        <div class="col-5">
          <label class="form-label small fw-semibold mb-1">Cupones</label>
          <input type="number" class="form-control form-control-sm" min="1" max="100"
                 value="${p.cupones}" onchange="PageConfig.updatePaquete(${i}, 'cupones', this.value)" />
        </div>
        <div class="col-2">
          <button class="btn btn-sm btn-outline-danger w-100" title="Quitar paquete"
                  onclick="PageConfig.removePaquete(${i})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>`).join('');
  },

  addPaquete() {
    PageConfig.config.paquetes_cupones.push({ monto: 5000, cupones: 1 });
    PageConfig.renderPaquetes();
  },

  removePaquete(index) {
    PageConfig.config.paquetes_cupones.splice(index, 1);
    PageConfig.renderPaquetes();
  },

  updatePaquete(index, campo, valor) {
    PageConfig.config.paquetes_cupones[index][campo] = parseInt(valor, 10) || 0;
  },

  async save() {
    const alertEl = document.getElementById('configAlert');
    alertEl.classList.add('d-none');
    const btn = document.getElementById('cfgSaveBtn');
    btn.disabled = true;
    try {
      PageConfig.config = await API.put('/api/config', {
        whatsapp_comprobantes: document.getElementById('cfgWhatsapp').value.trim(),
        paquetes_cupones: PageConfig.config.paquetes_cupones,
        compras_adicionales_habilitadas: document.getElementById('cfgComprasAdicionales').checked,
      });
      PageConfig.renderPaquetes();
      showToast('Configuración guardada correctamente', 'success');
    } catch (err) {
      alertEl.className = 'alert alert-danger';
      alertEl.textContent = err.message;
      alertEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  },
};
