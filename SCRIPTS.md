# Script tag — Tiendanube Partner Portal

## URL del script (producción)

Reemplazá `TU-APP` por tu dominio de Railway:

```
https://TU-APP.up.railway.app/widget/asesora.js
```

## Configuración en partners.tiendanube.com

1. Entrá a tu app → **Scripts**
2. Creá o editá el script de storefront
3. **URL de producción:** `https://TU-APP.up.railway.app/widget/asesora.js`
4. Activá **Auto instalado** (recomendado) para que se cargue en todas las tiendas que instalen la app
5. Guardá y publicá una nueva versión del script

## Cómo funciona

| Archivo | Rol |
|---------|-----|
| `/widget/asesora.js` | Script tag liviano: botón flotante en la tienda |
| `/widget/popup.html` | Quiz + resultados (se abre en iframe) |
| `/productos/:store_id` | API de productos filtrados por perfil |

El script detecta automáticamente el `store_id` desde `window.LS.store.id` (Tiendanube).

## Instalación manual en el theme (alternativa)

En **Diseño → Editar código → layout** o footer, agregá antes de `</body>`:

```html
<script src="https://TU-APP.up.railway.app/widget/asesora.js" defer></script>
```

## Verificar

1. `GET https://TU-APP.up.railway.app/health` → `{"ok":true}`
2. `GET https://TU-APP.up.railway.app/widget/install` → URLs del widget
3. Abrí la tienda: debe aparecer el botón **✨ Encontrá tu look** abajo a la derecha

## OAuth previo

La tienda debe estar conectada:

- Instalá la app: `https://TU-APP.up.railway.app/auth/install`
- O configurá en Railway: `TN_STORE_ID` + `TN_ACCESS_TOKEN`

Sin token, el popup funciona pero `/productos` devuelve productos demo o vacío.
