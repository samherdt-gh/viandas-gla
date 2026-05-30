# Sabores de la GLA — Memoria del proyecto

## Goal
App web de gestión de viandas (mobile-first, pastel palette, logo-based branding) + catálogo online público para clientes. Persistencia real en Supabase, deploy en Render.

## Stack
- **Backend**: Node.js + Express (body limit: 5mb)
- **DB**: Supabase (PostgreSQL) — service role key en backend
- **Frontend**: HTML + CSS + JS vanilla (mobile-first, sin frameworks)
- **Storage**: Supabase Storage (bucket `viandas-imagenes`, público)
- **IA imágenes**: Pollinations.ai (gratis, sin API key)

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

## Próximos pasos (pendientes)
1. **Autenticación**: login con Supabase Auth (email + contraseña), proteger rutas admin, solo usuarios autorizados
2. (sugerido) Editar items de pedido existentes en el modal de edición

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
