# Sabores de la GLA — Memoria del proyecto

## Goal
App web de gestión de viandas (mobile-first, pastel palette, logo-based branding) + catálogo online público para clientes. Persistencia real en Supabase, deploy en Render.

## Stack
- **Backend**: Node.js + Express (body limit: 5mb)
- **DB**: Supabase (PostgreSQL) — service role key en backend
- **Frontend**: HTML + CSS + JS vanilla (mobile-first, sin frameworks)
- **Storage**: Supabase Storage (bucket `viandas-imagenes`, público)
- **IA imágenes**: Pollinations.ai (gratis, sin API key)
- **Seguridad**: helmet, cors, express-rate-limit

## Despliegue
- **Render** plan free: `https://viandas-gla.onrender.com`
- Auto-deploy desde `main` en GitHub (`samherdt-gh/viandas-gla`)
- Cold start ~30s (se duerme tras 15 min de inactividad)
- API key de Render: `rnd_VWb6ZEGRZJz8QXqdUXSF3HjpDUv9`

## Supabase
- Proyecto: `tasrcjsejatmdepxulqe` (región sa-east-1)
- Service role key seteada en `.env` y en Render env vars
- Schema en `db/schema.sql` (4 tablas: viandas, pedidos, pedido_items, movimientos_stock + triggers + índices)
- Storage bucket: `viandas-imagenes` (público)

## Estructura del proyecto
```
Viandas - Gla/
├── .env                    # credenciales (no trackeado)
├── .env.example            # template de config
├── .gitignore
├── db/schema.sql           # schema completo SQL (con imagen, categoria)
├── package.json
├── src/
│   ├── server.js           # Express + todas las rutas API + lógica stock/producción + migraciones automáticas
│   └── supabase.js         # cliente Supabase con service_role key
└── public/
    ├── index.html          # estructura HTML admin (sidebar, nav, páginas, modales)
    ├── styles.css          # mobile-first CSS (paleta verde oliva pastel)
    ├── app.js              # frontend completo admin (CRUD, stock, dashboard, búsqueda, IA)
    ├── logo.png            # logo extraído del PDF (200x200)
    └── catalogo/
        ├── index.html      # landing pública para clientes (flujo 2 pasos)
        ├── styles.css      # CSS del catálogo (cards cuadradas, categorías, cart bar)
        └── app.js          # frontend catálogo (carrito, categorías, checkout)
```

### WhatsApp Cloud API — Notificaciones de pedidos

#### Cómo funciona
- Cuando un cliente envía un pedido desde el catálogo público (`/catalogo/`), el backend (`POST /api/pedidos` en `src/server.js`) crea el pedido en Supabase y luego llama a `sendWhatsApp()`
- `sendWhatsApp()` envía un mensaje de texto al número del dueño vía WhatsApp Cloud API de Meta
- La llamada es **fire & forget** (no bloquea la respuesta al cliente)
- Si faltan las credenciales, se saltea silenciosamente — la app sigue funcionando sin WhatsApp

#### Formato del mensaje que recibe el dueño
```
Nuevo pedido en Sabores de la GLA

Cliente: Juan Pérez
Teléfono: 541141112233
Dirección: Av. Siempre Viva 123

Items:
2x Milanesa con puré
1x Ensalada Caesar

Total: $4500

Notas: Sin cebolla
```

#### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `src/server.js:5` | Se agregó `require('https')` |
| `src/server.js:106-165` | Función `sendWhatsApp()` con manejo de errores |
| `src/server.js:477-487` | Llamada a `sendWhatsApp()` tras crear pedido exitoso |
| `.env.example` | Variables `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_RECIPIENT` |
| `.env` | Idem (con valores reales, no trackeado) |

#### Setup paso a paso (una sola vez)

1. Ir a **https://developers.facebook.com** → **My Apps** → **Create App** → tipo **"Business"**
2. Agregar producto **"WhatsApp Cloud API"**
3. En **"Quickstart"** te aparecen:
   - **Phone Number ID** (ej: `1191773527347267`)
   - **Temporary Access Token** (expira, para pruebas)
4. Configurar un número de WhatsApp (puede ser el número personal del dueño — llega un SMS de verificación)
5. **Enviar un mensaje desde el WhatsApp del dueño al número de prueba** de Meta para abrir la ventana de conversación de 24h (necesario solo en sandbox)
6. Probar el envío con el `curl` que te da Meta
7. Para producción: generar un **Permanent Access Token** en **API Setup > Manage > Add Token**

