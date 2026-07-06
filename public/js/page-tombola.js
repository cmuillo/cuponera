/**
 * page-tombola.js — Tómbola con ruleta Canvas HTML5
 */
const PageTombola = {
  cupones: [],
  winner: null,
  spinning: false,
  angle: 0,          // ángulo actual del canvas
  mode: 'unico',     // 'unico' | 'multiple'

  async render(container) {
    let sorteos = [];
    try { sorteos = await API.get('/api/sorteos?activo=true'); } catch(e) {}

    const sorteoOpts = sorteos.length === 0
      ? '<option value="">— No hay sorteos activos —</option>'
      : ['<option value="">Seleccione un sorteo...</option>',
          ...sorteos.map(s => `<option value="${s.id}">${escHtml(s.nombre)} (${formatDate(s.fecha_sorteo)})</option>`)
        ].join('');

    container.innerHTML = `
      <h1 class="page-title"><i class="bi bi-stars"></i>Tómbola</h1>
      <div class="row g-4">

        <!-- Controles -->
        <div class="col-lg-4">
          <div class="card mb-3">
            <div class="card-header">Configuración</div>
            <div class="card-body">
              <div class="mb-3">
                <label class="form-label fw-semibold">Sorteo activo</label>
                <select id="tombolaSorteo" class="form-select" onchange="PageTombola.onSorteoChange()">
                  ${sorteoOpts}
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Modo de sorteo</label>
                <div class="btn-group w-100" role="group">
                  <input type="radio" class="btn-check" name="tombMode" id="modeUnico" value="unico" checked onchange="PageTombola.setMode('unico')" />
                  <label class="btn btn-outline-primary" for="modeUnico">
                    <i class="bi bi-trophy me-1"></i>Ganador único
                  </label>
                  <input type="radio" class="btn-check" name="tombMode" id="modeMultiple" value="multiple" onchange="PageTombola.setMode('multiple')" />
                  <label class="btn btn-outline-primary" for="modeMultiple">
                    <i class="bi bi-list-ol me-1"></i>Extracción múltiple
                  </label>
                </div>
                <div class="form-text mt-1" id="modeDesc">Gira una vez y elige un ganador.</div>
              </div>

              <div id="tombStats" class="d-none">
                <hr />
                <div class="row g-2 text-center">
                  <div class="col-4">
                    <div class="fw-bold text-primary fs-5" id="statDisp">—</div>
                    <div class="text-muted" style="font-size:.75rem">Disponibles</div>
                  </div>
                  <div class="col-4">
                    <div class="fw-bold text-warning fs-5" id="statGan">—</div>
                    <div class="text-muted" style="font-size:.75rem">Ganadores</div>
                  </div>
                  <div class="col-4">
                    <div class="fw-bold text-secondary fs-5" id="statTot">—</div>
                    <div class="text-muted" style="font-size:.75rem">Total</div>
                  </div>
                </div>
                <div class="mt-2">
                  <button class="btn btn-outline-warning btn-sm w-100" onclick="PageTombola.resetGanadores()" id="btnReset">
                    <i class="bi bi-arrow-counterclockwise me-1"></i>Reiniciar ganadores
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Ganadores extraídos (modo múltiple) -->
          <div class="card d-none" id="ganadoresCard">
            <div class="card-header">Ganadores extraídos</div>
            <div class="card-body p-2">
              <ul id="ganadoresList" class="list-group list-group-flush small"></ul>
            </div>
          </div>
        </div>

        <!-- Ruleta -->
        <div class="col-lg-8">
          <div class="card">
            <div class="card-body text-center py-4">

              <!-- Vacío / cargando -->
              <div id="tombEmpty" class="empty-state py-5">
                <i class="bi bi-arrow-up-circle"></i>
                Selecciona un sorteo para comenzar
              </div>

              <!-- Wheel -->
              <div id="wheelWrapper" class="d-none">
                <div id="wheelContainer" class="mb-3">
                  <div class="wheel-pointer">▼</div>
                  <canvas id="wheelCanvas" width="500" height="500"></canvas>
                </div>

                <button id="btnGirar" class="btn btn-primary btn-lg px-5 py-3 mb-3 fw-bold"
                        onclick="PageTombola.girar()" style="font-size:1.2rem">
                  <i class="bi bi-arrow-repeat me-2"></i>¡Girar!
                </button>

                <!-- Banner ganador -->
                <div id="winnerBanner" class="d-none mt-3">
                  <div class="winner-code" id="winnerCode"></div>
                  <div class="mt-2" id="winnerInfo" style="opacity:.9"></div>
                  <div class="mt-3 d-flex gap-2 justify-content-center flex-wrap">
                    <a id="btnWaWinner" href="#" target="_blank" rel="noopener noreferrer"
                       class="btn btn-whatsapp">
                      <i class="bi bi-whatsapp me-1"></i>WhatsApp
                    </a>
                    <button class="btn btn-warning d-none" id="btnConfirmar"
                            onclick="PageTombola.confirmarGanador()">
                      <i class="bi bi-check-circle me-1"></i>Confirmar ganador
                    </button>
                    <button class="btn btn-light" onclick="PageTombola.girar()">
                      <i class="bi bi-arrow-repeat me-1"></i>Volver a girar
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>`;
  },

  setMode(mode) {
    PageTombola.mode = mode;
    const desc = document.getElementById('modeDesc');
    const ganadoresCard = document.getElementById('ganadoresCard');
    if (mode === 'unico') {
      desc.textContent = 'Gira una vez y elige un ganador.';
      ganadoresCard.classList.add('d-none');
    } else {
      desc.textContent = 'Cada giro extrae un cupón. Los ganadores no vuelven a salir.';
      ganadoresCard.classList.remove('d-none');
    }
  },

  async onSorteoChange() {
    const sorteoId = document.getElementById('tombolaSorteo').value;
    if (!sorteoId) {
      document.getElementById('tombEmpty').classList.remove('d-none');
      document.getElementById('wheelWrapper').classList.add('d-none');
      document.getElementById('tombStats').classList.add('d-none');
      return;
    }
    await PageTombola.loadCupones(sorteoId);
  },

  async loadCupones(sorteoId) {
    try {
      const all = await API.get(`/api/cupones?sorteoId=${sorteoId}`);
      PageTombola.cupones = all;
      const disponibles = all.filter(c => !c.ganador);
      const ganados = all.filter(c => c.ganador);

      // Actualizar stats
      document.getElementById('statDisp').textContent = disponibles.length;
      document.getElementById('statGan').textContent = ganados.length;
      document.getElementById('statTot').textContent = all.length;
      document.getElementById('tombStats').classList.remove('d-none');

      if (disponibles.length === 0) {
        document.getElementById('tombEmpty').innerHTML =
          '<i class="bi bi-trophy-fill" style="color:#f59e0b"></i>¡Todos los cupones han sido sorteados!';
        document.getElementById('tombEmpty').classList.remove('d-none');
        document.getElementById('wheelWrapper').classList.add('d-none');
        return;
      }

      document.getElementById('tombEmpty').classList.add('d-none');
      document.getElementById('wheelWrapper').classList.remove('d-none');
      document.getElementById('winnerBanner').classList.add('d-none');
      PageTombola.winner = null;
      PageTombola.angle = 0;

      PageTombola.drawWheel(disponibles, 0);
      PageTombola.updateGanadoresList(ganados);
    } catch (err) {
      showToast('Error al cargar cupones: ' + err.message, 'danger');
    }
  },

  /** Dibuja la ruleta con los cupones disponibles */
  drawWheel(cupones, rotationAngle) {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2;
    const radius = size / 2 - 10;
    const n = cupones.length;
    const segAngle = (2 * Math.PI) / n;

    // Paleta de colores
    const colors = [
      '#4f46e5','#7c3aed','#db2777','#dc2626','#d97706',
      '#059669','#0891b2','#0284c7','#9333ea','#c026d3',
    ];

    ctx.clearRect(0, 0, size, size);

    // Sombra exterior
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < n; i++) {
      const startAngle = rotationAngle + i * segAngle - Math.PI / 2;
      const endAngle = startAngle + segAngle;
      const color = colors[i % colors.length];

      // Segmento
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Texto del código (solo si hay espacio suficiente)
      if (n <= 60) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startAngle + segAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        const fontSize = Math.max(7, Math.min(13, 280 / n));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.shadowBlur = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        const label = cupones[i].codigo.length > 10
          ? cupones[i].codigo.substring(0, 10)
          : cupones[i].codigo;
        ctx.fillText(label, radius - 10, 4);
        ctx.restore();
      }
    }

    // Círculo central
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎟️', cx, cy);
  },

  girar() {
    if (PageTombola.spinning) return;

    const disponibles = PageTombola.cupones.filter(c => !c.ganador);
    if (disponibles.length === 0) {
      showToast('No hay cupones disponibles', 'warning');
      return;
    }

    // Ocultar banner anterior
    document.getElementById('winnerBanner').classList.add('d-none');

    // Elegir ganador al azar ANTES de la animación
    const winnerIdx = Math.floor(Math.random() * disponibles.length);
    PageTombola.winner = disponibles[winnerIdx];

    const n = disponibles.length;
    const segAngle = (2 * Math.PI) / n;

    // Ángulo en que debe parar el segmento ganador bajo el puntero (top = -π/2)
    // El puntero está en la parte superior. El segmento i empieza en rotationAngle + i*segAngle - π/2
    // Queremos que el CENTRO del segmento ganador esté en el tope (ángulo 0 desde -π/2)
    // => rotationAngle + winnerIdx*segAngle - π/2 + segAngle/2 = -π/2 (módulo 2π)
    // => rotationAngle = -winnerIdx*segAngle - segAngle/2 + kπ (múltiplos de 2π)

    const targetAngle = -(winnerIdx * segAngle + segAngle / 2);
    // Agregar vueltas completas (5-8 vueltas) para la animación
    const extraSpins = (5 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const finalAngle = targetAngle - extraSpins;

    PageTombola.spinning = true;
    document.getElementById('btnGirar').disabled = true;

    const startAngle = PageTombola.angle;
    const duration = 4000 + Math.random() * 1500; // 4-5.5s
    const startTime = performance.now();

    function easeOut(t) {
      return 1 - Math.pow(1 - t, 4); // quartic ease-out
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const currentAngle = startAngle + (finalAngle - startAngle) * easeOut(t);

      PageTombola.angle = currentAngle;
      PageTombola.drawWheel(disponibles, currentAngle);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        PageTombola.spinning = false;
        document.getElementById('btnGirar').disabled = false;
        PageTombola.showWinner();
      }
    }

    requestAnimationFrame(animate);
  },

  showWinner() {
    const cupon = PageTombola.winner;
    if (!cupon) return;

    document.getElementById('winnerCode').textContent = cupon.codigo;
    document.getElementById('winnerInfo').innerHTML =
      `👤 ${escHtml(cupon.nombre_persona || 'Participante')} &nbsp;|&nbsp; ` +
      `🪪 ${escHtml(cupon.cedula)} &nbsp;|&nbsp; ` +
      `📱 ${escHtml(cupon.celular)}`;

    // WhatsApp con mensaje de ganador
    const sorteoId = document.getElementById('tombolaSorteo').value;
    const sorteoNombre = document.querySelector('#tombolaSorteo option:checked').text;
    const waText = `🏆 *¡FELICITACIONES, GANASTE!* 🏆\n\n` +
      `🎟️ Tu cupón *${cupon.codigo}* fue seleccionado en:\n` +
      `📋 Sorteo: *${sorteoNombre}*\n` +
      `👤 Titular: ${cupon.nombre_persona || 'Participante'}\n` +
      `🪪 Cédula: ${cupon.cedula}\n\n¡Eres el afortunado ganador! 🎉`;

    document.getElementById('btnWaWinner').href = buildWaLink(cupon.celular, waText);

    // Mostrar botón confirmar en modo múltiple
    const btnConf = document.getElementById('btnConfirmar');
    if (PageTombola.mode === 'multiple') {
      btnConf.classList.remove('d-none');
    } else {
      btnConf.classList.add('d-none');
    }

    document.getElementById('winnerBanner').classList.remove('d-none');
    document.getElementById('winnerBanner').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async confirmarGanador() {
    const cupon = PageTombola.winner;
    if (!cupon) return;
    try {
      await API.patch(`/api/cupones/${cupon.id}/ganador`, { ganador: true });

      // Actualizar lista local
      const idx = PageTombola.cupones.findIndex(c => c.id === cupon.id);
      if (idx !== -1) PageTombola.cupones[idx].ganador = true;

      const disponibles = PageTombola.cupones.filter(c => !c.ganador);
      const ganados = PageTombola.cupones.filter(c => c.ganador);

      document.getElementById('statDisp').textContent = disponibles.length;
      document.getElementById('statGan').textContent = ganados.length;
      PageTombola.updateGanadoresList(ganados);
      PageTombola.winner = null;

      document.getElementById('winnerBanner').classList.add('d-none');
      PageTombola.angle = 0;
      PageTombola.drawWheel(disponibles, 0);

      if (disponibles.length === 0) {
        document.getElementById('tombEmpty').innerHTML =
          '<i class="bi bi-trophy-fill" style="color:#f59e0b"></i>¡Todos los cupones han sido sorteados!';
        document.getElementById('tombEmpty').classList.remove('d-none');
        document.getElementById('wheelWrapper').classList.add('d-none');
      }

      showToast('Ganador confirmado y removido del sorteo', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },

  updateGanadoresList(ganados) {
    const ul = document.getElementById('ganadoresList');
    if (!ul) return;
    if (ganados.length === 0) {
      ul.innerHTML = '<li class="list-group-item text-muted small">Ninguno aún</li>';
      return;
    }
    ul.innerHTML = ganados.map((c, i) => `
      <li class="list-group-item py-1 px-2 d-flex justify-content-between align-items-center">
        <span><strong class="text-warning me-1">#${i + 1}</strong>
          <code>${escHtml(c.codigo)}</code>
        </span>
        <small class="text-muted">${escHtml(c.nombre_persona || c.cedula)}</small>
      </li>`).join('');
  },

  async resetGanadores() {
    const sorteoId = document.getElementById('tombolaSorteo').value;
    if (!sorteoId) return;
    if (!confirm('¿Reiniciar todos los ganadores de este sorteo? Los cupones volverán al pool de sorteo.')) return;
    try {
      await API.post('/api/cupones/reset-ganadores', { sorteo_id: parseInt(sorteoId) });
      showToast('Ganadores reiniciados', 'success');
      await PageTombola.loadCupones(sorteoId);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  },
};
