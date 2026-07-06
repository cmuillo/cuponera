/**
 * main.js — SPA Router + utilidades globales
 */

// ---- UTILIDADES GLOBALES ----

function showToast(msg, type = 'success') {
  const el = document.getElementById('appToast');
  const msgEl = document.getElementById('toastMsg');
  el.className = `toast align-items-center border-0 text-bg-${type}`;
  msgEl.textContent = msg;
  const toast = new bootstrap.Toast(el, { delay: 3500 });
  toast.show();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Normaliza celular para wa.me (agrega código de país 57 si es colombiano sin +) */
function normalizePhone(cel) {
  const digits = cel.replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10) return '57' + digits;
  return digits;
}

function buildWaLink(celular, text) {
  const phone = normalizePhone(celular);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function buildCuponWaText(cupon) {
  const fecha = formatDate(cupon.fecha_sorteo);
  const nombre = cupon.nombre_persona || 'Participante';
  return `🎟️ *¡Tu cupón ha sido registrado!*\n\n` +
    `📋 Sorteo: *${cupon.sorteo_nombre}*\n` +
    `📅 Fecha del sorteo: ${fecha}\n` +
    `🎫 Número de cupón: *${cupon.codigo}*\n` +
    `👤 Titular: ${nombre}\n` +
    `🪪 Cédula: ${cupon.cedula}\n` +
    `📱 Celular: ${cupon.celular}\n` +
    (cupon.sorteo_descripcion ? `\nℹ️ ${cupon.sorteo_descripcion}\n` : '') +
    `\n¡Mucha suerte! 🍀`;
}

// ---- AUTENTICACIÓN ----

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.replace('/login.html');
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.remove('d-none');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('d-none');
}

// ---- ROUTER ----

const PAGES = {
  generar:  { title: 'Generar Cupón',            render: (c) => PageGenerar.render(c) },
  historial:{ title: 'Historial de Cupones',     render: (c) => PageHistorial.render(c) },
  reportes: { title: 'Reportes',                 render: (c) => PageReportes.render(c) },
  tombola:  { title: 'Tómbola',                  render: (c) => PageTombola.render(c) },
  sorteos:  { title: 'Configuración de Sorteos', render: (c) => PageSorteos.render(c) },
  cuenta:   { title: 'Mi Cuenta',                render: (c) => PageCuenta.render(c) },
};

async function navigate(hash) {
  const page = hash.replace('#', '') || 'generar';
  const config = PAGES[page] || PAGES['generar'];

  // Update nav active state
  document.querySelectorAll('.sidebar-nav .nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  // Update topbar title
  document.getElementById('topbarTitle').textContent = config.title;

  // Render page
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="d-flex justify-content-center pt-5"><div class="spinner-border text-primary"></div></div>';
  try {
    await config.render(content);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-danger">Error al cargar la página: ${err.message}</div>`;
  }

  closeSidebar();
}

// ---- INIT ----

(function init() {
  if (!localStorage.getItem('token')) {
    window.location.replace('/login.html');
    return;
  }

  // Mostrar usuario
  const username = localStorage.getItem('username') || 'admin';
  document.getElementById('sidebarUser').innerHTML =
    `<i class="bi bi-person-circle me-1"></i>${username}`;

  // Navegación por hash
  window.addEventListener('hashchange', () => navigate(location.hash));
  navigate(location.hash || '#generar');
})();

// ---- PÁGINA: MI CUENTA ----
const PageCuenta = {
  async render(container) {
    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-shield-lock-fill"></i>Mi Cuenta</h1>
      <div class="row justify-content-center">
        <div class="col-md-6 col-lg-5">
          <div class="card">
            <div class="card-header">Cambiar Contraseña</div>
            <div class="card-body p-4">
              <div id="cuentaAlert" class="d-none"></div>
              <form id="cuentaForm">
                <div class="mb-3">
                  <label class="form-label">Contraseña actual</label>
                  <input type="password" id="currentPwd" class="form-control" required />
                </div>
                <div class="mb-3">
                  <label class="form-label">Nueva contraseña <span class="text-muted small">(mín. 8 caracteres)</span></label>
                  <input type="password" id="newPwd" class="form-control" minlength="8" required />
                </div>
                <div class="mb-4">
                  <label class="form-label">Confirmar nueva contraseña</label>
                  <input type="password" id="confirmPwd" class="form-control" minlength="8" required />
                </div>
                <button type="submit" class="btn btn-primary w-100">
                  <i class="bi bi-check2-circle me-1"></i>Actualizar Contraseña
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>`;

    container.querySelector('#cuentaForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = container.querySelector('#cuentaAlert');
      const newPwd = container.querySelector('#newPwd').value;
      const confirmPwd = container.querySelector('#confirmPwd').value;

      if (newPwd !== confirmPwd) {
        alertEl.className = 'alert alert-danger';
        alertEl.textContent = 'Las contraseñas no coinciden.';
        alertEl.classList.remove('d-none');
        return;
      }
      try {
        const res = await API.put('/api/auth/password', {
          currentPassword: container.querySelector('#currentPwd').value,
          newPassword: newPwd,
        });
        alertEl.className = 'alert alert-success';
        alertEl.textContent = res.message;
        alertEl.classList.remove('d-none');
        e.target.reset();
        showToast('Contraseña actualizada correctamente', 'success');
      } catch (err) {
        alertEl.className = 'alert alert-danger';
        alertEl.textContent = err.message;
        alertEl.classList.remove('d-none');
      }
    });
  },
};