#### Variables de entorno
| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `WHATSAPP_TOKEN` | Token de acceso (temporal o permanente) | `EAAXZCtEl85ZCcB...` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp business | `1191773527347267` |
| `WHATSAPP_RECIPIENT` | Número del dueño (código país + número, sin + ni espacios) | `543425020887` |

#### Costos
- **Acceso a la API**: gratuito
- **Sandbox de pruebas**: completamente gratis
- **Producción**: las primeras 1,000 conversaciones de servicio al mes son gratis
- Para el volumen de un negocio chico (~5-10 pedidos/día), el costo es **$0 mensual**

#### Notas técnicas
- En el sandbox de Meta solo se pueden enviar mensajes de texto libre (`type: 'text'`) dentro de los 24h posteriores a que el dueño envió un mensaje al número de prueba
- En producción con token permanente, los mensajes de texto libre funcionan sin restricción de ventana
- El endpoint usado es: `POST https://graph.facebook.com/v21.0/{phone-number-id}/messages`
- Si el token expira o es inválido, el error se loguea a stderr (visible en logs de Render)

### Node.js Best Practices — Mejoras aplicadas (30/05/2026)

#### Paquetes instalados
| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `helmet` | ^8.1.0 | Cabeceras de seguridad HTTP (CSP, X-Frame-Options, etc.) |
| `cors` | ^2.8.5 | Control de acceso cross-origin |
| `express-rate-limit` | ^7.5.0 | Rate limiting por IP |

#### Variables de entorno agregadas
| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `CORS_ORIGIN` | Origen permitido para CORS | `https://viandas-gla.onrender.com` |
| `NODE_ENV` | Entorno (development/production) | `production` |

#### Cambios en `src/server.js`

**1. Middleware de seguridad (línea ~33)**
- `helmet()` — protege contra vulnerabilidades HTTP comunes
- `cors({ origin: CORS_ORIGIN })` — solo permite peticiones desde el dominio del negocio
- `express-rate-limit` — 300 req/min en dev, 60 req/min en prod, evita abusos

**2. `asyncHandler` wrapper (línea ~63)**
- Función que envuelve handlers asíncronos y captura errores automáticamente
- Elimina la necesidad de try/catch en todas las rutas
- El error se pasa a `next(err)` y lo maneja el error handler central

