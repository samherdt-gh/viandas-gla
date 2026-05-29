let viandas = [];
const carrito = {};

async function init() {
  try {
    viandas = await fetch('/api/viandas').then(r => r.json());
    renderViandas();
  } catch {
    document.getElementById('viandas-list').innerHTML =
      '<div class="empty-state">Error al cargar el menú. Intentalo de nuevo.</div>';
  }
}

function renderViandas() {
  const container = document.getElementById('viandas-list');
  if (!viandas.length) {
    container.innerHTML = '<div class="empty-state">No hay viandas disponibles por ahora.</div>';
    return;
  }
  container.innerHTML = viandas.map(v => `
    <div class="vianda-card">
      <div class="vianda-info">
        <div class="vianda-name">${esc(v.nombre)}</div>
        ${v.descripcion ? `<div class="vianda-desc">${esc(v.descripcion)}</div>` : ''}
      </div>
      <div class="vianda-price">$${Math.round(v.precio_venta || 0)}</div>
      <button class="vianda-add" id="btn-${v.id}" onclick="toggleCarrito(${v.id})">
        ${carrito[v.id] ? 'Sacar' : 'Agregar'}
      </button>
    </div>
  `).join('');
}

function toggleCarrito(id) {
  if (carrito[id]) {
    delete carrito[id];
  } else {
    const v = viandas.find(x => x.id === id);
    if (v) carrito[id] = { ...v, cantidad: 1 };
  }
  renderViandas();
  renderCarrito();
}

function cambiarCantidad(id, delta) {
  if (!carrito[id]) return;
  carrito[id].cantidad = Math.max(1, carrito[id].cantidad + delta);
  renderCarrito();
}

function renderCarrito() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const ids = Object.keys(carrito);

  if (!ids.length) {
    container.innerHTML = '<div class="empty-state">Agregá viandas del menú</div>';
    totalEl.textContent = 'Total: $0';
    return;
  }

  let total = 0;
  container.innerHTML = ids.map(id => {
    const item = carrito[id];
    const subtotal = item.cantidad * Number(item.precio_venta || 0);
    total += subtotal;
    return `
      <div class="cart-item">
        <span class="cart-item-name">${esc(item.nombre)}</span>
        <div class="cart-item-qty">
          <button class="cart-qty-btn" onclick="cambiarCantidad(${id}, -1)">−</button>
          <span>${item.cantidad}</span>
          <button class="cart-qty-btn" onclick="cambiarCantidad(${id}, 1)">+</button>
        </div>
        <span class="cart-item-price">$${Math.round(subtotal)}</span>
      </div>
    `;
  }).join('');

  totalEl.textContent = `Total: $${Math.round(total)}`;
}

async function enviarPedido() {
  const cliente = document.getElementById('cart-cliente').value.trim();
  if (!cliente) {
    mostrarMensaje('Decinos tu nombre para tomar el pedido', 'error');
    return;
  }

  const ids = Object.keys(carrito);
  if (!ids.length) {
    mostrarMensaje('Agregá al menos una vianda', 'error');
    return;
  }

  const items = ids.map(id => ({
    vianda_id: Number(id),
    cantidad: carrito[id].cantidad
  }));

  const btn = document.getElementById('btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente,
        notas: document.getElementById('cart-notas').value.trim() || null,
        items
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al enviar');
    }

    mostrarMensaje(`✅ Pedido recibido, ${cliente}! Pasá a retirar pronto.`, 'exito');
    document.getElementById('cart-cliente').value = '';
    document.getElementById('cart-notas').value = '';
    Object.keys(carrito).forEach(k => delete carrito[k]);
    renderViandas();
    renderCarrito();
    document.getElementById('cat-cart').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    mostrarMensaje('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}

function mostrarMensaje(texto, tipo) {
  const el = document.getElementById('cart-mensaje');
  el.innerHTML = `<div class="mensaje-${tipo}">${texto}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function esc(value) {
  const text = value == null ? '' : String(value);
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

init();
