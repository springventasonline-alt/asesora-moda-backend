# Deploy en Railway — Asesora de Moda

Proyecto Railway: [noble-achievement](https://railway.com/project/c6d8f12d-2f4d-4c90-8028-639da0141fd2)

Repo GitHub: `springventasonline-alt/asesora-moda-backend` (auto-deploy en cada push a `main`).

## 1. Generar dominio público

1. Abrí el proyecto en Railway
2. Servicio Node → **Settings** → **Networking**
3. **Generate Domain**
4. Copiá la URL (ej. `asesora-moda-backend-production.up.railway.app`)

## 2. Variables de entorno

En el servicio → **Variables**:

```env
NODE_ENV=production
APP_URL=https://TU-DOMINIO.up.railway.app
TIENDANUBE_CLIENT_ID=tu_client_id
TIENDANUBE_CLIENT_SECRET=tu_client_secret
FRONTEND_URL=*
ALLOWED_HOSTS=*
TIENDANUBE_USER_AGENT=AsesoraModa/1.0 (tu-email@dominio.com)

# Opcional — tienda fija sin re-OAuth tras redeploy:
# TN_STORE_ID=123456
# TN_ACCESS_TOKEN=token_de_tienda
```

> Actualizá `APP_URL` con el dominio real después de generarlo. Railway redeploya solo.

## 3. Partner Portal Tiendanube

| Campo | Valor |
|-------|-------|
| Redirect URL OAuth | `https://TU-DOMINIO.up.railway.app/auth/callback` |
| Script URL | `https://TU-DOMINIO.up.railway.app/widget/asesora.js` |

## 4. Verificar

```bash
curl https://TU-DOMINIO.up.railway.app/health
curl https://TU-DOMINIO.up.railway.app/widget/install
curl -I https://TU-DOMINIO.up.railway.app/widget/asesora.js
```

Respuesta esperada de `/health`:

```json
{"ok":true,"listenPort":8080,"stores":0,"oauthConfigured":true}
```

## 5. Instalar en una tienda

1. Abrí `https://TU-DOMINIO.up.railway.app/auth/install`
2. Autorizá la app en Tiendanube
3. El script tag se carga automáticamente si está configurado en Partner Portal
