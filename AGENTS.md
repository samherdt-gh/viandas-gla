# Sabores de la GLA — Memoria del proyecto

## Goal
App web de gestión de viandas (mobile-first, pastel palette, logo-based branding). Operativa con persistencia real en Supabase y deploy en Render.

## Stack
- **Backend**: Node.js + Express
- **DB**: Supabase (PostgreSQL) — service role key en backend
- **Frontend**: HTML + CSS + JS vanilla (mobile-first, sin frameworks)

## Despliegue
- **Render** plan free: `https://viandas-gla.onrender.com`
- Auto-deploy desde `main` en GitHub (`samherdt-gh/viandas-gla`)
- Cold start ~30s (se duerme tras 15 min de inactividad)
- API key de Render: `rnd_VWb6ZEGRZJz8QXqdUXSF3HjpDUv9`

## Supabase
- Proyecto: `tasrcjsejatmdepxulqe` (región sa-east-1)
- Service role key seteada en `.env` y en Render env vars
- Schema en `db/schema.sql` (4 tablas: viandas, pedidos, pedido_items, movimientos_stock + triggers + índices)

## Estructura del proyecto
```
Viandas - Gla/
├── .env                    # credenciales (no trackeado)
├── .env.example            # template de config
├── db/schema.sql           # schema completo SQL
├── package.json
├── src/
│   ├── server.js           # Express + todas las rutas API + lógica stock/producción
│   └── supabase.js         # cliente Supabase con service_role key
└── public/
    ├── index.html          # estructura HTML (sidebar, nav, páginas, modales)
    ├── styles.css          # mobile-first CSS (paleta verde oliva pastel)
    ├── app.js              # frontend completo (CRUD, stock, dashboard, búsqueda)
    └── logo.png            # logo extraído del PDF (200x200)
```

## Funcionalidades implementadas

### Gestión de viandas
- CRUD completo (alta, edición, eliminación)
- Tabla y vista cards con nombre, costo, precio venta, ganancia, stock, a producir
- Buscador con filtro client-side (`filtrarViandas`)

### Gestión de pedidos
- CRUD completo con items por vianda
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

### UX/UI
- Mobile-first con bottom nav
- Sidebar en desktop
- Modales tipo sheet para formularios
- Modal de confirmación (reemplaza `confirm()`)
- Modal de detalle de pedido (reemplaza `alert()`)
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

## Próximos pasos (pendientes)
1. **Autenticación**: login con Supabase Auth (email + contraseña), proteger rutas, solo usuarios autorizados
2. **Catálogo online**: web app para clientes donde puedan ver el catálogo y hacer pedidos, que se registren automáticamente en este sistema

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