```js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

**3. Error handler central (línea ~540+)**
- En desarrollo: responde JSON con mensaje + stack trace completo
- En producción: responde JSON con mensaje genérico (oculta detalles internos)
- Loguea a stderr con timestamp y stack
- Todos los errores HTTP conocidos responden con su código (404, 400, etc.)

**4. Graceful shutdown (línea ~560+)**
- Captura `SIGTERM` y `SIGINT` (Render envía SIGTERM al detener/freeze)
- Cierra `server.close()` y espera conexiones activas terminar
- Loguea shutdown graceful vs forzado
- Sale con código 0

**5. AsyncHandler aplicado a todas las rutas**
- `POST /api/viandas` (crear vianda)
- `PUT /api/viandas/:id` (editar vianda)
- `DELETE /api/viandas/:id` (eliminar vianda)
- `POST /api/imagen-vianda` (subir imagen a Supabase Storage)
- `GET /api/pedidos` (listar pedidos)
- `POST /api/pedidos` (crear pedido, con WhatsApp)
- `PUT /api/pedidos/:id` (actualizar pedido)
- `GET /api/catalogo` (viandas disponibles para catálogo)
- `POST /api/produccion` (registrar producción)
- `GET /api/movimientos` (listar movimientos stock)
- `GET /api/stats` (dashboard stats)
- `GET /api/stats/ventas-por-vianda` (ventas agrupadas)
- `GET /api/stats/entregas-por-dia` (entregas timeline)
- `DELETE /api/viandas/:id/imagen` (borrar imagen de Storage)

**6. Manejador 400 para JSON inválido**
- Si el body no es JSON válido, responde con 400 sin crash

**7. Manejador 404 para rutas API inexistentes**
- Cualquier `GET/POST/PUT/DELETE /api/*` no definida responde JSON `{ error: "Ruta no encontrada" }`

#### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `package.json` | Se agregaron `helmet`, `cors`, `express-rate-limit` a dependencies |
| `.env.example` | Se agregó `CORS_ORIGIN` y comentario `NODE_ENV` |
| `src/server.js` | Se agregaron imports, middleware, asyncHandler, error handler, graceful shutdown |
| `AGENTS.md` | Este documento |

## Funcionalidades implementadas

### Gestión de viandas
- CRUD completo (alta, edición, eliminación)
- Campos: nombre, descripción, imagen, categoría, costo, precio venta, stock
- Subida de imágenes a Supabase Storage o generación con IA (Pollinations)
- Categorías con autocomplete (sugiere categorías existentes)
- Tabla y vista cards con badge de categoría

### Gestión de pedidos
- CRUD completo con items por vianda
- Edición inline de pedidos: cliente, teléfono, dirección, fecha de entrega, notas
- **Edición de items en pedidos existentes** (ver 02/06/2026): agregar, cambiar cantidad o eliminar viandas; recalcula totales en el servidor
- Estados: pendiente → en_proceso → listo → entregado / cancelado
- Al marcar como `entregado`: descuenta stock + registra movimiento
- Al revertir de `entregado`: repone stock + registra reversión
- Fecha de entrega (solo día, sin hora en display)
- Badge de urgencia: **Hoy** / **Próximo** / **Vencido** / **Programado** / **Sin fecha**
- Tabla y vista cards con urgencia visual

### Dashboard
- Logo + "Sabores de la GLA" en fuente Playfair Display
- KPIs semanales: Pedidos realizados, Pendientes de entrega, Ingresos, Ganancia, Clientes, Pedidos históricos
- "Próximas entregas": listado de pedidos pendientes ordenados por fecha de entrega
- Badges de urgencia (Hoy/Próximo/Vencido)
- Cards y stats centrados (max-width 600px)

### Stock
- Resumen por vianda: Stock / Comprometido / Faltante
- Alerta de faltantes con link a producción
- Buscador client-side
- Movimientos (entrada/salida/ajuste) con tabla y cards

### Producción
- Plan de producción basado en stock actual + pedidos pendientes
- Registro manual de producción (aumenta stock + movimiento)
- Vista tabla y cards

### Catálogo público (`/catalogo/`)
- Tarjetas cuadradas con imagen, nombre, descripción, precio
- Botones +/− directamente en cada vianda
- Categorías: pestañas de filtro + agrupación por categoría
- Flujo en 2 pasos:
  1. Menú con carrito flotante abajo (ícono, cantidad, total, botón "Continuar")
  2. Checkout con resumen del pedido + formulario (nombre, teléfono, dirección, notas)
- Campos teléfono y dirección obligatorios
- Modal de éxito con primer nombre del cliente
- Paleta de colores coordinada con la app admin

### UX/UI
- Mobile-first con bottom nav
- Sidebar en desktop
- Modales tipo sheet para formularios
- Modal de confirmación (reemplaza `confirm()`)
- Modal de detalle de pedido con edición inline
- Loading states con spinner
- Manejo de errores de red en `api()`
- Paleta pastel basada en colores del logo:
  - Fondo: crema cálido (#f5efe6)
  - Acento: verde oliva (#5a7a4a)
  - Sidebar: verde oscuro (#2a3a1e)
  - Texto: verde oscuro suave
  - Badges: tonos pastel coordinados
- Cards con ancho máximo centrado en desktop
- Montos sin decimales (enteros)
- Fechas de entrega solo día (sin hora)

### Cache busting
- Archivos estáticos con `?v=N` para evitar CDN cache de Render
- HTML con `Cache-Control: no-cache`

## Decisiones técnicas clave
- **Supabase** como DB persistente (no archivos locales ni memoria efímera)
- **Render plan free** (sin costo, duerme tras 15 min)
- **Frontend vanilla** (alcance acotado, no justifica framework)
- **Service role key** en backend (no RLS aún — pendiente autenticación)
- **Lógica de stock separada**: Production suma stock, Entregas resta stock
- **Catálogo dentro del mismo proyecto** (misma ruta, mismo deploy)
- **Subida de imágenes** base64 → backend → Supabase Storage (sin multer)
- **IA generativa** con Pollinations.ai para imágenes de viandas (gratis)
- **Migraciones automáticas** al iniciar el servidor (detecta columnas faltantes)
- **asyncHandler** para eliminar try/catch repetitivos en rutas Express
- **Helmet + CORS + Rate-limit** para seguridad básica en producción
- **Graceful shutdown** para que Render pueda detener el proceso limpiamente
- **Error handler central** que oculta detalles internos en producción (seguridad)

## Próximos pasos (pendientes)
1. **Autenticación**: login con Supabase Auth (email + contraseña), proteger rutas admin, solo usuarios autorizados

## 02/06/2026 — Editar items en pedidos + carga de catálogo

### Feature: editar items de un pedido existente
- **Backend** (`src/server.js:511-577`): `PUT /api/pedidos/:id` ahora acepta un array `items`. Si viene, borra los `pedido_items` viejos, inserta los nuevos con precio/costo actual de la vianda, y recalcula `total_venta` / `total_costo` / `ganancia`.
  - **Rechaza con 400** si el pedido está en estado `entregado` (para no descontrolar el stock ya descontado). Mensaje: "No se pueden modificar los items de un pedido ya entregado. Revertí el estado antes de editarlo."
  - Si el array `items` viene vacío, rechaza con 400.
  - Si el body NO trae `items`, sólo actualiza los campos del pedido (cliente/teléfono/dirección/fecha/notas), igual que antes.
- **Frontend** (`public/app.js`):
  - `showPedidoDetail` ahora es `async` y carga `viandasCache` para popular el dropdown.
  - En `#pedido-edit-section` se agregó un bloque **Items del pedido** con filas dinámicas (vianda + cantidad + botón ✕), botón `+ Agregar vianda`, y subtotal en vivo calculado con `recalcEditSubtotal()`.
  - Si el pedido está `entregado`, el editor de items se oculta con un mensaje de aviso.
  - `guardarEdicionPedido` ahora arma `body.items` a partir de `editPedidoItems` (saltando los borrados) y refresca producción además de pedidos/dashboard.
  - Estado nuevo: `editPedidoItems = []` con claves únicas para mapear DOM ↔ estado.
- **Deploy**: commit `1184140` pusheado a `main` y deploy manual disparado vía API de Render (status `live`).

### Carga de catálogo (seed desde la consola)
- Se borraron todos los datos de prueba: 17 pedidos (cascada a `pedido_items`), todos los `movimientos_stock`, y todas las viandas (incluida una "Tarta keto" #2 que estaba bloqueada por FK de movimientos — se resolvió revirtiendo el pedido #2 a `pendiente` y limpiando movimientos vía Supabase directo).
- Se cargaron **22 viandas** con foto ilustrativa generada por Pollinations AI y `stock=0` / `costo=0` para que la dueña edite costos.
  - `PUT /api/viandas/:id` **reemplaza** todos los campos, no es merge — hay que mandar la vianda completa (o perder categoría/precio). Documentado para no tropezar de nuevo.
  - El campo `nombre` tiene `UNIQUE` constraint, así que "Tartas individuales de verduras (masa de almendra)" y "Tartas individuales de verduras (masa integral)" conviven sin chocar.
- **Estado actual del catálogo** (4 categorías, 22 productos):

| Categoría | Productos | Precios |
|-----------|-----------|---------|
| **Empanadas** | 4 | Carne x6 / Árabes x6: $8000 · Brócoli y queso x6 / Choclo y queso x6: $6000 |
| **Viandas Clásicas** | 8 | Zapallitos rellenos, Guiso de lentejas, Tartas (masa integral), Canelones de espinaca y ricota, Canelones de choclo, Musaka, Pascualina, Tallarines · todos $6000 |
| **Hamburguesas Keto** | 6 | Lentejas / Porotos mung / Garbanzos, cada una en versión "rellenas de queso" y "simples" · $7000 |
| **Viandas Keto** | 4 | Tartas (masa de almendra), Albóndigas de pollo, Pan de almendra, Omelette · $7000 |

### Notas operativas
- Las imágenes son URLs de `image.pollinations.ai` (mismo método que el botón "Generar imagen IA" del modal de viandas). Re-generables desde la UI.
- Los nombres con "()" o guiones no rompen nada pero conviene evitar caracteres especiales raros en futuras altas masivas.
- Para futuras cargas masivas: el patrón es un script Node que use la API + Supabase directo (vía `SUPABASE_SERVICE_ROLE_KEY` del `.env`) para limpiar `movimientos_stock` antes de borrar viandas.

## 01/06/2026 — Fix bug + Keep-alive

### Bug corregido
- **`public/app.js:188`**: se llamaba a `esc(c)` que no existe en el admin (solo en el catálogo). Cambiado a `escapeHtml(c)`. Causaba `ReferenceError` al abrir el modal de viandas ("Nueva vianda" o editar).
- Se agregó `CORS_ORIGIN=http://localhost:3000` al `.env` local.
- Se documentaron `NODE_ENV` y `CORS_ORIGIN` en `.env.example`.

### Keep-alive (Render cold start)
- Se creó `.github/workflows/keep-alive.yml` — GitHub Action que hace ping a `https://viandas-gla.onrender.com/api/health` cada 10 minutos.
- Esto evita que Render duerma el servidor tras 15 min de inactividad.
- Se actualizó el token de GitHub para permitir `workflow` scope.

## 08/06/2026 — Fix dashboard pendientes + timezone fechas + UptimeRobot

### Fix dashboard: pedidos pendientes no se reinician por semana
- **Problema**: el dashboard filtraba pedidos por `created_at >= weekStart`, así que los pedidos pendientes hechos en días anteriores desaparecían al cambiar de semana.
- **Solución** (`src/server.js:735`): `pendientesSemana` ahora cuenta TODOS los pedidos activos (`ESTADOS_ACTIVOS`), sin filtro semanal. Solo `ingresosSemanales` y `gananciaSemanal` filtran por `entregado_at >= weekStart`.

### Cache busting forzado en JS/CSS
- **Problema**: los cambios en `app.js` no se veían porque el navegador cacheaba el archivo. El servidor solo ponía `Cache-Control: no-cache` en HTML.
- **Solución** (`src/server.js:792`): se agregó `.js` y `.css` a la condición de `Cache-Control: no-cache`.
- Se subió `?v=2` → `?v=3` en `public/index.html` para forzar recarga.

### Fix timezone en fechas de entrega
- **Problema**: al guardar una fecha desde `<input type="date">`, se enviaba `"2026-06-10"` (date-only). `new Date("2026-06-10")` lo interpretaba como medianoche UTC, y al leerlo desde Argentina (UTC-3) se veía un día antes.
- **Solución** (`src/server.js:85-88`): en `parseNullableDate`, si el valor es `YYYY-MM-DD` se le agrega `T12:00:00` (mediodía) para que ningún huso horario corra la fecha.
- Afecta tanto a pedidos nuevos como a edición.

### Keep-alive con UptimeRobot
- **Problema**: el GitHub Actions keep-alive no funcionaba. Render duerme el servidor tras 15 min, causando ~30s de cold start.
- **Solución**: se creó un monitor HTTP en UptimeRobot (misma cuenta que LUSTIX) que pingea `https://viandas-gla.onrender.com/api/health` cada **5 minutos**.
- Monitor ID: `803252369`
- Se eliminó `.github/workflows/keep-alive.yml` (no funcional).

### Filtro periodo en dashboard KPI (semana / mes / total)
- **Backend** (`src/server.js:723-761`): `/api/stats` acepta `?periodo=semana|mes|total`. Calcula pedidosRealizados, ingresos, ganancia, clientes según el periodo. `pendientes` siempre muestra todos los activos.
- **Mes**: es mes calendario (desde el 1ro del mes actual, no últimos 30 días).
- **Frontend** (`public/app.js:v3`): 3 botones "Semana / Mes / Total" sobre las KPI cards. Al clickear, re-fetch con el periodo. Labels de cards sin período (solo "Ganancia", "Ingresos", etc.) porque el filtro ya lo indica.
- **CSS**: `.periodo-filter` con flexbox centrado, botones `btn-sm` con estilo `btn-primary`/`btn-outline`.

## Comandos útiles
```bash
# Desarrollo
npm run dev

# Producción local
npm start

# Deploy manual en Render (vía API)
curl -X POST https://api.render.com/v1/services/srv-d8csqrojs32c73asgl1g/deploys \
  -H "Authorization: Bearer rnd_VWb6ZEGRZJz8QXqdUXSF3HjpDUv9"
```
