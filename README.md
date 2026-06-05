# Asesora de Moda — Backend

Backend Express para conectar tiendas Tiendanube con el frontend HTML de asesoría de moda.

## Deploy en Railway

1. Subí este repo a GitHub y conectalo en [railway.app/new](https://railway.app/new).
2. Configurá variables de entorno (ver `.env.example`).
3. Generá dominio público en **Networking**.
4. En el Partner Portal de Tiendanube, callback OAuth:
   `https://TU-APP.up.railway.app/auth/callback`
5. Verificá: `GET https://TU-APP.up.railway.app/health`

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Healthcheck para Railway |
| GET | `/auth/install` | Inicia OAuth con Tiendanube |
| GET | `/auth/callback` | Callback OAuth (configurar en Partner Portal) |
| GET | `/productos/:store_id` | Productos filtrados por perfil |
| GET/POST | `/config/:store_id` | Configuración por tienda |

### Ejemplo de productos filtrados

```http
GET /productos/123456?tipo_cuerpo=x&estilo=casual&altura=media
```

## Convención de tags en Tiendanube

Etiquetá cada producto en el admin de Tiendanube con tags separados por coma.

### Tipo de cuerpo

- `tipo-x` — reloj de arena
- `tipo-o` — redonda
- `tipo-h` — rectangular
- `tipo-a` — triángulo / pera
- `tipo-v` — triángulo invertido
- `universal` o `todos-los-cuerpos` — aplica a todos

### Estilo

- `casual`, `elegante`, `sport`, `trendy`, `romantica`
- `todos-los-estilos` — aplica a todos

### Altura

- `altura-baja`, `altura-media`, `altura-alta`
- `todas-las-alturas` o `universal` — aplica a todos

## Script tag Tiendanube

Ver **[SCRIPTS.md](./SCRIPTS.md)** para configurar el widget en Partner Portal.

URL del script:
```
https://TU-APP.up.railway.app/widget/asesora.js
```

## Frontend HTML

Desde el HTML estático, llamá al backend con `fetch`:

```javascript
const API = 'https://TU-APP.up.railway.app';
const storeId = '123456';

const res = await fetch(
  `${API}/productos/${storeId}?tipo_cuerpo=x&estilo=casual&altura=media`
);
const data = await res.json();
```

Configurá `FRONTEND_URL` con el dominio del HTML para CORS.

## Notas de producción

- Los tokens OAuth se guardan en `data/stores.json` (persisten mientras el contenedor no se redeploye).
- Para una tienda fija, podés usar `TN_STORE_ID` + `TN_ACCESS_TOKEN` en Railway.
- Tras cada redeploy sin esas variables, la tienda debe reinstalar con `/auth/install`.
