#!/usr/bin/env python3
"""Parche final del tema Spring: Asesora desde Railway + bloqueo popup PT."""
import ftplib
import io
import os
import re
import ssl
import sys

HOST = os.environ.get("TN_FTP_HOST", "ftp.tiendanube.com")
USER = os.environ.get("TN_FTP_USER", "spring29")
PASS = os.environ.get("TN_FTP_PASS", "")
LAYOUT = "layouts/layout.tpl"
HOME = "templates/home.tpl"
STORE_JS = "static/js/store.js.tpl"

HIJACK = """
\t\t{# asesora-script-hijack: CDN asesora → Railway #}
\t\t<script>
\t\t(function () {
\t\t\tvar RAILWAY = "https://asesora-moda-backend-production.up.railway.app/widget/asesora.js";
\t\t\tfunction patchLoader(svc) {
\t\t\t\tif (!svc || svc.__asesoraPatched || !svc.addScriptOnEvent) return;
\t\t\t\tsvc.__asesoraPatched = true;
\t\t\t\tvar orig = svc.addScriptOnEvent.bind(svc);
\t\t\t\tsvc.addScriptOnEvent = function (url, eventName) {
\t\t\t\t\tif (/asesor-virtual-tienda\\/asesora-de-moda/i.test(String(url))) {
\t\t\t\t\t\treturn orig(RAILWAY, eventName);
\t\t\t\t\t}
\t\t\t\t\treturn orig(url, eventName);
\t\t\t\t};
\t\t\t}
\t\t\tpatchLoader(window.scriptLoaderService);
\t\t\tvar tries = 0;
\t\t\tvar t = setInterval(function () {
\t\t\t\tpatchLoader(window.scriptLoaderService);
\t\t\t\ttries += 1;
\t\t\t\tif (tries > 40) clearInterval(t);
\t\t\t}, 250);
\t\t})();
\t\t</script>
"""

RAILWAY_TAG = (
    '\n\t\t{# asesora-railway-script: backend correcto en Railway #}\n'
    '\t\t<script src="https://asesora-moda-backend-production.up.railway.app/widget/asesora.js" '
    'data-store-id="6125057" defer></script>\n'
)

HOTFIX = """
\t\t{# asesora-appbase-hotfix: corrige iframe si CDN legacy abre apps-scripts #}
\t\t<script>
\t\t(function () {
\t\t\tvar APP_BASE = "https://asesora-moda-backend-production.up.railway.app";
\t\t\tfunction fixIframe() {
\t\t\t\tvar iframe = document.getElementById("asesora-moda-iframe");
\t\t\t\tif (!iframe || !iframe.src) return;
\t\t\t\tif (iframe.src.indexOf("apps-scripts.tiendanube.com") === -1) return;
\t\t\t\tvar store = (window.LS && window.LS.store && window.LS.store.id) || "6125057";
\t\t\t\tiframe.src = APP_BASE + "/widget/popup.html?embed=1&api=" + encodeURIComponent(APP_BASE) + "&store=" + store;
\t\t\t}
\t\t\tfunction killPortuguesePopup() {
\t\t\t\tvar modal = document.getElementById("home-modal");
\t\t\t\tif (modal) modal.remove();
\t\t\t\tdocument.querySelectorAll('.js-modal-overlay-private[data-modal-url="home-modal"]').forEach(function (el) { el.remove(); });
\t\t\t\tdocument.querySelectorAll(".modal-title, .modal-body, h2, h3, p").forEach(function (el) {
\t\t\t\t\tvar text = (el.textContent || "").trim();
\t\t\t\t\tif (/bem-vindo|minha página|wallpaper de fundo embutido|steelseries/i.test(text)) {
\t\t\t\t\t\tvar root = el.closest(".modal, [id*='modal'], [class*='modal']") || el;
\t\t\t\t\t\tif (root && root !== document.body) root.remove();
\t\t\t\t\t}
\t\t\t\t});
\t\t\t}
\t\t\tdocument.addEventListener("click", function (e) {
\t\t\t\tif (e.target && e.target.closest && e.target.closest("#asesora-moda-trigger")) {
\t\t\t\t\tsetTimeout(fixIframe, 0);
\t\t\t\t\tsetTimeout(fixIframe, 120);
\t\t\t\t}
\t\t\t}, true);
\t\t\tif (window.LS && LS.ready) LS.ready.then(killPortuguesePopup);
\t\t\tdocument.addEventListener("DOMContentLoaded", killPortuguesePopup);
\t\t\tsetTimeout(killPortuguesePopup, 12000);
\t\t})();
\t\t</script>
"""

HOME_BLOCK = """{% if settings.home_promotional_popup and ("home_popup_image.jpg" | has_custom_image or settings.home_popup_title or settings.home_popup_txt or settings.home_news_box or (settings.home_popup_btn and settings.home_popup_url)) %}
\t{% include 'snipplets/home/home-popup.tpl' %}
{% endif %}"""

HOME_REPLACEMENT = "{# Pop-up promocional desactivado (malware/config admin) #}"


def connect(password: str) -> ftplib.FTP_TLS:
    ctx = ssl.create_default_context()
    ftp = ftplib.FTP_TLS(context=ctx)
    ftp.connect(HOST, 21, timeout=120)
    ftp.auth()
    ftp.login(USER, password)
    ftp.prot_p()
    ftp.set_pasv(True)
    return ftp


def retr(ftp: ftplib.FTP_TLS, path: str) -> str:
    buf: list[bytes] = []
    ftp.retrbinary(f"RETR {path}", buf.append)
    return b"".join(buf).decode("utf-8", errors="replace")


def stor(ftp: ftplib.FTP_TLS, path: str, text: str) -> None:
    ftp.storbinary(f"STOR {path}", io.BytesIO(text.encode("utf-8")))


def patch_layout(text: str) -> str:
    if "asesora-script-hijack" not in text:
        text = text.replace("\t</head>", HIJACK + "\t</head>")

    if "asesora-railway-script" not in text:
        text = text.replace("\t</body>", RAILWAY_TAG + "\t</body>")

    if "asesora-appbase-hotfix" not in text:
        text = text.replace("\t</body>", HOTFIX + "\t</body>")

    # dedupe accidental double hotfix blocks
    while text.count("asesora-appbase-hotfix") > 1:
        text = re.sub(
            r"\t\t\{# asesora-appbase-hotfix:[\s\S]*?\t\t</script>\n",
            "",
            text,
            count=1,
        )
    return text


def patch_home(text: str) -> str:
    if HOME_BLOCK in text:
        return text.replace(HOME_BLOCK, HOME_REPLACEMENT)
    if "Pop-up promocional desactivado" in text:
        return text
    return text.replace(
        "{% include 'snipplets/home/home-popup.tpl' %}",
        "{# home popup disabled #}",
    )


def patch_store_js(text: str) -> str:
    old = "{% if settings.home_promotional_popup %}"
    new = "{% if false and settings.home_promotional_popup %}"
    if new in text:
        return text
    return text.replace(old, new, 1)


def main() -> int:
    password = PASS or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not password:
        print("Uso: TN_FTP_PASS=xxx python3 scripts/finalize-springvm-asesora-ftp.py")
        return 1

    ftp = connect(password)
    changes = []

    for remote, patcher in [
        (LAYOUT, patch_layout),
        (HOME, patch_home),
        (STORE_JS, patch_store_js),
    ]:
        original = retr(ftp, remote)
        patched = patcher(original)
        if patched != original:
            stor(ftp, remote, patched)
            changes.append(remote)
            print("↑", remote)
        else:
            print("=", remote)

    ftp.quit()
    print("Cambios:", len(changes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
