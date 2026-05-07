#!/usr/bin/env python3
import json
import mimetypes
import os
import re
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "5175"))
HOST = "127.0.0.1"

SETTING_KEYS = [
    "bendScale",
    "shearScale",
    "lightScale",
    "chromaScale",
    "speedScale",
    "coverage",
    "baseBrightness",
    "gamma",
    "shadowScale",
]
BACKGROUND_SETTING_KEYS = [
    "backgroundBlur",
    "backgroundBrightness",
    "backgroundSaturation",
]


def format_number(key, value):
    number = float(value)
    if key == "baseBrightness" or number.is_integer():
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".")


def clean_settings(settings, keys):
    return {
        key: float(settings.get(key, 0))
        for key in keys
    }


def save_ripple_settings(settings):
    ripple_source = settings.get("ripple", settings)
    background_source = settings.get("background", {})
    clean = {
        key: float(ripple_source.get(key, 0))
        for key in SETTING_KEYS
    }
    clean_background = {
        key: float(background_source.get(key, 0))
        for key in BACKGROUND_SETTING_KEYS
    }
    saved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    version = str(int(datetime.now().timestamp() * 1000))

    app_path = ROOT / "app.js"
    app = app_path.read_text(encoding="utf-8")
    settings_block = "\n".join(
        f"  {key}: {format_number(key, clean[key])},"
        for key in SETTING_KEYS
    )
    app = re.sub(
        r"const defaultRippleSettings = \{[\s\S]*?\};",
        f"const defaultRippleSettings = {{\n{settings_block}\n}};",
        app,
    )
    background_block = "\n".join(
        f"  {key}: {format_number(key, clean_background[key])},"
        for key in BACKGROUND_SETTING_KEYS
    )
    app = re.sub(
        r"const defaultBackgroundSettings = \{[\s\S]*?\};",
        f"const defaultBackgroundSettings = {{\n{background_block}\n}};",
        app,
    )
    app_path.write_text(app, encoding="utf-8")

    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(r"styles\.css\?v=[^\"]+", f"styles.css?v={version}", html)
    html = re.sub(r"app\.js\?v=[^\"]+", f"app.js?v={version}", html)
    if 'name="ripple-settings-saved-at"' in html:
        html = re.sub(
            r'<meta name="ripple-settings-saved-at" content="[^"]*" />',
            f'<meta name="ripple-settings-saved-at" content="{saved_at}" />',
            html,
        )
    else:
        html = html.replace(
            "</head>",
            f'    <meta name="ripple-settings-saved-at" content="{saved_at}" />\n  </head>',
        )
    html_path.write_text(html, encoding="utf-8")

    css_path = ROOT / "styles.css"
    css = css_path.read_text(encoding="utf-8")
    marker = f"/* ripple-settings-saved-at: {saved_at} */"
    if css.startswith("/* ripple-settings-saved-at:"):
        css = re.sub(r"^/\* ripple-settings-saved-at: .* \*/\n", marker + "\n", css)
    else:
        css = marker + "\n" + css
    css = re.sub(r"--background-blur: [^;]+;", f"--background-blur: {format_number('backgroundBlur', clean_background['backgroundBlur'])}px;", css)
    css = re.sub(r"--background-brightness: [^;]+;", f"--background-brightness: {format_number('backgroundBrightness', clean_background['backgroundBrightness'])};", css)
    css = re.sub(r"--background-saturation: [^;]+;", f"--background-saturation: {format_number('backgroundSaturation', clean_background['backgroundSaturation'])};", css)
    css_path.write_text(css, encoding="utf-8")


def save_cards(cards):
    if not isinstance(cards, list):
        raise ValueError("cards payload must be a list")

    cleaned = []
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            raise ValueError(f"card {index} must be an object")
        pose = card.get("pose", {})
        if not isinstance(pose, dict):
            pose = {}
        cleaned.append({
            "id": str(card.get("id") or f"card-{index + 1}"),
            "label": str(card.get("label", "")),
            "sub-label": str(card.get("sub-label", card.get("subLabel", ""))),
            "label-fill": str(card.get("label-fill", card.get("labelFill", ""))),
            "image": str(card.get("image") or ""),
            "pose": pose,
        })

    cards_path = ROOT / "data" / "cards.json"
    cards_path.parent.mkdir(parents=True, exist_ok=True)
    cards_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    version = str(int(datetime.now().timestamp() * 1000))
    saved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(r"styles\.css\?v=[^\"]+", f"styles.css?v={version}", html)
    html = re.sub(r"app\.js\?v=[^\"]+", f"app.js?v={version}", html)
    if 'name="cards-saved-at"' in html:
        html = re.sub(
            r'<meta name="cards-saved-at" content="[^"]*" />',
            f'<meta name="cards-saved-at" content="{saved_at}" />',
            html,
        )
    else:
        html = html.replace(
            "</head>",
            f'    <meta name="cards-saved-at" content="{saved_at}" />\n  </head>',
        )
    html_path.write_text(html, encoding="utf-8")


def save_focus_layout(layout):
    if not isinstance(layout, dict):
        raise ValueError("focus layout payload must be an object")

    slot_order = ["front", "left", "right", "back"]
    fallback_labels = {
        "front": "前景",
        "left": "左侧",
        "right": "右侧",
        "back": "后方",
    }
    numeric_keys = ["x", "y", "z", "r", "rx", "ry", "s", "blur", "fade", "sat"]
    cleaned = {}
    for slot in slot_order:
        source = layout.get(slot, {})
        if not isinstance(source, dict):
            source = {}
        cleaned[slot] = {"label": str(source.get("label") or fallback_labels[slot])}
        for key in numeric_keys:
            cleaned[slot][key] = float(source.get(key, 0))

    layout_path = ROOT / "data" / "focus-layout.json"
    layout_path.parent.mkdir(parents=True, exist_ok=True)
    layout_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    version = str(int(datetime.now().timestamp() * 1000))
    saved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(r"styles\.css\?v=[^\"]+", f"styles.css?v={version}", html)
    html = re.sub(r"app\.js\?v=[^\"]+", f"app.js?v={version}", html)
    if 'name="focus-layout-saved-at"' in html:
        html = re.sub(
            r'<meta name="focus-layout-saved-at" content="[^"]*" />',
            f'<meta name="focus-layout-saved-at" content="{saved_at}" />',
            html,
        )
    else:
        html = html.replace(
            "</head>",
            f'    <meta name="focus-layout-saved-at" content="{saved_at}" />\n  </head>',
        )
    html_path.write_text(html, encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path not in {"/api/ripple-settings", "/api/cards", "/api/focus-layout"}:
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(payload or "{}")
            if self.path == "/api/ripple-settings":
                save_ripple_settings(data)
            elif self.path == "/api/cards":
                save_cards(data)
            else:
                save_focus_layout(data)
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            body = str(error).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


if __name__ == "__main__":
    mimetypes.add_type("text/javascript; charset=utf-8", ".js")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"One-Hop Motion preview: http://{HOST}:{PORT}")
    server.serve_forever()
