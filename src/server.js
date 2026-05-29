require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const { supabase } = require('./supabase');

const app = express();
const api = express.Router();
const PORT = Number(process.env.PORT) || 3000;

const ESTADOS_PEDIDO = ['pendiente', 'en_proceso', 'listo', 'entregado', 'cancelado'];
const ESTADOS_ACTIVOS = ['pendiente', 'en_proceso', 'listo'];

app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));

function createHttpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapDbError(error, fallbackMessage = 'Error de base de datos') {
  if (!error) return null;
  const status = ['23503', '23505', '23514'].includes(error.code) ? 400 : 500;
  return createHttpError(error.message || fallbackMessage, status);
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function toInt(value, defaultValue = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : defaultValue;
}

function parseId(value, fieldName = 'id') {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw createHttpError(`${fieldName} inválido`, 400);
  }
  return id;
}

function cleanText(value, maxLen = 250) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

function parseNullableDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    throw createHttpError('Fecha de entrega inválida', 400);
  }
  return dt.toISOString();
}

function sumBy(arr, mapper) {
  return arr.reduce((acc, item) => acc + mapper(item), 0);
}

function isSameDay(isoDate, dayStamp) {
  return Boolean(isoDate && String(isoDate).startsWith(dayStamp));
}

function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? 6 : day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

async function fetchViandasByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('viandas')
    .select('id,nombre,costo,precio_venta,stock')
    .in('id', ids);

  if (error) throw mapDbError(error, 'No se pudieron consultar las viandas');
  return data || [];
}

async function fetchPedidoItems(pedidoId) {
  const { data, error } = await supabase
    .from('pedido_items')
    .select('id,pedido_id,vianda_id,cantidad,precio_unitario,costo_unitario,viandas(nombre)')
    .eq('pedido_id', pedidoId)
    .order('id', { ascending: true });

  if (error) throw mapDbError(error, 'No se pudieron consultar los items del pedido');
  return (data || []).map((item) => ({
    ...item,
    vianda_nombre: item.viandas?.nombre || 'Vianda eliminada'
  }));
}

async function buildProduccionPlan() {
  const { data: viandas, error: viandasError } = await supabase
    .from('viandas')
    .select('id,nombre,stock')
    .order('nombre', { ascending: true });

  if (viandasError) throw mapDbError(viandasError, 'No se pudieron consultar viandas');

  const { data: pedidosActivos, error: pedidosError } = await supabase
    .from('pedidos')
    .select('id')
    .in('estado', ESTADOS_ACTIVOS);

  if (pedidosError) throw mapDbError(pedidosError, 'No se pudieron consultar pedidos activos');

  const demandaPorVianda = {};
  const pedidoIds = (pedidosActivos || []).map((p) => p.id);

  if (pedidoIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('pedido_items')
      .select('vianda_id,cantidad')
      .in('pedido_id', pedidoIds);

    if (itemsError) throw mapDbError(itemsError, 'No se pudieron consultar items de pedidos activos');

    for (const item of items || []) {
      demandaPorVianda[item.vianda_id] = (demandaPorVianda[item.vianda_id] || 0) + Number(item.cantidad || 0);
    }
  }

  const items = (viandas || []).map((v) => {
    const pendientes = demandaPorVianda[v.id] || 0;
    const aProducir = Math.max(pendientes - Number(v.stock || 0), 0);
    return {
      id: v.id,
      nombre: v.nombre,
      stock: Number(v.stock || 0),
      pendientes,
      a_producir: aProducir
    };
  });

  return {
    items,
    total: sumBy(items, (item) => item.a_producir)
  };
}

