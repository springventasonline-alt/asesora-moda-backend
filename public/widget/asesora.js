/**
 * Asesora de Moda — Script LEGACY (sin NubeSDK)
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') {
    console.warn('[asesora-moda] Script legacy requiere DOM.');
    return;
  }

  var DEFAULT_APP_BASE = 'https://asesora-moda-backend-production.up.railway.app';
  var ROOT_ID = 'asesora-moda-root';
  var TRIGGER_ID = 'asesora-moda-trigger';
  var IFRAME_ID = 'asesora-moda-iframe';
  var OVERLAY_ID = 'asesora-moda-overlay';

  function isHostedOnAppsCdn(src) {
    return /apps-scripts\.tiendanube\.com/i.test(src || '');
  }

  function getAppBase() {
    var script = document.currentScript;
    if (script) {
      var fromData = script.getAttribute('data-app-base');
      if (fromData) return String(fromData).replace(/\/$/, '');
      var src = script.src || '';
      if (isHostedOnAppsCdn(src)) return DEFAULT_APP_BASE;
      if (src) {
        try {
          return new URL(src).origin;
        } catch (e) {
          /* ignore */
        }
      }
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i].src || '';
      if (isHostedOnAppsCdn(s)) return DEFAULT_APP_BASE;
      if (s.indexOf('/widget/asesora') !== -1) {
        try {
          return new URL(s).origin;
        } catch (e2) {
          /* ignore */
        }
      }
    }
    return DEFAULT_APP_BASE;
  }

  function getStoreIdFromScriptSrc(src) {
    if (!src) return null;
    var match = src.match(/[?&]store=(\d+)/);
    return match ? match[1] : null;
  }

  function getStoreId() {
    if (window.LS && window.LS.store && window.LS.store.id) {
      return String(window.LS.store.id);
    }
    var script = document.currentScript;
    if (script) {
      var fromData = script.getAttribute('data-store-id');
      if (fromData) return String(fromData);
      var fromCurrent = getStoreIdFromScriptSrc(script.src || '');
      if (fromCurrent) return fromCurrent;
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var fromSrc = getStoreIdFromScriptSrc(scripts[i].src || '');
      if (fromSrc) return fromSrc;
    }
    return null;
  }

  function injectStyles(config) {
    if (document.getElementById('asesora-moda-styles')) return;
    var primary = (config && config.color_primary) || '#1A1A2E';
    var accent = (config && config.color_accent) || '#C8956C';
    var style = document.createElement('style');
    style.id = 'asesora-moda-styles';
    style.textContent = [
      '@keyframes asesoraPulse {',
      '0%,100%{box-shadow:0 10px 40px rgba(0,0,0,0.35),0 0 0 0 rgba(200,149,108,0.4)}',
      '50%{box-shadow:0 12px 44px rgba(0,0,0,0.4),0 0 0 8px rgba(200,149,108,0.15)}',
      '}',
      '#' + TRIGGER_ID + '{',
      'position:fixed;bottom:1.25rem;right:1rem;left:1rem;z-index:99998;',
      'background:' + primary + ';color:#fff;border:none;border-radius:999px;',
      'padding:1rem 1.35rem;font-family:Outfit,system-ui,sans-serif;',
      'font-size:0.95rem;font-weight:600;cursor:pointer;',
      'box-shadow:0 10px 40px rgba(0,0,0,0.35);',
      'display:flex;align-items:center;justify-content:center;gap:0.55rem;',
      'max-width:420px;margin-left:auto;animation:asesoraPulse 2.8s ease-in-out infinite;',
      'line-height:1.2;text-align:left;',
      '}',
      '#' + TRIGGER_ID + ':hover{background:' + accent + ';transform:scale(1.02);}',
      '#' + TRIGGER_ID + '.hidden{display:none !important;}',
      '#' + OVERLAY_ID + '{',
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);',
      'display:none;align-items:flex-end;justify-content:center;',
      '}',
      '#' + OVERLAY_ID + '.open{display:flex;}',
      '#' + IFRAME_ID + '{',
      'width:100%;max-width:480px;height:92vh;border:none;border-radius:20px 20px 0 0;',
      'background:#FAF9F6;',
      '}',
      '@media (max-width:600px){',
      '#' + TRIGGER_ID + '{left:0.75rem;right:0.75rem;max-width:none;}',
      '#' + IFRAME_ID + '{height:100vh;border-radius:0;max-width:100%;}',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  function buildPopupUrl(appBase, storeId, config) {
    var params = new URLSearchParams({ embed: '1', api: appBase, store: storeId });
    if (config) {
      if (config.advisor_name)  params.set('cn', config.advisor_name);
      if (config.advisor_role)  params.set('cr', config.advisor_role);
      if (config.advisor_photo) params.set('cp', config.advisor_photo);
      if (config.welcome_msg)   params.set('cm1', config.welcome_msg);
      if (config.welcome_msg2)  params.set('cm2', config.welcome_msg2);
      if (config.cta_text)      params.set('cta', config.cta_text);
      if (config.color_primary) params.set('pri', config.color_primary);
      if (config.color_accent)  params.set('acc', config.color_accent);
      if (config.show_video === false) params.set('sv', '0');
      if (config.video_url)     params.set('vu', config.video_url);
    }
    return appBase + '/widget/popup.html?' + params.toString();
  }

  function openPopup(appBase, storeId, config) {
    var overlay = document.getElementById(OVERLAY_ID);
    var iframe = document.getElementById(IFRAME_ID);
    var trigger = document.getElementById(TRIGGER_ID);
    if (!overlay || !iframe) return;
    iframe.src = buildPopupUrl(appBase, storeId, config);
    overlay.classList.add('open');
    if (trigger) trigger.classList.add('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closePopup() {
    var overlay = document.getElementById(OVERLAY_ID);
    var iframe = document.getElementById(IFRAME_ID);
    var trigger = document.getElementById(TRIGGER_ID);
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (trigger) trigger.classList.remove('hidden');
    if (iframe) iframe.src = 'about:blank';
  }

  function fetchStoreConfig(appBase, storeId) {
    return fetch(appBase + '/config/' + encodeURIComponent(storeId), { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return {};
        return res.json();
      })
      .catch(function () {
        return {};
      });
  }

  function applyTriggerConfig(trigger, config) {
    if (!config || !trigger) return;
    var label = config.trigger_text || '👗 quiero productos pensados para mi';
    var accent = config.color_accent || '#C8956C';
    trigger.innerHTML =
      '<span style="width:10px;height:10px;border-radius:50%;background:' +
      accent +
      ';display:inline-block;flex-shrink:0"></span><span>' +
      label +
      '</span>';
    if (config.color_primary) trigger.style.background = config.color_primary;
  }

  function mount(appBase, storeId, config) {
    if (document.getElementById(ROOT_ID)) return;

    injectStyles(config);

    var root = document.createElement('div');
    root.id = ROOT_ID;

    var trigger = document.createElement('button');
    trigger.id = TRIGGER_ID;
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Abrir asesora de moda');
    // Nace oculto — se muestra solo si NO se va a auto-abrir el popup
    trigger.classList.add('hidden');
    applyTriggerConfig(trigger, config);
    trigger.addEventListener('click', function () {
      openPopup(appBase, storeId, config);
    });

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePopup();
    });

    var iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.title = 'Asesora de Moda';
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    overlay.appendChild(iframe);

    root.appendChild(trigger);
    root.appendChild(overlay);
    document.body.appendChild(root);

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'asesora-close') return;
      if (event.origin !== appBase) return;
      closePopup();
    });

    console.info('[asesora-moda] Widget montado', { storeId: storeId, appBase: appBase });
  }

  function maybeAutoOpen(appBase, storeId, config) {
    var trigger = document.getElementById(TRIGGER_ID);
    if (config && config.show_popup === false) {
      // No auto-abrir — mostrar el botón flotante directamente
      if (trigger) trigger.classList.remove('hidden');
      return;
    }
    var seenKey = 'asesora_welcome_seen_' + storeId;
    if (sessionStorage.getItem(seenKey)) {
      // Ya vio el popup en esta sesión — mostrar el botón directamente
      if (trigger) trigger.classList.remove('hidden');
      return;
    }
    // Primera visita: auto-abrir sin mostrar el botón primero
    setTimeout(function () {
      openPopup(appBase, storeId, config);
      sessionStorage.setItem(seenKey, '1');
    }, 400);
  }

  function init() {
    var appBase = getAppBase();
    var storeId = getStoreId();
    if (!appBase) {
      console.warn('[asesora-moda] No se pudo detectar APP_BASE');
      return;
    }
    if (!storeId) {
      console.warn('[asesora-moda] No se detectó store_id');
      return;
    }

    function start(config) {
      config = config || {};
      function boot() {
        mount(appBase, storeId, config);
        maybeAutoOpen(appBase, storeId, config);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }
    }

    fetchStoreConfig(appBase, storeId).then(start);
  }

  init();
})();
