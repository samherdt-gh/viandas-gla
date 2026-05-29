const API = '/api';
const ESTADOS = ['pendiente', 'en_proceso', 'listo', 'entregado', 'cancelado'];
const ESTADOS_ACTIVOS = ['pendiente', 'en_proceso', 'listo'];

let pedidoItems = [];
let viandasCache = [];
let toastTimer = null;

function escapeHtml(value) {
  const text = value == null ? '' : String(value);
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value) {
  const num = Number(value || 0);
  return `$${num.toFixed(2)}`;
}

function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showLoading(...containerIds) {
  for (const id of containerIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = '<div class="page-loading"><div class="spinner"></div><span>Cargando...</span></div>';
  }
}

function showConfirm(message, onConfirm, confirmText = 'Eliminar') {
  document.getElementById('confirm-text').textContent = message;
  const btn = document.getElementById('confirm-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.textContent = confirmText;
  newBtn.addEventListener('click', () => {
    closeModal('modal-confirm');
    onConfirm();
  });
  document.getElementById('modal-confirm').classList.add('open');
}

function showToast(message, type = 'error') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error('Error de conexión. Verificá tu conexión a internet.');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = payload?.error || `Error del servidor (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

function activarNav(page) {
  document.querySelectorAll('.sidebar nav a, .mobile-nav a').forEach((a) => a.classList.remove('active'));
  document.querySelectorAll(`.sidebar nav a[data-page="${page}"], .mobile-nav a[data-page="${page}"]`).forEach((a) => a.classList.add('active'));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
}

async function navegar(page) {
  activarNav(page);
  try {
    if (page === 'dashboard') await cargarDashboard();
    if (page === 'viandas') await cargarViandas();
    if (page === 'pedidos') await cargarPedidos();
    if (page === 'produccion') await cargarProduccion();
    if (page === 'stock') await cargarMovimientos();
  } catch (err) {
    showToast(err.message);
  }
}

document.querySelectorAll('.sidebar nav a, .mobile-nav a').forEach((a) => {
  a.addEventListener('click', async (event) => {
    event.preventDefault();
    await navegar(a.dataset.page);
  });
});

async function getViandas(force = false) {
  if (!force && viandasCache.length > 0) return viandasCache;
  viandasCache = await api('/viandas');
  return viandasCache;
}

function renderEstadoBadge(estado) {
  return `<span class="badge badge-${estado}">${escapeHtml(estado.replace('_', ' '))}</span>`;
}

async function cargarDashboard() {
  showLoading('stats-grid', 'entregas-pendientes', 'recientes-list');
  const s = await api('/stats');
  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = `
    <div class="stat-card"><div class="label">Viandas</div><div class="value">${s.totalViandas}</div></div>
    <div class="stat-card"><div class="label">Stock total</div><div class="value">${s.totalStock}</div></div>
    <div class="stat-card"><div class="label">Pedidos activos</div><div class="value">${s.pedidosActivos}</div></div>
    <div class="stat-card"><div class="label">Pedidos hoy</div><div class="value">${s.pedidosHoy}</div></div>
    <div class="stat-card"><div class="label">Ingresos hoy</div><div class="value">${formatMoney(s.ingresosHoy)}</div></div>
    <div class="stat-card"><div class="label">Ganancia hoy</div><div class="value">${formatMoney(s.gananciaHoy)}</div></div>
    <div class="stat-card"><div class="label">Stock bajo</div><div class="value">${s.productosBajos}</div></div>
    <div class="stat-card"><div class="label">A producir</div><div class="value">${s.aProducir}</div></div>
  `;

  const alerta = document.getElementById('alerta-produccion');
  if (s.aProducir > 0) {
    alerta.innerHTML = `
      <div class="alert alert-warning">
        ⚠️ Hay <strong>${s.aProducir}</strong> viandas por producir.
        <a href="#" onclick="navegar('produccion');return false;">Ver plan</a>
      </div>
    `;
  } else {
    alerta.innerHTML = '<div class="alert alert-success">✅ No hay producción pendiente.</div>';
  }

  const pendientes = document.getElementById('entregas-pendientes');
  if (!s.entregasPendientes?.length) {
    pendientes.innerHTML = '<div class="empty-state">No hay entregas pendientes.</div>';
  } else {
    pendientes.innerHTML = s.entregasPendientes.map((p) => `
      <div class="card-list-item">
        <div class="row">
          <span><strong>#${p.id}</strong> · ${escapeHtml(p.cliente)}</span>
          ${renderEstadoBadge(p.estado)}
        </div>
        <div class="row">
          <span class="label">Entrega</span>
          <span class="value">${formatDate(p.fecha_entrega)}</span>
        </div>
        <div class="row">
          <span class="label">Total</span>
          <span class="value">${formatMoney(p.total_venta)}</span>
        </div>
      </div>
    `).join('');
  }

  const recientes = document.getElementById('recientes-list');
  if (!s.pedidosRecientes?.length) {
    recientes.innerHTML = '<div class="empty-state">No hay pedidos recientes.</div>';
  } else {
    recientes.innerHTML = s.pedidosRecientes.map((p) => `
      <div class="card-list-item">
        <div class="row">
          <span><strong>#${p.id}</strong> · ${escapeHtml(p.cliente)}</span>
          ${renderEstadoBadge(p.estado)}
        </div>
        <div class="row">
          <span class="label">${formatDate(p.created_at)}</span>
          <span class="value">${formatMoney(p.total_venta)}</span>
        </div>
      </div>
    `).join('');
  }
}

function openViandaModal(vianda = null) {
  document.getElementById('vianda-id').value = vianda?.id || '';
  document.getElementById('vianda-modal-title').textContent = vianda ? 'Editar vianda' : 'Nueva vianda';
  document.getElementById('vianda-nombre').value = vianda?.nombre || '';
  document.getElementById('vianda-descripcion').value = vianda?.descripcion || '';
  document.getElementById('vianda-costo').value = vianda?.costo ?? 0;
  document.getElementById('vianda-precio').value = vianda?.precio_venta ?? 0;
  document.getElementById('vianda-stock').value = vianda?.stock ?? 0;
  document.getElementById('modal-vianda').classList.add('open');
}

async function cargarViandas() {
  showLoading('viandas-table-body', 'viandas-card-list');
  const [viandas, produccion] = await Promise.all([api('/viandas'), api('/produccion')]);
  viandasCache = viandas;
  const aProducirMap = {};
  for (const row of produccion.items || []) {
    aProducirMap[row.id] = row.a_producir;
  }

  const tbody = document.getElementById('viandas-table-body');
  const cards = document.getElementById('viandas-card-list');

  if (!viandas.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay viandas cargadas.</td></tr>';
    cards.innerHTML = '<div class="empty-state">No hay viandas cargadas.</div>';
    return;
  }

  tbody.innerHTML = viandas.map((v) => {
    const ganancia = Number(v.precio_venta || 0) - Number(v.costo || 0);
    const aProducir = aProducirMap[v.id] || 0;
    return `
      <tr>
        <td><strong>${escapeHtml(v.nombre)}</strong><br><small>${escapeHtml(v.descripcion || '')}</small></td>
        <td>${formatMoney(v.costo)}</td>
        <td>${formatMoney(v.precio_venta)}</td>
        <td style="color:${ganancia >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(ganancia)}</td>
        <td style="font-weight:700;color:${v.stock <= 0 ? 'var(--danger)' : v.stock <= 5 ? 'var(--warning)' : 'var(--text)'}">${v.stock}</td>
        <td>${aProducir > 0 ? `${aProducir} ⚠️` : '—'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editarVianda(${v.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarVianda(${v.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  cards.innerHTML = viandas.map((v) => {
    const ganancia = Number(v.precio_venta || 0) - Number(v.costo || 0);
    const aProducir = aProducirMap[v.id] || 0;
    return `
      <div class="card-list-item">
        <div class="row">
          <span><strong>${escapeHtml(v.nombre)}</strong></span>
          <span class="actions">
            <button class="btn btn-outline btn-sm" onclick="editarVianda(${v.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="eliminarVianda(${v.id})">🗑️</button>
          </span>
        </div>
        <div class="row"><span class="label">Costo</span><span class="value">${formatMoney(v.costo)}</span></div>
        <div class="row"><span class="label">Venta</span><span class="value">${formatMoney(v.precio_venta)}</span></div>
        <div class="row"><span class="label">Ganancia</span><span class="value">${formatMoney(ganancia)}</span></div>
        <div class="row"><span class="label">Stock</span><span class="value">${v.stock}</span></div>
        <div class="row"><span class="label">A producir</span><span class="value">${aProducir > 0 ? `${aProducir} ⚠️` : '—'}</span></div>
      </div>
    `;
  }).join('');
}

async function editarVianda(id) {
  const viandas = await getViandas(true);
  const vianda = viandas.find((v) => Number(v.id) === Number(id));
  if (!vianda) return showToast('Vianda no encontrada');
  openViandaModal(vianda);
}

async function guardarVianda() {
  try {
    const id = document.getElementById('vianda-id').value;
    const body = {
      nombre: document.getElementById('vianda-nombre').value.trim(),
      descripcion: document.getElementById('vianda-descripcion').value.trim(),
      costo: document.getElementById('vianda-costo').value,
      precio_venta: document.getElementById('vianda-precio').value,
      stock: document.getElementById('vianda-stock').value
    };

    if (!body.nombre) {
      return showToast('El nombre es obligatorio');
    }

    if (id) {
      await api(`/viandas/${id}`, { method: 'PUT', body });
      showToast('Vianda actualizada', 'success');
    } else {
      await api('/viandas', { method: 'POST', body });
      showToast('Vianda creada', 'success');
    }

    closeModal('modal-vianda');
    await Promise.all([cargarViandas(), cargarDashboard(), cargarProduccion()]);
  } catch (err) {
    showToast(err.message);
  }
}

async function eliminarVianda(id) {
  showConfirm('¿Eliminar esta vianda?', async () => {
    try {
      await api(`/viandas/${id}`, { method: 'DELETE' });
      showToast('Vianda eliminada', 'success');
      await Promise.all([cargarViandas(), cargarDashboard(), cargarProduccion()]);
    } catch (err) {
      showToast(err.message);
    }
  });
}

async function cargarPedidos() {
  showLoading('pedidos-table-body', 'pedidos-card-list');
  const pedidos = await api('/pedidos');
  const tbody = document.getElementById('pedidos-table-body');
  const cards = document.getElementById('pedidos-card-list');

  if (!pedidos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay pedidos todavía.</td></tr>';
    cards.innerHTML = '<div class="empty-state">No hay pedidos todavía.</div>';
    return;
  }

  tbody.innerHTML = pedidos.map((p) => `
    <tr>
      <td>#${p.id}</td>
      <td>${escapeHtml(p.cliente)}</td>
      <td>${formatDate(p.fecha_entrega)}</td>
      <td>${p.items_count || 0}</td>
      <td>${formatMoney(p.total_venta)}</td>
      <td>${renderEstadoBadge(p.estado)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="verPedido(${p.id})">👁️</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarPedido(${p.id})">🗑️</button>
        <select class="estado-select" onchange="cambiarEstado(${p.id}, this.value)">
          ${ESTADOS.map((e) => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e.replace('_', ' ')}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = pedidos.map((p) => `
    <div class="card-list-item">
      <div class="row">
        <span><strong>#${p.id}</strong> · ${escapeHtml(p.cliente)}</span>
        ${renderEstadoBadge(p.estado)}
      </div>
      <div class="row"><span class="label">Entrega</span><span class="value">${formatDate(p.fecha_entrega)}</span></div>
      <div class="row"><span class="label">Items</span><span class="value">${p.items_count || 0}</span></div>
      <div class="row"><span class="label">Total</span><span class="value">${formatMoney(p.total_venta)}</span></div>
      <div class="row">
        <span class="label">${formatDate(p.created_at)}</span>
        <span class="actions">
          <button class="btn btn-outline btn-sm" onclick="verPedido(${p.id})">👁️</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarPedido(${p.id})">🗑️</button>
        </span>
      </div>
      <select class="estado-select" onchange="cambiarEstado(${p.id}, this.value)">
        ${ESTADOS.map((e) => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e.replace('_', ' ')}</option>`).join('')}
      </select>
    </div>
  `).join('');
}

function showPedidoDetail(p) {
  document.getElementById('pedido-detail-title').textContent = `Pedido #${p.id} · ${escapeHtml(p.cliente)}`;

  const itemsHtml = (p.items || []).map((item) => `
    <div class="detail-item">
      <span class="detail-item-name">${escapeHtml(item.vianda_nombre)}</span>
      <span class="detail-item-qty">×${item.cantidad}</span>
      <span class="detail-item-total">${formatMoney(item.precio_unitario * item.cantidad)}</span>
    </div>
  `).join('');

  document.getElementById('pedido-detail-content').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Información</div>
      <div class="detail-row">
        <span class="detail-label">Estado</span>
        <span class="detail-value">${renderEstadoBadge(p.estado)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Entrega</span>
        <span class="detail-value">${formatDate(p.fecha_entrega)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Creado</span>
        <span class="detail-value">${formatDate(p.created_at)}</span>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Items (${(p.items || []).length})</div>
      <div class="detail-items">${itemsHtml || '<div class="empty-state">Sin items</div>'}</div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Totales</div>
      <div class="detail-row">
        <span class="detail-label">Venta</span>
        <span class="detail-value">${formatMoney(p.total_venta)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Costo</span>
        <span class="detail-value">${formatMoney(p.total_costo)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Ganancia</span>
        <span class="detail-value" style="color:${Number(p.ganancia) >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(p.ganancia)}</span>
      </div>
    </div>
    ${p.notas ? `<div class="detail-section"><div class="detail-section-title">Notas</div><div class="detail-notes">${escapeHtml(p.notas)}</div></div>` : ''}
  `;

  document.getElementById('modal-pedido-detail').classList.add('open');
}

async function verPedido(id) {
  try {
    const p = await api(`/pedidos/${id}`);
    showPedidoDetail(p);
  } catch (err) {
    showToast(err.message);
  }
}

async function cambiarEstado(id, estado) {
  try {
    await api(`/pedidos/${id}/estado`, { method: 'PUT', body: { estado } });
    showToast('Estado actualizado', 'success');
    await Promise.all([cargarPedidos(), cargarDashboard(), cargarProduccion(), cargarMovimientos(), cargarViandas()]);
  } catch (err) {
    showToast(err.message);
  }
}

async function eliminarPedido(id) {
  showConfirm('¿Eliminar este pedido?', async () => {
    try {
      await api(`/pedidos/${id}`, { method: 'DELETE' });
      showToast('Pedido eliminado', 'success');
      await Promise.all([cargarPedidos(), cargarDashboard(), cargarProduccion()]);
    } catch (err) {
      showToast(err.message);
    }
  });
}

async function openPedidoModal() {
  try {
    await getViandas(true);
    pedidoItems = [];
    document.getElementById('pedido-cliente').value = '';
    document.getElementById('pedido-fecha-entrega').value = '';
    document.getElementById('pedido-notas').value = '';
    document.getElementById('pedido-items-container').innerHTML = '';
    agregarItemPedido();
    document.getElementById('modal-pedido').classList.add('open');
  } catch (err) {
    showToast(err.message);
  }
}

function buildViandaOptions() {
  return `
    <option value="">Seleccionar</option>
    ${viandasCache.map((v) => `<option value="${v.id}">${escapeHtml(v.nombre)} (${formatMoney(v.precio_venta)})</option>`).join('')}
  `;
}

function agregarItemPedido() {
  if (!viandasCache.length) {
    return showToast('Primero cargá una vianda');
  }

  const idx = pedidoItems.length;
  pedidoItems.push({ vianda_id: '', cantidad: 1 });

  const container = document.getElementById('pedido-items-container');
  const div = document.createElement('div');
  div.id = `pedido-item-${idx}`;
  div.className = 'pedido-item';
  div.innerHTML = `
    <div class="pedido-item-row">
      <select id="pi-vianda-${idx}">${buildViandaOptions()}</select>
      <input id="pi-cant-${idx}" type="number" min="1" value="1">
      <button class="btn btn-danger btn-sm" onclick="removerItemPedido(${idx})">✕</button>
    </div>
  `;
  container.appendChild(div);
}

function removerItemPedido(idx) {
  pedidoItems[idx] = null;
  document.getElementById(`pedido-item-${idx}`)?.remove();
}

async function guardarPedido() {
  try {
    const cliente = document.getElementById('pedido-cliente').value.trim();
    const fechaEntrega = document.getElementById('pedido-fecha-entrega').value;
    const notas = document.getElementById('pedido-notas').value.trim();

    if (!cliente) return showToast('El cliente es obligatorio');

    const items = [];
    for (let i = 0; i < pedidoItems.length; i += 1) {
      if (!pedidoItems[i]) continue;
      const viandaId = Number(document.getElementById(`pi-vianda-${i}`)?.value || 0);
      const cantidad = Number(document.getElementById(`pi-cant-${i}`)?.value || 0);
      if (viandaId > 0 && cantidad > 0) {
        items.push({ vianda_id: viandaId, cantidad });
      }
    }

    if (!items.length) return showToast('Agregá al menos un item');

    await api('/pedidos', {
      method: 'POST',
      body: {
        cliente,
        fecha_entrega: fechaEntrega || null,
        notas,
        items
      }
    });

    showToast('Pedido creado', 'success');
    closeModal('modal-pedido');
    await Promise.all([cargarPedidos(), cargarDashboard(), cargarProduccion()]);
  } catch (err) {
    showToast(err.message);
  }
}

async function cargarMovimientos() {
  showLoading('movimientos-table-body', 'movimientos-card-list');
  const movimientos = await api('/movimientos');
  const tbody = document.getElementById('movimientos-table-body');
  const cards = document.getElementById('movimientos-card-list');

  if (!movimientos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin movimientos.</td></tr>';
    cards.innerHTML = '<div class="empty-state">Sin movimientos.</div>';
    return;
  }

  tbody.innerHTML = movimientos.map((m) => `
    <tr>
      <td>${formatDate(m.created_at)}</td>
      <td>${escapeHtml(m.vianda_nombre)}</td>
      <td><span class="badge badge-${m.tipo}">${escapeHtml(m.tipo)}</span></td>
      <td style="font-weight:700;color:${m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)'}">
        ${m.tipo === 'entrada' ? '+' : '-'}${Math.abs(m.cantidad)}
      </td>
      <td>${escapeHtml(m.motivo || '')}</td>
    </tr>
  `).join('');

  cards.innerHTML = movimientos.map((m) => `
    <div class="card-list-item">
      <div class="row">
        <span><strong>${escapeHtml(m.vianda_nombre)}</strong></span>
        <span class="badge badge-${m.tipo}">${escapeHtml(m.tipo)}</span>
      </div>
      <div class="row">
        <span class="label">${formatDate(m.created_at)}</span>
        <span class="value" style="color:${m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)'}">
          ${m.tipo === 'entrada' ? '+' : '-'}${Math.abs(m.cantidad)}
        </span>
      </div>
      <div class="row"><span class="label">Motivo</span><span class="value">${escapeHtml(m.motivo || '')}</span></div>
    </div>
  `).join('');
}

async function cargarProduccion() {
  showLoading('produccion-table-body', 'produccion-card-list', 'produccion-resumen');
  const plan = await api('/produccion');
  const tbody = document.getElementById('produccion-table-body');
  const cards = document.getElementById('produccion-card-list');
  const resumen = document.getElementById('produccion-resumen');

  resumen.innerHTML = plan.total > 0
    ? `<div class="alert alert-warning">⚠️ Total a producir: <strong>${plan.total}</strong> unidades</div>`
    : '<div class="alert alert-success">✅ Todo cubierto con stock actual.</div>';

  if (!plan.items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay viandas registradas.</td></tr>';
    cards.innerHTML = '<div class="empty-state">No hay viandas registradas.</div>';
    return;
  }

  tbody.innerHTML = plan.items.map((item) => `
    <tr style="${item.a_producir > 0 ? 'background:#fff7ed;' : ''}">
      <td><strong>${escapeHtml(item.nombre)}</strong></td>
      <td>${item.stock}</td>
      <td>${item.pendientes}</td>
      <td style="font-weight:700;color:${item.a_producir > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${item.a_producir > 0 ? `${item.a_producir} ⚠️` : '—'}
      </td>
      <td>
        ${item.a_producir > 0
    ? `<button class="btn btn-success btn-sm" onclick="openProduccionModal(${item.id}, ${item.a_producir})">Registrar</button>`
    : ''}
      </td>
    </tr>
  `).join('');

  cards.innerHTML = plan.items.map((item) => `
    <div class="card-list-item" style="${item.a_producir > 0 ? 'background:#fff7ed;' : ''}">
      <div class="row">
        <span><strong>${escapeHtml(item.nombre)}</strong></span>
        <span>${item.a_producir > 0 ? '⚠️ Producir' : '✅ OK'}</span>
      </div>
      <div class="row"><span class="label">Stock</span><span class="value">${item.stock}</span></div>
      <div class="row"><span class="label">Pendientes</span><span class="value">${item.pendientes}</span></div>
      <div class="row"><span class="label">A producir</span><span class="value">${item.a_producir > 0 ? item.a_producir : '—'}</span></div>
      ${item.a_producir > 0 ? `<button class="btn btn-success btn-sm" onclick="openProduccionModal(${item.id}, ${item.a_producir})">Registrar producción</button>` : ''}
    </div>
  `).join('');
}

async function openProduccionModal(defaultViandaId = '', defaultCantidad = 1) {
  try {
    const viandas = await getViandas(true);
    const select = document.getElementById('produccion-vianda');
    select.innerHTML = `
      <option value="">Seleccionar vianda</option>
      ${viandas.map((v) => `<option value="${v.id}">${escapeHtml(v.nombre)}</option>`).join('')}
    `;

    if (defaultViandaId) select.value = String(defaultViandaId);
    document.getElementById('produccion-cantidad').value = defaultCantidad || 1;
    document.getElementById('produccion-motivo').value = '';
    document.getElementById('modal-produccion').classList.add('open');
  } catch (err) {
    showToast(err.message);
  }
}

async function guardarProduccion() {
  try {
    const vianda_id = Number(document.getElementById('produccion-vianda').value || 0);
    const cantidad = Number(document.getElementById('produccion-cantidad').value || 0);
    const motivo = document.getElementById('produccion-motivo').value.trim();

    if (!vianda_id) return showToast('Seleccioná una vianda');
    if (cantidad <= 0) return showToast('La cantidad debe ser mayor a 0');

    await api('/produccion', {
      method: 'POST',
      body: { vianda_id, cantidad, motivo }
    });

    showToast('Producción registrada', 'success');
    closeModal('modal-produccion');
    await Promise.all([cargarProduccion(), cargarViandas(), cargarDashboard(), cargarMovimientos()]);
  } catch (err) {
    showToast(err.message);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.getElementById('modal-vianda').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal('modal-vianda');
});

document.getElementById('modal-pedido').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal('modal-pedido');
});

document.getElementById('modal-produccion').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal('modal-produccion');
});

document.getElementById('modal-confirm').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal('modal-confirm');
});

document.getElementById('modal-pedido-detail').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal('modal-pedido-detail');
});

navegar('dashboard').catch((err) => showToast(err.message));