async function adjustStockWithMovement({ pedidoId, tipo, motivoBase, cantidadesPorVianda }) {
  const viandaIds = Object.keys(cantidadesPorVianda).map((id) => Number(id));
  if (!viandaIds.length) return;

  const viandas = await fetchViandasByIds(viandaIds);
  const viandasById = new Map(viandas.map((v) => [v.id, v]));

  for (const viandaId of viandaIds) {
    const cantidad = Number(cantidadesPorVianda[viandaId] || 0);
    const vianda = viandasById.get(viandaId);
    if (!vianda) continue;

    const stockActual = Number(vianda.stock || 0);
    const nuevoStock = tipo === 'entrada' ? stockActual + cantidad : stockActual - cantidad;

    const { error: updateErr } = await supabase
      .from('viandas')
      .update({ stock: nuevoStock })
      .eq('id', viandaId);

    if (updateErr) throw mapDbError(updateErr, 'No se pudo actualizar stock');
  }

  const movimientos = viandaIds.map((viandaId) => ({
    vianda_id: viandaId,
    tipo,
    cantidad: Number(cantidadesPorVianda[viandaId] || 0),
    motivo: `${motivoBase} #${pedidoId}`,
    referencia: `pedido:${pedidoId}`
  }));

  const { error: movErr } = await supabase.from('movimientos_stock').insert(movimientos);
  if (movErr) throw mapDbError(movErr, 'No se pudo registrar movimiento de stock');
}

api.get('/health', (req, res) => {
  res.json({ ok: true });
});

