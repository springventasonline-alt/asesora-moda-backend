/**
 * Asesora de Moda — Script tag para Tiendanube
 * Partner Portal → Scripts → URL de producción:
 *   https://TU-APP.up.railway.app/widget/asesora.js
 *
 * También en el theme (manual):
 *   <script src="https://TU-APP.up.railway.app/widget/asesora.js" defer></script>
 */
(function () {
  'use strict';

  var ROOT_ID = 'asesora-moda-root';
  var TRIGGER_ID = 'asesora-moda-trigger';
  var IFRAME_ID = 'asesora-moda-iframe';
  var OVERLAY_ID = 'asesora-moda-overlay';

  function getAppBase() {
    var script = document.currentScript;
    if (script && script.src) {
      try {
        return new URL(script.src).origin;
      } catch (e) {
        /* ignore */
      }
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('/widget/asesora.js') !== -1) {
        try {
          return new URL(src).origin;
        } catch (e2) {
          /* ignore */
        }
      }
    }
    return '';
  }

  function getStoreId() {
    if (window.LS && window.LS.store && window.LS.store.id) {
      return String(window.LS.store.id);
    }
    var script = document.currentScript;
    if (script) {
      var fromData = script.getAttribute('data-store-id');
      if (fromData) return String(fromData);
      var match = (script.src || '').match(/[?&]store=(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById('asesora-moda-styles')) return;
    var style = document.createElement('style');
    style.id = 'asesora-moda-styles';
    style.textContent = [
      '#' + TRIGGER_ID + '{',
      'position:fixed;bottom:1.5rem;right:1rem;z-index:99998;',
      'background:#1A1A2E;color:#fff;border:none;border-radius:50px;',
      'padding:0.85rem 1.3rem;font-family:Outfit,system-ui,sans-serif;',
      'font-size:0.82rem;font-weight:500;cursor:pointer;',
      'box-shadow:0 8px 32px rgba(0,0,0,0.35);display:flex;align-items:center;gap:0.5rem;',
      '}',
      '#' + TRIGGER_ID + ':hover{background:#C4785A;transform:scale(1.03);}',
      '#' + OVERLAY_ID + '{',
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);',
      'display:none;align-items:flex-end;justify-content:center;',
      '}',
      '#' + OVERLAY_ID + '.open{display:flex;}',
      '#' + IFRAME_ID + '{',
      'width:100%;max-width:480px;height:92vh;border:none;border-radius:20px 20px 0 0;',
      'background:#FAF9F6;',
      '}',
      '@media (max-width:600px){#' + IFRAME_ID + '{height:100vh;border-radius:0;max-width:100%;}}',
    ].join('');
    document.head.appendChild(style);
  }

  function buildPopupUrl(appBase, storeId) {
    var params = new URLSearchParams({
      embed: '1',
      api: appBase,
      store: storeId,
    });
    return appBase + '/widget/popup.html?' + params.toString();
  }

  function openPopup(appBase, storeId) {
    var overlay = document.getElementById(OVERLAY_ID);
    var iframe = document.getElementById(IFRAME_ID);
    if (!overlay || !iframe) return;
    iframe.src = buildPopupUrl(appBase, storeId);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePopup() {
    var overlay = document.getElementById(OVERLAY_ID);
    var iframe = document.getElementById(IFRAME_ID);
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (iframe) iframe.src = 'about:blank';
  }

  function mount(appBase, storeId) {
    if (document.getElementById(ROOT_ID)) return;

    injectStyles();

    var root = document.createElement('div');
    root.id = ROOT_ID;

    var trigger = document.createElement('button');
    trigger.id = TRIGGER_ID;
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Abrir asesora de moda');
    trigger.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#E8A87C;display:inline-block"></span><span>✨ Encontrá tu look</span>';
    trigger.addEventListener('click', function () {
      openPopup(appBase, storeId);
    });

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePopup();
    });

    var iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.title = 'Asesora de Moda';
    iframe.setAttribute('allow', 'clipboard-write');
    overlay.appendChild(iframe);

    root.appendChild(trigger);
    root.appendChild(overlay);
    document.body.appendChild(root);

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'asesora-close') return;
      if (event.origin !== appBase) return;
      closePopup();
    });
  }

  function init() {
    var appBase = getAppBase();
    var storeId = getStoreId();
    if (!appBase) {
      console.warn('[asesora-moda] No se pudo detectar APP_BASE desde el script tag');
      return;
    }
    if (!storeId) {
      console.warn('[asesora-moda] No se detectó store_id (LS.store.id)');
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        mount(appBase, storeId);
      });
    } else {
      mount(appBase, storeId);
    }
  }

  init();
})();
