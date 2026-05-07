import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const port = Number(process.env.PORT || 5174);
const host = "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const settingKeys = [
  "bendScale",
  "shearScale",
  "lightScale",
  "chromaScale",
  "speedScale",
  "coverage",
  "baseBrightness",
  "gamma",
  "shadowScale",
];
const backgroundSettingKeys = [
  "backgroundBlur",
  "backgroundBrightness",
  "backgroundSaturation",
];

function formatSettings(settings) {
  return settingKeys
    .map((key) => `  ${key}: ${Number(settings[key]).toFixed(key === "baseBrightness" ? 0 : 2).replace(/\.00$/, "")},`)
    .join("\n");
}

function sanitizeSettings(settings) {
  return Object.fromEntries(
    settingKeys.map((key) => [key, Number.isFinite(Number(settings[key])) ? Number(settings[key]) : 0])
  );
}

async function saveRippleSettings(settings) {
  const clean = sanitizeSettings(settings.ripple ?? settings);
  const cleanBackground = Object.fromEntries(
    backgroundSettingKeys.map((key) => [key, Number.isFinite(Number(settings.background?.[key])) ? Number(settings.background[key]) : 0])
  );
  const savedAt = new Date().toISOString();

  const appPath = join(root, "app.js");
  let app = await readFile(appPath, "utf8");
  app = app.replace(
    /const defaultRippleSettings = \{[\s\S]*?\};/,
    `const defaultRippleSettings = {\n${formatSettings(clean)}\n};`
  );
  app = app.replace(
    /const defaultBackgroundSettings = \{[\s\S]*?\};/,
    `const defaultBackgroundSettings = {\n${backgroundSettingKeys
      .map((key) => `  ${key}: ${Number(cleanBackground[key]).toFixed(key === "backgroundBlur" ? 1 : 2).replace(/\.0$/, "").replace(/\.00$/, "")},`)
      .join("\n")}\n};`
  );
  await writeFile(appPath, app);

  const htmlPath = join(root, "index.html");
  let html = await readFile(htmlPath, "utf8");
  html = html.replace(/styles\.css\?v=[^"]+/, `styles.css?v=${Date.now()}`);
  html = html.replace(/app\.js\?v=[^"]+/, `app.js?v=${Date.now()}`);
  html = html.includes('name="ripple-settings-saved-at"')
    ? html.replace(/<meta name="ripple-settings-saved-at" content="[^"]*" \/>/, `<meta name="ripple-settings-saved-at" content="${savedAt}" />`)
    : html.replace("</head>", `    <meta name="ripple-settings-saved-at" content="${savedAt}" />\n  </head>`);
  await writeFile(htmlPath, html);

  const cssPath = join(root, "styles.css");
  let css = await readFile(cssPath, "utf8");
  const marker = `/* ripple-settings-saved-at: ${savedAt} */`;
  css = css.startsWith("/* ripple-settings-saved-at:")
    ? css.replace(/^\/\* ripple-settings-saved-at: .* \*\/\n/, `${marker}\n`)
    : `${marker}\n${css}`;
  css = css
    .replace(/--background-blur: [^;]+;/, `--background-blur: ${cleanBackground.backgroundBlur}px;`)
    .replace(/--background-brightness: [^;]+;/, `--background-brightness: ${cleanBackground.backgroundBrightness};`)
    .replace(/--background-saturation: [^;]+;/, `--background-saturation: ${cleanBackground.backgroundSaturation};`);
  await writeFile(cssPath, css);
}

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const normalized = normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.[/\\])+/, "");
  return join(root, normalized);
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/ripple-settings") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", async () => {
        await saveRippleSettings(JSON.parse(body || "{}"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405);
      response.end();
      return;
    }

    const filePath = resolveRequestPath(request.url);
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end();
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.code === "ENOENT" ? "Not found" : String(error.message || error));
  }
}).listen(port, host, () => {
  console.log(`One-Hop Motion preview: http://${host}:${port}`);
});