api.get('/viandas', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('viandas').select('*').order('nombre', { ascending: true });
    if (error) throw mapDbError(error, 'No se pudieron listar las viandas');
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

api.post('/viandas', async (req, res, next) => {
  try {
    const nombre = cleanText(req.body?.nombre, 120);
    if (!nombre) throw createHttpError('El nombre es obligatorio');

    const payload = {
      nombre,
      descripcion: cleanText(req.body?.descripcion, 1000),
      imagen: cleanText(req.body?.imagen, 500) || null,
      costo: Math.max(toMoney(req.body?.costo), 0),
      precio_venta: Math.max(toMoney(req.body?.precio_venta), 0),
      stock: toInt(req.body?.stock, 0)
    };

    const { data, error } = await supabase.from('viandas').insert(payload).select('*').single();
    if (error) throw mapDbError(error, 'No se pudo crear la vianda');

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

api.put('/viandas/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'vianda_id');
    const nombre = cleanText(req.body?.nombre, 120);
    if (!nombre) throw createHttpError('El nombre es obligatorio');

    const payload = {
      nombre,
      descripcion: cleanText(req.body?.descripcion, 1000),
      imagen: cleanText(req.body?.imagen, 500) || null,
      costo: Math.max(toMoney(req.body?.costo), 0),
      precio_venta: Math.max(toMoney(req.body?.precio_venta), 0),
      stock: toInt(req.body?.stock, 0)
    };

    const { data, error } = await supabase
      .from('viandas')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw mapDbError(error, 'No se pudo actualizar la vianda');
    if (!data) throw createHttpError('Vianda no encontrada', 404);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

api.delete('/viandas/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'vianda_id');
    const { error } = await supabase.from('viandas').delete().eq('id', id);
    if (error) throw mapDbError(error, 'No se pudo eliminar la vianda');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

api.post('/upload', async (req, res, next) => {
  try {
    const { file, name } = req.body;
    if (!file || !name) throw createHttpError('Faltan file y name');

    const buffer = Buffer.from(file, 'base64');
    const fileName = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { data, error } = await supabase.storage
      .from('viandas-imagenes')
      .upload(fileName, buffer, {
        contentType: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
        upsert: false
      });

    if (error) throw mapDbError(error, 'No se pudo subir el archivo');

    const { data: { publicUrl } } = supabase.storage
      .from('viandas-imagenes')
      .getPublicUrl(fileName);

    res.json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
});

api.get('/pedidos', async (req, res, next) => {
  try {
    const { data: pedidos, error } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false });
    if (error) throw mapDbError(error, 'No se pudieron listar pedidos');

    const pedidoIds = (pedidos || []).map((p) => p.id);
    const cantidades = {};

    if (pedidoIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('pedido_items')
        .select('pedido_id,cantidad')
        .in('pedido_id', pedidoIds);

      if (itemsError) throw mapDbError(itemsError, 'No se pudieron listar items de pedidos');

      for (const item of items || []) {
        cantidades[item.pedido_id] = (cantidades[item.pedido_id] || 0) + Number(item.cantidad || 0);
      }
    }

    const enriched = (pedidos || []).map((p) => ({
      ...p,
      items_count: cantidades[p.id] || 0
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

api.get('/pedidos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'pedido_id');
    const { data: pedido, error } = await supabase.from('pedidos').select('*').eq('id', id).maybeSingle();
    if (error) throw mapDbError(error, 'No se pudo consultar pedido');
    if (!pedido) throw createHttpError('Pedido no encontrado', 404);

    const items = await fetchPedidoItems(id);
    res.json({
      ...pedido,
      items
    });
  } catch (err) {
    next(err);
  }
});

api.post('/pedidos', async (req, res, next) => {
  try {
    const cliente = cleanText(req.body?.cliente, 120);
    if (!cliente) throw createHttpError('El cliente es obligatorio');

    const notas = cleanText(req.body?.notas, 2000);
    const telefono = cleanText(req.body?.telefono, 60);
    const direccion = cleanText(req.body?.direccion, 200);
    const fechaEntrega = parseNullableDate(req.body?.fecha_entrega);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    const items = rawItems
      .map((item) => ({
        vianda_id: toInt(item?.vianda_id, 0),
        cantidad: Math.max(toInt(item?.cantidad, 1), 1)
      }))
      .filter((item) => item.vianda_id > 0);

    if (!items.length) throw createHttpError('Debe incluir al menos una vianda');

    const viandaIds = [...new Set(items.map((item) => item.vianda_id))];
    const viandas = await fetchViandasByIds(viandaIds);
    const viandasById = new Map(viandas.map((v) => [v.id, v]));

    if (viandasById.size !== viandaIds.length) {
      throw createHttpError('Una o más viandas no existen');
    }

    const { data: pedidoCreado, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        cliente,
        telefono,
        direccion,
        notas,
        estado: 'pendiente',
        fecha_entrega: fechaEntrega
      })
      .select('*')
      .single();

    if (pedidoError || !pedidoCreado) throw mapDbError(pedidoError, 'No se pudo crear el pedido');

    const rows = items.map((item) => {
      const vianda = viandasById.get(item.vianda_id);
      return {
        pedido_id: pedidoCreado.id,
        vianda_id: item.vianda_id,
        cantidad: item.cantidad,
        precio_unitario: toMoney(vianda.precio_venta),
        costo_unitario: toMoney(vianda.costo)
      };
    });

    const { error: itemsError } = await supabase.from('pedido_items').insert(rows);
    if (itemsError) {
      await supabase.from('pedidos').delete().eq('id', pedidoCreado.id);
      throw mapDbError(itemsError, 'No se pudieron guardar los items del pedido');
    }

    const totalVenta = rows.reduce((s, r) => s + toMoney(r.precio_unitario) * Number(r.cantidad || 0), 0);
    const totalCosto = rows.reduce((s, r) => s + toMoney(r.costo_unitario) * Number(r.cantidad || 0), 0);
    const ganancia = toMoney(totalVenta - totalCosto);

    const { data: pedidoActualizado, error: updateError } = await supabase
      .from('pedidos')
      .update({
        total_venta: toMoney(totalVenta),
        total_costo: toMoney(totalCosto),
        ganancia
      })
      .eq('id', pedidoCreado.id)
      .select('*')
      .single();

    if (updateError) {
      await supabase.from('pedido_items').delete().eq('pedido_id', pedidoCreado.id);
      await supabase.from('pedidos').delete().eq('id', pedidoCreado.id);
      throw mapDbError(updateError, 'No se pudieron actualizar los totales');
    }

    res.status(201).json({
      ...pedidoActualizado,
      items_count: rows.reduce((s, r) => s + Number(r.cantidad || 0), 0)
    });
  } catch (err) {
    next(err);
  }
});

api.put('/pedidos/:id/estado', async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'pedido_id');
    const estado = cleanText(req.body?.estado, 30);

    if (!ESTADOS_PEDIDO.includes(estado)) {
      throw createHttpError('Estado inválido');
    }

    const { data: pedido, error: pedidoErr } = await supabase.from('pedidos').select('*').eq('id', id).maybeSingle();
    if (pedidoErr) throw mapDbError(pedidoErr, 'No se pudo consultar pedido');
    if (!pedido) throw createHttpError('Pedido no encontrado', 404);

    if (pedido.estado === estado) {
      return res.json(pedido);
    }

    const items = await fetchPedidoItems(id);
    const cantidadesPorVianda = {};

    for (const item of items) {
      cantidadesPorVianda[item.vianda_id] = (cantidadesPorVianda[item.vianda_id] || 0) + Number(item.cantidad || 0);
    }

    if (pedido.estado !== 'entregado' && estado === 'entregado') {
      await adjustStockWithMovement({
        pedidoId: id,
        tipo: 'salida',
        motivoBase: 'Consumo por entrega de pedido',
        cantidadesPorVianda
      });
    }

    if (pedido.estado === 'entregado' && estado !== 'entregado') {
      await adjustStockWithMovement({
        pedidoId: id,
        tipo: 'entrada',
        motivoBase: 'Reversión de entrega de pedido',
        cantidadesPorVianda
      });
    }

    const updates = {
      estado,
      entregado_at: estado === 'entregado' ? new Date().toISOString() : null
    };

    const { data: updated, error: updateErr } = await supabase
      .from('pedidos')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) throw mapDbError(updateErr, 'No se pudo actualizar estado');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

api.delete('/pedidos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'pedido_id');
    const { data: pedido, error: fetchErr } = await supabase.from('pedidos').select('id,estado').eq('id', id).maybeSingle();
    if (fetchErr) throw mapDbError(fetchErr, 'No se pudo consultar pedido');
    if (!pedido) throw createHttpError('Pedido no encontrado', 404);
    if (pedido.estado === 'entregado') {
      throw createHttpError('No se puede eliminar un pedido entregado. Cambiá el estado antes de eliminarlo.');
    }

    const { error } = await supabase.from('pedidos').delete().eq('id', id);
    if (error) throw mapDbError(error, 'No se pudo eliminar el pedido');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

api.post('/migrate', async (req, res, next) => {
  try {
    await supabase.rpc('exec_sql', { sql: 'ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS telefono text; ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS direccion text;' });
    res.json({ ok: true });
  } catch {
    await supabase.from('pedidos').select('id').limit(0);
    const { error: e1 } = await supabase.from('pedidos').insert({ cliente: '__migrate__', telefono: '__migrate__' }).select('*').maybeSingle();
    if (e1 && e1.code === '42703') {
      return res.status(500).json({ error: 'La columna telefono no existe aún. Ejecutá el SQL en el editor de Supabase: ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS telefono text; ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS direccion text;' });
    }
    if (!e1) {
      await supabase.from('pedidos').delete().eq('cliente', '__migrate__');
      return res.json({ ok: true });
    }
    res.json({ error: e1.message });
  }
});

api.get('/movimientos', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('movimientos_stock')
      .select('id,vianda_id,tipo,cantidad,motivo,referencia,created_at,viandas(nombre)')
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) throw mapDbError(error, 'No se pudieron consultar movimientos');

    const result = (data || []).map((mov) => ({
      ...mov,
      vianda_nombre: mov.viandas?.nombre || 'Vianda eliminada'
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

api.get('/produccion', async (req, res, next) => {
  try {
    const plan = await buildProduccionPlan();
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

api.post('/produccion', async (req, res, next) => {
  try {
    const viandaId = parseId(req.body?.vianda_id, 'vianda_id');
    const cantidad = Math.max(toInt(req.body?.cantidad, 0), 0);
    if (!cantidad) throw createHttpError('La cantidad debe ser mayor a 0');
    const motivo = cleanText(req.body?.motivo, 250) || 'Producción manual';

    const { data: vianda, error: viandaErr } = await supabase
      .from('viandas')
      .select('id,stock')
      .eq('id', viandaId)
      .maybeSingle();

    if (viandaErr) throw mapDbError(viandaErr, 'No se pudo consultar la vianda');
    if (!vianda) throw createHttpError('Vianda no encontrada', 404);

    const nuevoStock = Number(vianda.stock || 0) + cantidad;

    const { error: updateError } = await supabase.from('viandas').update({ stock: nuevoStock }).eq('id', viandaId);
    if (updateError) throw mapDbError(updateError, 'No se pudo actualizar stock');

    const { error: movError } = await supabase.from('movimientos_stock').insert({
      vianda_id: viandaId,
      tipo: 'entrada',
      cantidad,
      motivo,
      referencia: 'produccion'
    });

    if (movError) throw mapDbError(movError, 'No se pudo registrar movimiento de producción');

    res.status(201).json({ ok: true, stock: nuevoStock });
  } catch (err) {
    next(err);
  }
});

api.get('/stats', async (req, res, next) => {
  try {
    const [pedidosRes, produccion] = await Promise.all([
      supabase.from('pedidos').select('id,cliente,estado,total_venta,total_costo,ganancia,created_at,fecha_entrega,entregado_at'),
      buildProduccionPlan()
    ]);

    if (pedidosRes.error) throw mapDbError(pedidosRes.error, 'No se pudieron cargar pedidos');

    const pedidos = pedidosRes.data || [];
    const weekStart = getStartOfWeek();

    const pedidosSemana = pedidos.filter((p) => p.created_at >= weekStart);
    const pendientesSemana = pedidosSemana.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length;
    const entregadosSemana = pedidos.filter((p) => p.estado === 'entregado' && p.entregado_at >= weekStart);

    const clientesSet = new Set();
    for (const p of pedidos) {
      if (p.cliente) clientesSet.add(p.cliente.trim().toLowerCase());
    }

    const entregasPendientes = pedidos
      .filter((p) => ESTADOS_ACTIVOS.includes(p.estado))
      .sort((a, b) => {
        const aDate = a.fecha_entrega ? new Date(a.fecha_entrega).getTime() : Number.POSITIVE_INFINITY;
        const bDate = b.fecha_entrega ? new Date(b.fecha_entrega).getTime() : Number.POSITIVE_INFINITY;
        return aDate - bDate;
      })
      .slice(0, 6);

    res.json({
      pedidosRealizados: pedidosSemana.length,
      pendientesSemana,
      ingresosSemanales: toMoney(sumBy(entregadosSemana, (p) => Number(p.total_venta || 0))),
      gananciaSemanal: toMoney(sumBy(entregadosSemana, (p) => Number(p.ganancia || 0))),
      clientes: clientesSet.size,
      pedidosHistoricos: pedidos.length,
      entregasPendientes
    });
  } catch (err) {
    next(err);
  }
});

app.use('/api', api);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  setHeaders(res, path) {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err.status) || 500;
  const message = err.message || 'Error interno del servidor';
  res.status(status).json({ error: message });
});

app.listen(PORT, async () => {
  // Auto-migrate: columnas telefono y direccion
  try {
    const { error } = await supabase.from('pedidos').insert({ cliente: '__migrate__', telefono: 't', direccion: 'd' }).select('*').maybeSingle();
    if (error?.code === '42703') {
      console.log('⚠️  Migracion necesaria: ejecutar en Supabase SQL Editor:');
      console.log('  ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS telefono text;');
      console.log('  ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS direccion text;');
    } else if (!error) {
      await supabase.from('pedidos').delete().eq('cliente', '__migrate__');
      console.log('✅ Columnas telefono y direccion OK');
    }
  } catch { /* ignore */ }

  // Auto-migrate: columna imagen en viandas
  try {
    const { error } = await supabase.from('viandas').insert({ nombre: '__migrate__', imagen: 't' }).select('*').maybeSingle();
    if (error?.code === '42703') {
      console.log('⚠️  Migracion necesaria: ejecutar en Supabase SQL Editor:');
      console.log('  ALTER TABLE public.viandas ADD COLUMN IF NOT EXISTS imagen text;');
    } else if (!error) {
      await supabase.from('viandas').delete().eq('nombre', '__migrate__');
      console.log('✅ Columna imagen OK');
    }
  } catch { /* ignore */ }

  console.log(`Sabores de la GLA corriendo en http://localhost:${PORT}`);
});
