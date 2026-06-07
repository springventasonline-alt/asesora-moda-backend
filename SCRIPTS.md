# Script tag — Tiendanube Partner Portal

## URLs del script (producción)

```
https://asesora-moda-backend-production.up.railway.app/widget/asesora-nube.min.js   ← NubeSDK ON
https://asesora-moda-backend-production.up.railway.app/widget/asesora.js            ← NubeSDK OFF (legacy)
```

## Configuración en partners.tiendanube.com

1. Entrá a tu app → **Scripts**
2. Creá o editá el script de storefront
3. Elegí la URL según el modo (ver tabla abajo)
4. **Uses NubeSDK**: debe coincidir con la URL elegida
5. **onfirstinteraction**: no requiere código extra; el script se carga tras scroll/clic/tap
6. Activá **Auto instalado** para tiendas que instalen la app
7. Guardá y publicá una nueva versión del script

| Uses NubeSDK | URL de producción | Cuándo usar |
|--------------|-------------------|-------------|
| **Activado** | `/widget/asesora-nube.min.js` | Recomendado (Partner Portal Dev mode) |
| **Desactivado** | `/widget/asesora.js` | Script legacy con DOM directo |

### Por qué hay dos scripts

Con **NubeSDK activado**, Tiendanube ejecuta el script en un **Web Worker** y espera:

```typescript
export function App(nube: NubeSDK) { ... }
```

El script legacy (`asesora.js`) usa `document` / `window` y **no puede** renderizar el botón en ese entorno.  
`asesora-nube.min.js` se genera desde `nube-widget/` con `npm run build`.

## Cómo funciona

| Archivo | Rol |
|---------|-----|
| `/widget/asesora-nube.min.js` | Entry NubeSDK: botón en slot `corner_bottom_right` + popup en `modal_content` |
| `/widget/asesora.js` | Legacy: botón flotante vía DOM (solo sin NubeSDK) |
| `/widget/popup.html` | Quiz + resultados (iframe) |
| `/productos/:store_id` | API de productos filtrados por perfil |

**Store ID:** NubeSDK lo lee de `nube.getState().store.id`. Legacy usa `LS.store.id` o el parámetro `?store=` que inyecta Tiendanube en la URL del script.

## Build del widget NubeSDK

```bash
cd nube-widget
npm install
npm run build   # genera public/widget/asesora-nube.min.js
```

Dev local (Partner Portal → Dev mode → `http://localhost:8080/main.min.js`):

```bash
cd nube-widget && npm run dev
```

## Instalación manual en el theme (alternativa legacy)

En **Diseño → Editar código → layout** o footer, antes de `</body>`:

```html
<script src="https://asesora-moda-backend-production.up.railway.app/widget/asesora.js" defer></script>
```

## Verificar

1. `GET https://asesora-moda-backend-production.up.railway.app/health` → `{"ok":true}`
2. Abrí la tienda, interactuá (scroll o clic) si usás `onfirstinteraction`
3. Debe aparecer **✨ Encontrá tu look** abajo a la derecha

## OAuth previo

La tienda debe estar conectada para productos reales:

- Instalá la app: `https://asesora-moda-backend-production.up.railway.app/auth/install?store=springdemo.mitiendanube.com`
- O configurá en Railway: `TN_STORE_ID` + `TN_ACCESS_TOKEN`

Sin token, el popup funciona pero `/productos` devuelve productos demo o vacío.
