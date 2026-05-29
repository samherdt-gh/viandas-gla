let viandas = [];
const carrito = {};
let categoriaActiva = null;

async function init() {
  try {
    viandas = await fetch('/api/viandas').then(r => r.json());
    renderizarCategorias();
    renderizarMenu();
    actualizarBarra();
  } catch {
    document.getElementById('viandas-list').innerHTML =
      '<div class="empty-state">Error al cargar el menú. Intentalo de nuevo.</div>';
  }
}

function renderizarCategorias() {
  const cats = [...new Set(viandas.map(v => v.categoria).filter(Boolean))].sort();
  const container = document.getElementById('cat-categorias');
  let html = '<button class="cat-tab active" data-cat="">Todas</button>';
  for (const c of cats) {
    html += `<button class="cat-tab" data-cat="${esc(c)}">${esc(c)}</button>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      categoriaActiva = btn.dataset.cat || null;
      renderizarMenu();
    });
  });
}

function renderizarMenu() {
  const container = document.getElementById('viandas-list');
  const filtradas = categoriaActiva
    ? viandas.filter(v => v.categoria === categoriaActiva)
    : viandas;

  if (!filtradas.length) {
    container.innerHTML = '<div class="empty-state">No hay viandas en esta categoría</div>';
    return;
  }

  let html = '';
  if (categoriaActiva) {
    html += renderizarGrilla(filtradas);
  } else {
    const cats = [...new Set(viandas.map(v => v.categoria).filter(Boolean))].sort();
    const sinCat = viandas.filter(v => !v.categoria);
    for (const c of cats) {
      const items = filtradas.filter(v => v.categoria === c);
      html += `<div class="cat-group-title">${esc(c)}</div>`;
      html += renderizarGrilla(items);
    }
    if (sinCat.length) {
      html += renderizarGrilla(sinCat);
    }
  }
  container.innerHTML = html;
}

function renderizarGrilla(items) {
  return `<div class="viandas-grid">${items.map(v => {
    const enCarrito = carrito[v.id];
    const cant = enCarrito ? enCarrito.cantidad : 0;
    return `
      <div class="vianda-card${cant > 0 ? ' selected' : ''}">
        ${v.imagen ? `<div class="vianda-img" onclick="agregar(${v.id})"><img src="${esc(v.imagen)}" alt="${esc(v.nombre)}" loading="lazy"></div>` : ''}
        <div class="vianda-info" onclick="agregar(${v.id})">
          <div class="vianda-name">${esc(v.nombre)}</div>
          ${v.descripcion ? `<div class="vianda-desc">${esc(v.descripcion)}</div>` : ''}
        </div>
        <div class="vianda-bottom">
          <div class="vianda-price">$${Math.round(v.precio_venta || 0)}</div>
          ${cant > 0
            ? `<div class="vianda-qty">
                <button class="qty-btn" onclick="event.stopPropagation();cambiarCantidad(${v.id}, -1)">−</button>
                <span class="qty-num">${cant}</span>
                <button class="qty-btn" onclick="event.stopPropagation();cambiarCantidad(${v.id}, 1)">+</button>
              </div>`
            : `<button class="vianda-add" onclick="event.stopPropagation();agregar(${v.id})">+</button>`}
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function agregar(id) {
  const v = viandas.find(x => x.id === id);
  if (!v) return;
  if (!carrito[id]) carrito[id] = { ...v, cantidad: 0 };
  carrito[id].cantidad += 1;
  renderizarMenu();
  actualizarBarra();
}

function cambiarCantidad(id, delta) {
  if (!carrito[id]) return;
  carrito[id].cantidad += delta;
  if (carrito[id].cantidad <= 0) delete carrito[id];
  renderizarMenu();
  actualizarBarra();
}

function actualizarBarra() {
  const ids = Object.keys(carrito);
  const textEl = document.getElementById('cart-bar-text');
  const btn = document.getElementById('btn-continuar');

  if (!ids.length) {
    textEl.textContent = 'Agregá viandas del menú';
    btn.disabled = true;
    btn.textContent = 'Continuar';
    return;
  }

  const total = ids.reduce((s, id) => s + carrito[id].cantidad * Number(carrito[id].precio_venta || 0), 0);
  const items = ids.reduce((s, id) => s + carrito[id].cantidad, 0);
  textEl.textContent = `${items} ${items === 1 ? 'vianda' : 'viandas'} · $${Math.round(total)}`;
  btn.disabled = false;
  btn.textContent = 'Continuar';
}

function irACheckout() {
  const ids = Object.keys(carrito);
  if (!ids.length) return;

  document.getElementById('seccion-menu').style.display = 'none';
  document.getElementById('seccion-checkout').style.display = 'block';
  document.getElementById('cart-bar').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Render order summary
  let total = 0;
  const html = ids.map(id => {
    const item = carrito[id];
    const subtotal = item.cantidad * Number(item.precio_venta || 0);
    total += subtotal;
    return `<div class="checkout-item">
      <span class="checkout-item-name">${esc(item.nombre)}</span>
      <span class="checkout-item-qty">${item.cantidad}x</span>
      <span class="checkout-item-price">$${Math.round(subtotal)}</span>
    </div>`;
  }).join('');
  document.getElementById('checkout-resumen').innerHTML = html;
  document.getElementById('checkout-total').textContent = `Total: $${Math.round(total)}`;
}

function volverAlMenu() {
  document.getElementById('seccion-checkout').style.display = 'none';
  document.getElementById('seccion-menu').style.display = 'block';
  document.getElementById('cart-bar').style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('cart-mensaje').innerHTML = '';
}

function primerNombre(nombre) {
  return (nombre || '').trim().split(/\s+/)[0] || nombre;
}

async function enviarPedido() {
  const cliente = document.getElementById('cart-cliente').value.trim();
  const telefono = document.getElementById('cart-telefono').value.trim();
  const direccion = document.getElementById('cart-direccion').value.trim();

  if (!cliente) {
    mostrarMensaje('Decinos tu nombre para tomar el pedido', 'error');
    document.getElementById('cart-cliente').focus();
    return;
  }
  if (!telefono) {
    mostrarMensaje('Dejanos tu teléfono para coordinar la entrega', 'error');
    document.getElementById('cart-telefono').focus();
    return;
  }
  if (!direccion) {
    mostrarMensaje('Dejanos tu dirección para la entrega', 'error');
    document.getElementById('cart-direccion').focus();
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
        telefono,
        direccion,
        notas: document.getElementById('cart-notas').value.trim() || null,
        items
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al enviar');
    }

    document.getElementById('cart-cliente').value = '';
    document.getElementById('cart-telefono').value = '';
    document.getElementById('cart-direccion').value = '';
    document.getElementById('cart-notas').value = '';
    Object.keys(carrito).forEach(k => delete carrito[k]);
    volverAlMenu();
    renderizarMenu();
    actualizarBarra();
    document.getElementById('modal-texto').textContent =
      `Gracias por tu compra, ${primerNombre(cliente)}. Pronto me pongo en contacto con vos para coordinar la entrega.`;
    document.getElementById('modal-exito').classList.add('open');
  } catch (err) {
    mostrarMensaje('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}

function cerrarModal() {
  document.getElementById('modal-exito').classList.remove('open');
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