const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const DEFAULT_SETTINGS_PATH = path.join(ROOT_DIR, "settings.default.json");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

const DEFAULT_SETTINGS = readJson(DEFAULT_SETTINGS_PATH, {});

function deepMerge(defaults, override = {}) {
  const merged = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  Object.keys(override || {}).forEach(key => {
    if (
      override[key] &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key]) &&
      defaults[key] &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key])
    ) {
      merged[key] = deepMerge(defaults[key], override[key]);
    } else {
      merged[key] = override[key];
    }
  });
  return merged;
}

function getSettings() {
  return deepMerge(DEFAULT_SETTINGS, readJson(SETTINGS_PATH, {}));
}

function getPublicSettings() {
  const settings = getSettings();
  return deepMerge(settings, {
    payment: {
      secretKey: "",
      webhookSecret: ""
    }
  });
}

function writeSettings(settings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(deepMerge(DEFAULT_SETTINGS, settings), null, 2));
}

function setSecurityHeaders(res, isAdmin = false) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isAdmin) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store");
  }
}

function sendJson(res, statusCode, payload) {
  setSecurityHeaders(res);
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, isAdmin = false) {
  setSecurityHeaders(res, isAdmin);
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".txt"] });
  res.end(text);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req, res) {
  if (!ADMIN_PASSWORD) {
    sendText(res, 503, "Admin is disabled. Set ADMIN_PASSWORD in Coolify environment variables.\n", true);
    return false;
  }

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="SpiritualShaadi Admin", charset="UTF-8"');
    sendText(res, 401, "Authentication required.\n", true);
    return false;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="SpiritualShaadi Admin", charset="UTF-8"');
    sendText(res, 401, "Invalid admin credentials.\n", true);
    return false;
  }

  return true;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function resolveStaticPath(requestPath) {
  let normalizedPath = decodeURIComponent(requestPath);
  if (normalizedPath === "/") normalizedPath = "/index.html";
  if (normalizedPath === "/admin" || normalizedPath === "/admin/") normalizedPath = "/admin.html";

  const filePath = path.normalize(path.join(ROOT_DIR, normalizedPath));
  if (!filePath.startsWith(ROOT_DIR)) return null;
  return filePath;
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, 200, getPublicSettings());
    return true;
  }

  if (pathname === "/api/admin/settings") {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET") {
      sendJson(res, 200, getSettings());
      return true;
    }

    if (req.method === "PUT" || req.method === "POST") {
      try {
        const body = await readRequestBody(req);
        const settings = JSON.parse(body || "{}");
        writeSettings(settings);
        sendJson(res, 200, { ok: true, settings: getSettings() });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message || "Invalid settings payload" });
      }
      return true;
    }

    sendText(res, 405, "Method not allowed.\n", true);
    return true;
  }

  return false;
}

function serveStatic(req, res, pathname) {
  const isAdmin = pathname === "/admin" || pathname === "/admin/" || pathname === "/admin.html" || pathname === "/admin.js";
  if (isAdmin && !requireAdmin(req, res)) return;

  const filePath = resolveStaticPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (path.extname(pathname)) {
      sendText(res, 404, "Not found.\n", isAdmin);
      return;
    }

    const fallback = path.join(ROOT_DIR, "index.html");
    setSecurityHeaders(res);
    res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
    fs.createReadStream(fallback).pipe(res);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  setSecurityHeaders(res, isAdmin);
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
  };

  if (!isAdmin && [".css", ".js", ".jpg", ".jpeg", ".png", ".svg", ".ico"].includes(ext)) {
    headers["Cache-Control"] = "public, max-age=86400";
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/healthz") {
    sendText(res, 200, "ok\n");
    return;
  }

  if (await handleApi(req, res, pathname)) return;
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  if (!ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD is not set. /admin will stay disabled until it is configured.");
  }
  console.log(`SpiritualShaadi server listening on port ${PORT}`);
});
