# Viandas - Gla
App web simple para gestionar viandas, pedidos, stock y producción, con persistencia en Supabase.

## Stack
- Backend: Node.js + Express
- DB: Supabase (PostgreSQL)
- Frontend: HTML + CSS + JS (mobile-first)

## Qué resuelve esta base
- Alta/edición/borrado de viandas
- Alta de pedidos con items, fecha de entrega y notas
- Cambio de estado de pedidos (`pendiente`, `en_proceso`, `listo`, `entregado`, `cancelado`)
- Al marcar un pedido como `entregado`, descuenta stock automáticamente y registra movimientos
- Al volver de `entregado` a otro estado, repone stock y registra reversión
- Registro manual de producción (aumenta stock y registra movimiento)
- Dashboard con métricas diarias y entregas pendientes

## 1) Crear proyecto en Supabase
1. Crear proyecto en Supabase.
2. Ir a SQL Editor.
3. Ejecutar el contenido de `db/schema.sql`.

## 2) Configurar variables de entorno
Copiar `.env.example` a `.env` y completar:

```bash
PORT=3000
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

La `SUPABASE_SERVICE_ROLE_KEY` debe usarse solo en backend (nunca en frontend).

## 3) Instalar y correr
```bash
npm install
npm run dev
```

Producción:
```bash
npm start
```

## 4) Endpoints principales
- `GET /api/stats`
- `GET /api/viandas`
- `POST /api/viandas`
- `PUT /api/viandas/:id`
- `DELETE /api/viandas/:id`
- `GET /api/pedidos`
- `GET /api/pedidos/:id`
- `POST /api/pedidos`
- `PUT /api/pedidos/:id/estado`
- `DELETE /api/pedidos/:id`
- `GET /api/produccion`
- `POST /api/produccion`
- `GET /api/movimientos`

## 5) Deploy sugerido en Render
1. Crear Web Service apuntando a esta carpeta.
2. Build command: `npm install`
3. Start command: `npm start`
4. Agregar variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORT` (opcional, Render lo inyecta)

## Nota sobre seguridad
Esta base usa service role en backend para simplificar. Próximo paso recomendado: autenticación y políticas RLS para multiusuario.
