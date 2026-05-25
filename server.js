const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const SECRET_PATH = path.join(DATA_DIR, "session.secret");
const DEFAULT_SETTINGS_PATH = path.join(ROOT_DIR, "settings.default.json");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const SESSION_COOKIE = "ss_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BOT_ACCEPT_DELAY_MS = 3000;
const BOT_REPLY_DELAY_MS = 1800;

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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

const DEFAULT_SETTINGS = readJson(DEFAULT_SETTINGS_PATH, {});

function loadOrCreateSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, "utf8").trim();
  const generated = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  console.warn("SESSION_SECRET not set. Generated one at data/session.secret. Set SESSION_SECRET in env for portability.");
  return generated;
}
const SESSION_SECRET = loadOrCreateSecret();

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

// ---------------------------------------------------------------------------
// JSON file store with per-file mutex + atomic writes
// ---------------------------------------------------------------------------

const fileLocks = new Map();
function withFileLock(name, fn) {
  const prev = fileLocks.get(name) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  fileLocks.set(name, prev.then(() => next));
  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      release();
      if (fileLocks.get(name) === next) fileLocks.delete(name);
    }
  });
}

function loadStore(name, fallback) {
  const filePath = path.join(DATA_DIR, name);
  return readJson(filePath, fallback);
}

function saveStore(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, name);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function mutateStore(name, fallback, mutator) {
  return withFileLock(name, async () => {
    const data = loadStore(name, fallback);
    const result = await mutator(data);
    saveStore(name, data);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Admin settings (existing behavior preserved)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Crypto: passwords, session cookies
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256");
  return `pbkdf2$120000$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[2], "hex");
    expected = Buffer.from(parts[3], "hex");
  } catch {
    return false;
  }
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, "sha256");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function signSession(accountId) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ accountId, expires })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.accountId !== "string") return null;
    if (typeof data.expires !== "number" || data.expires < Date.now()) return null;
    return data.accountId;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(";").forEach(part => {
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  });
  return out;
}

function setSessionCookie(res, token, ttlMs = SESSION_TTL_MS) {
  const expires = new Date(Date.now() + ttlMs).toUTCString();
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

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
  if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", "no-store");
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

async function readJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    const err = new Error("Invalid JSON body");
    err.statusCode = 400;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function trimStr(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function normalizeMobile(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isValidMobile(value) {
  const m = normalizeMobile(value);
  return m.length >= 10 && m.length <= 15;
}

function isValidPassword(value) {
  return String(value || "").length >= 8;
}

// ---------------------------------------------------------------------------
// Accounts: load, find, create
// ---------------------------------------------------------------------------

function loadAccountsRaw() {
  return loadStore("accounts.json", []);
}

function createProfileId(existing, seed = false) {
  const base = seed ? 900000 : 100000;
  const range = 900000;
  const taken = new Set(existing.map(a => a.profileId));
  let attempts = 0;
  while (attempts < 200) {
    const id = `SS${Math.floor(base + Math.random() * range)}`;
    if (!taken.has(id)) return id;
    attempts++;
  }
  return `SS${base + existing.length}`;
}

function makeAccountId() {
  return `acct-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    profileId: account.profileId,
    kind: account.kind,
    name: account.name,
    mobile: account.mobile,
    email: account.email,
    mobileVerified: Boolean(account.mobileVerified),
    createdAt: account.createdAt,
    profile: account.profile || null
  };
}

// Profile object as seen by the public feed (other users)
function feedProfile(account) {
  if (!account || !account.profile) return null;
  const p = account.profile;
  return {
    id: account.profileId,
    profileId: account.profileId,
    kind: account.kind,
    name: p.name,
    gender: p.gender,
    age: p.age,
    height: p.height,
    location: p.location,
    profession: p.profession,
    religion: p.religion,
    sect: p.sect,
    caste: p.caste,
    subcaste: p.subcaste,
    deity: p.deity,
    spiritualPath: p.spiritualPath,
    diet: p.diet,
    sadhana: p.sadhana,
    bio: p.bio,
    avatarColor: p.avatarColor,
    hobbies: Array.isArray(p.hobbies) ? p.hobbies : [],
    chatGreeting: p.chatGreeting || ""
  };
}

function findAccountByIdentifier(accounts, identifier) {
  const normalizedLower = String(identifier || "").trim().toLowerCase();
  const mobile = normalizeMobile(identifier);
  if (!normalizedLower && !mobile) return null;
  return accounts.find(account => {
    const accountMobile = normalizeMobile(account.mobile);
    const accountEmail = normalizeEmail(account.email);
    const accountProfileId = String(account.profileId || "").toLowerCase();
    return (
      (mobile && accountMobile === mobile) ||
      (normalizedLower && accountEmail === normalizedLower) ||
      (normalizedLower && accountProfileId === normalizedLower)
    );
  }) || null;
}

// ---------------------------------------------------------------------------
// First-boot seed from profiles.js
// ---------------------------------------------------------------------------

function seedAccountsIfEmpty() {
  if (fs.existsSync(path.join(DATA_DIR, "accounts.json"))) return;
  let mockProfiles;
  try {
    delete require.cache[require.resolve("./profiles.js")];
    mockProfiles = require("./profiles.js");
  } catch (error) {
    console.warn("Could not load profiles.js for first-boot seeding:", error.message);
    return;
  }
  if (!Array.isArray(mockProfiles) || mockProfiles.length === 0) {
    saveStore("accounts.json", []);
    return;
  }

  const seeded = [];
  mockProfiles.forEach(mock => {
    const profileId = createProfileId(seeded, true);
    seeded.push({
      id: `seed-${mock.id}`,
      profileId,
      kind: "seed",
      name: mock.name,
      mobile: "",
      email: "",
      mobileVerified: false,
      passwordHash: "",
      createdAt: new Date().toISOString(),
      profile: {
        name: mock.name,
        gender: mock.gender,
        age: mock.age,
        height: mock.height,
        location: mock.location,
        profession: mock.profession,
        religion: mock.religion,
        sect: mock.sect,
        caste: mock.caste,
        subcaste: mock.subcaste,
        deity: mock.deity,
        spiritualPath: mock.spiritualPath,
        diet: mock.diet,
        sadhana: mock.sadhana,
        bio: mock.bio,
        avatarColor: mock.avatarColor,
        hobbies: mock.hobbies,
        chatGreeting: mock.chatGreeting,
        chatResponses: mock.chatResponses
      }
    });
  });
  saveStore("accounts.json", seeded);
  console.log(`Seeded ${seeded.length} sample profiles into accounts.json.`);
}

// ---------------------------------------------------------------------------
// Session resolution
// ---------------------------------------------------------------------------

function resolveSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  const accountId = verifySessionToken(token);
  if (!accountId) return null;
  const account = loadAccountsRaw().find(a => a.id === accountId);
  if (!account || account.kind === "seed") return null;
  return account;
}

function requireSession(req, res) {
  const account = resolveSession(req);
  if (!account) {
    sendJson(res, 401, { ok: false, error: "Not authenticated" });
    return null;
  }
  return account;
}

// ---------------------------------------------------------------------------
// Connections + messages
// ---------------------------------------------------------------------------

function loadConnections() {
  return loadStore("connections.json", []);
}

function loadMessages() {
  return loadStore("messages.json", []);
}

function findConnectionBetween(connections, a, b) {
  return connections.find(c =>
    (c.from === a && c.to === b) || (c.from === b && c.to === a)
  );
}

function activeConnectionBetween(connections, a, b) {
  return connections.find(c =>
    ((c.from === a && c.to === b) || (c.from === b && c.to === a)) &&
    (c.status === "pending" || c.status === "accepted")
  );
}

function pairKey(a, b) {
  return [a, b].sort();
}

function pairMatches(msg, a, b) {
  if (!Array.isArray(msg.pair) || msg.pair.length !== 2) return false;
  const [x, y] = pairKey(a, b);
  return msg.pair[0] === x && msg.pair[1] === y;
}

// Auto-accept connection where target is a seed bot
async function autoAcceptConnection(connectionId) {
  await mutateStore("connections.json", [], conns => {
    const conn = conns.find(c => c.id === connectionId);
    if (!conn || conn.status !== "pending") return;
    conn.status = "accepted";
    conn.resolvedAt = new Date().toISOString();
  });
}

// Append bot reply to a message
async function appendBotReply(botProfileId, userProfileId, userText) {
  const accounts = loadAccountsRaw();
  const bot = accounts.find(a => a.profileId === botProfileId && a.kind === "seed");
  if (!bot || !bot.profile) return;
  const responses = Array.isArray(bot.profile.chatResponses) ? bot.profile.chatResponses : [];

  const lowerText = String(userText || "").toLowerCase();
  let replyText = "";
  if (lowerText.includes("sadhana") || lowerText.includes("meditation") || lowerText.includes("practice") || lowerText.includes("pray")) {
    replyText = `Regarding my spiritual schedule: ${bot.profile.sadhana} I believe staying dedicated to these practices is highly grounding.`;
  } else if (lowerText.includes("diet") || lowerText.includes("food") || lowerText.includes("eat")) {
    replyText = `Regarding my diet, I strictly follow: ${bot.profile.diet}. Having a clean, pure body supports a pure spiritual mind!`;
  } else if (lowerText.includes("guru") || lowerText.includes("deity") || lowerText.includes("god")) {
    replyText = `I draw deep daily inspiration from ${bot.profile.deity}. The path of ${bot.profile.spiritualPath} has opened my eyes to this connection.`;
  } else if (responses.length > 0) {
    replyText = responses[Math.floor(Math.random() * responses.length)];
  } else {
    replyText = "Hare Krishna! Wonderful to hear from you on this conscious journey.";
  }

  await mutateStore("messages.json", [], messages => {
    messages.push({
      id: `msg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      pair: pairKey(botProfileId, userProfileId),
      sender: botProfileId,
      text: replyText,
      createdAt: new Date().toISOString()
    });
  });
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

async function handleSignup(req, res) {
  const body = await readJsonBody(req);
  const name = trimStr(body.name, 80);
  const mobile = normalizeMobile(body.mobile);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (name.length < 2) return sendJson(res, 400, { ok: false, error: "Please enter your full name." });
  if (!isValidMobile(mobile)) return sendJson(res, 400, { ok: false, error: "Enter a valid mobile number (10-15 digits)." });
  if (!isValidEmail(email)) return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
  if (!isValidPassword(password)) return sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters." });

  let createdAccount;
  let conflictMessage = null;
  await mutateStore("accounts.json", [], accounts => {
    const duplicate = accounts.find(a =>
      a.kind !== "seed" && (normalizeMobile(a.mobile) === mobile || normalizeEmail(a.email) === email)
    );
    if (duplicate) {
      conflictMessage = "An account already exists for this mobile or email. Please sign in.";
      return;
    }
    const profileId = createProfileId(accounts, false);
    createdAccount = {
      id: makeAccountId(),
      profileId,
      kind: "real",
      name,
      mobile,
      email,
      mobileVerified: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      profile: null
    };
    accounts.push(createdAccount);
  });

  if (conflictMessage) {
    return sendJson(res, 409, { ok: false, error: conflictMessage });
  }
  if (!createdAccount) {
    return sendJson(res, 500, { ok: false, error: "Failed to create account." });
  }

  setSessionCookie(res, signSession(createdAccount.id));
  sendJson(res, 201, { ok: true, account: publicAccount(createdAccount) });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const identifier = trimStr(body.identifier, 120);
  const password = String(body.password || "");
  const remember = body.remember !== false;

  if (!identifier || !password) {
    return sendJson(res, 400, { ok: false, error: "Enter your login ID and password." });
  }

  const accounts = loadAccountsRaw();
  const account = findAccountByIdentifier(accounts, identifier);
  if (!account || account.kind === "seed" || !verifyPassword(password, account.passwordHash)) {
    return sendJson(res, 401, { ok: false, error: "Login failed. Check your mobile, email or profile ID and password." });
  }

  setSessionCookie(res, signSession(account.id), remember ? SESSION_TTL_MS : 12 * 60 * 60 * 1000);
  sendJson(res, 200, { ok: true, account: publicAccount(account) });
}

function handleLogout(req, res) {
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

function handleMe(req, res) {
  const account = resolveSession(req);
  if (!account) return sendJson(res, 401, { ok: false, error: "Not authenticated" });
  sendJson(res, 200, { ok: true, account: publicAccount(account) });
}

async function handleSaveProfile(req, res) {
  const account = requireSession(req, res);
  if (!account) return;

  const body = await readJsonBody(req);
  const profile = {
    name: trimStr(body.name, 80),
    gender: trimStr(body.gender, 20),
    age: Number(body.age) || 0,
    height: trimStr(body.height, 20),
    location: trimStr(body.location, 120),
    profession: trimStr(body.profession, 120),
    religion: trimStr(body.religion, 60),
    sect: trimStr(body.sect, 60),
    caste: trimStr(body.caste, 60),
    subcaste: trimStr(body.subcaste, 60) || "N/A",
    deity: trimStr(body.deity, 60),
    spiritualPath: trimStr(body.spiritualPath, 120),
    diet: trimStr(body.diet, 120),
    sadhana: trimStr(body.sadhana, 800),
    bio: trimStr(body.bio, 1200),
    avatarColor: trimStr(body.avatarColor, 80) || "from-amber-500 to-orange-600",
    hobbies: Array.isArray(body.hobbies)
      ? body.hobbies.map(h => trimStr(h, 40)).filter(Boolean).slice(0, 12)
      : []
  };

  if (!profile.name || !profile.gender || !profile.age || !profile.religion || !profile.diet) {
    return sendJson(res, 400, { ok: false, error: "Please complete the required spiritual profile fields." });
  }
  if (profile.age < 18 || profile.age > 90) {
    return sendJson(res, 400, { ok: false, error: "Age must be between 18 and 90." });
  }

  let updated;
  await mutateStore("accounts.json", [], accounts => {
    const target = accounts.find(a => a.id === account.id);
    if (!target) return;
    target.profile = profile;
    target.name = profile.name;
    updated = target;
  });

  if (!updated) return sendJson(res, 404, { ok: false, error: "Account not found." });
  sendJson(res, 200, { ok: true, account: publicAccount(updated) });
}

function handleListProfiles(req, res, url) {
  const account = requireSession(req, res);
  if (!account) return;

  const filters = {
    gender: trimStr(url.searchParams.get("gender") || "all", 20),
    religion: trimStr(url.searchParams.get("religion") || "all", 60),
    path: trimStr(url.searchParams.get("path") || "all", 120),
    diet: trimStr(url.searchParams.get("diet") || "all", 120),
    caste: trimStr(url.searchParams.get("caste") || "all", 60)
  };

  const accounts = loadAccountsRaw();
  const profiles = accounts
    .filter(a => a.profileId !== account.profileId && a.profile)
    .map(feedProfile)
    .filter(p => {
      if (filters.gender !== "all" && p.gender !== filters.gender) return false;
      if (filters.religion !== "all" && p.religion !== filters.religion) return false;
      if (filters.path !== "all" && !String(p.spiritualPath).toLowerCase().includes(filters.path.toLowerCase())) return false;
      if (filters.diet !== "all" && !String(p.diet).toLowerCase().includes(filters.diet.toLowerCase())) return false;
      if (filters.caste !== "all" && !String(p.caste).toLowerCase().includes(filters.caste.toLowerCase())) return false;
      return true;
    });

  sendJson(res, 200, { ok: true, profiles });
}

function shapeConnection(conn, peers) {
  const peer = peers[conn.from === conn._meta_me ? conn.to : conn.from];
  return {
    id: conn.id,
    from: conn.from,
    to: conn.to,
    status: conn.status,
    createdAt: conn.createdAt,
    resolvedAt: conn.resolvedAt || null,
    peer: peer || null
  };
}

function handleListConnections(req, res) {
  const account = requireSession(req, res);
  if (!account) return;

  const connections = loadConnections();
  const accounts = loadAccountsRaw();
  const me = account.profileId;
  const peersById = {};
  accounts.forEach(a => { peersById[a.profileId] = feedProfile(a); });

  const incoming = [];
  const sent = [];
  const matched = [];
  connections.forEach(c => {
    if (c.from !== me && c.to !== me) return;
    const shaped = {
      id: c.id,
      from: c.from,
      to: c.to,
      status: c.status,
      createdAt: c.createdAt,
      resolvedAt: c.resolvedAt || null,
      peer: peersById[c.from === me ? c.to : c.from] || null
    };
    if (c.status === "accepted") matched.push(shaped);
    else if (c.status === "pending" && c.to === me) incoming.push(shaped);
    else if (c.status === "pending" && c.from === me) sent.push(shaped);
  });

  sendJson(res, 200, { ok: true, incoming, sent, matched });
}

async function handleConnectionRequest(req, res) {
  const account = requireSession(req, res);
  if (!account) return;
  const body = await readJsonBody(req);
  const toProfileId = trimStr(body.toProfileId, 40);
  if (!toProfileId) return sendJson(res, 400, { ok: false, error: "Missing target profileId." });
  if (toProfileId === account.profileId) return sendJson(res, 400, { ok: false, error: "Cannot send a request to yourself." });

  const accounts = loadAccountsRaw();
  const target = accounts.find(a => a.profileId === toProfileId);
  if (!target || !target.profile) return sendJson(res, 404, { ok: false, error: "Profile not found." });

  let createdConnection;
  let conflictMessage = null;
  await mutateStore("connections.json", [], conns => {
    const existing = activeConnectionBetween(conns, account.profileId, toProfileId);
    if (existing) {
      conflictMessage = existing.status === "accepted"
        ? "You are already connected with this member."
        : "A connection request is already pending between you two.";
      return;
    }
    createdConnection = {
      id: `conn-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      from: account.profileId,
      to: toProfileId,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null
    };
    conns.push(createdConnection);
  });

  if (conflictMessage) return sendJson(res, 409, { ok: false, error: conflictMessage });
  if (!createdConnection) return sendJson(res, 500, { ok: false, error: "Failed to create request." });

  if (target.kind === "seed") {
    setTimeout(() => {
      autoAcceptConnection(createdConnection.id).catch(err => console.warn("Bot auto-accept failed:", err.message));
    }, BOT_ACCEPT_DELAY_MS);
  }

  sendJson(res, 201, { ok: true, connection: createdConnection });
}

async function handleConnectionAction(req, res, connectionId, action) {
  const account = requireSession(req, res);
  if (!account) return;

  let outcome;
  let errorMessage = null;
  await mutateStore("connections.json", [], conns => {
    const conn = conns.find(c => c.id === connectionId);
    if (!conn) { errorMessage = "Connection not found."; return; }
    if (conn.status !== "pending") { errorMessage = "Request is no longer pending."; return; }

    if (action === "accept") {
      if (conn.to !== account.profileId) { errorMessage = "Only the recipient can accept this request."; return; }
      conn.status = "accepted";
      conn.resolvedAt = new Date().toISOString();
    } else if (action === "decline") {
      if (conn.to !== account.profileId) { errorMessage = "Only the recipient can decline this request."; return; }
      conn.status = "declined";
      conn.resolvedAt = new Date().toISOString();
    } else if (action === "withdraw") {
      if (conn.from !== account.profileId) { errorMessage = "Only the sender can withdraw this request."; return; }
      conn.status = "withdrawn";
      conn.resolvedAt = new Date().toISOString();
    } else {
      errorMessage = "Unknown action.";
      return;
    }
    outcome = { ...conn };
  });

  if (errorMessage) {
    const code = errorMessage.includes("not found") ? 404 : 400;
    return sendJson(res, code, { ok: false, error: errorMessage });
  }
  sendJson(res, 200, { ok: true, connection: outcome });
}

function handleListMessages(req, res, peerProfileId, url) {
  const account = requireSession(req, res);
  if (!account) return;

  const connections = loadConnections();
  const matched = connections.find(c =>
    c.status === "accepted" &&
    ((c.from === account.profileId && c.to === peerProfileId) ||
     (c.to === account.profileId && c.from === peerProfileId))
  );
  if (!matched) return sendJson(res, 403, { ok: false, error: "Chat is locked until both sides match." });

  const messages = loadMessages().filter(m => pairMatches(m, account.profileId, peerProfileId));
  const since = trimStr(url.searchParams.get("since") || "", 80);
  const filtered = since
    ? (() => {
        const idx = messages.findIndex(m => m.id === since);
        return idx >= 0 ? messages.slice(idx + 1) : messages;
      })()
    : messages;

  sendJson(res, 200, { ok: true, messages: filtered });
}

async function handlePostMessage(req, res, peerProfileId) {
  const account = requireSession(req, res);
  if (!account) return;
  const body = await readJsonBody(req);
  const text = trimStr(body.text, 1500);
  if (!text) return sendJson(res, 400, { ok: false, error: "Message cannot be empty." });

  const connections = loadConnections();
  const matched = connections.find(c =>
    c.status === "accepted" &&
    ((c.from === account.profileId && c.to === peerProfileId) ||
     (c.to === account.profileId && c.from === peerProfileId))
  );
  if (!matched) return sendJson(res, 403, { ok: false, error: "Chat is locked until both sides match." });

  const accounts = loadAccountsRaw();
  const peer = accounts.find(a => a.profileId === peerProfileId);
  if (!peer) return sendJson(res, 404, { ok: false, error: "Peer not found." });

  let created;
  await mutateStore("messages.json", [], messages => {
    created = {
      id: `msg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      pair: pairKey(account.profileId, peerProfileId),
      sender: account.profileId,
      text,
      createdAt: new Date().toISOString()
    };
    messages.push(created);
  });

  if (peer.kind === "seed") {
    setTimeout(() => {
      appendBotReply(peerProfileId, account.profileId, text).catch(err =>
        console.warn("Bot reply failed:", err.message)
      );
    }, BOT_REPLY_DELAY_MS);
  }

  sendJson(res, 201, { ok: true, message: created });
}

// ---------------------------------------------------------------------------
// Admin: manage member accounts
// ---------------------------------------------------------------------------

function handleAdminListAccounts(req, res) {
  if (!requireAdmin(req, res)) return;
  const accounts = loadAccountsRaw().map(a => ({
    ...publicAccount(a),
    hasPassword: Boolean(a.passwordHash)
  }));
  sendJson(res, 200, { ok: true, accounts });
}

function handleAdminGetAccount(req, res, accountId) {
  if (!requireAdmin(req, res)) return;
  const account = loadAccountsRaw().find(a => a.id === accountId || a.profileId === accountId);
  if (!account) return sendJson(res, 404, { ok: false, error: "Account not found." });
  sendJson(res, 200, { ok: true, account: publicAccount(account) });
}

async function handleAdminDeleteAccount(req, res, accountId) {
  if (!requireAdmin(req, res)) return;

  let removedProfileId = null;
  await mutateStore("accounts.json", [], accounts => {
    const idx = accounts.findIndex(a => a.id === accountId || a.profileId === accountId);
    if (idx < 0) return;
    removedProfileId = accounts[idx].profileId;
    accounts.splice(idx, 1);
  });

  if (!removedProfileId) return sendJson(res, 404, { ok: false, error: "Account not found." });

  await mutateStore("connections.json", [], conns => {
    for (let i = conns.length - 1; i >= 0; i--) {
      if (conns[i].from === removedProfileId || conns[i].to === removedProfileId) conns.splice(i, 1);
    }
  });
  await mutateStore("messages.json", [], messages => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (Array.isArray(messages[i].pair) && messages[i].pair.includes(removedProfileId)) messages.splice(i, 1);
    }
  });

  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Admin Basic Auth (existing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API dispatch
// ---------------------------------------------------------------------------

async function handleApi(req, res, pathname, url) {
  if (pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, 200, getPublicSettings());
    return true;
  }

  // Auth + session
  if (pathname === "/api/auth/signup" && req.method === "POST") {
    await handleSignup(req, res);
    return true;
  }
  if (pathname === "/api/auth/login" && req.method === "POST") {
    await handleLogin(req, res);
    return true;
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    handleLogout(req, res);
    return true;
  }
  if (pathname === "/api/me" && req.method === "GET") {
    handleMe(req, res);
    return true;
  }
  if (pathname === "/api/me/profile" && (req.method === "PUT" || req.method === "POST")) {
    await handleSaveProfile(req, res);
    return true;
  }

  // Profile feed
  if (pathname === "/api/profiles" && req.method === "GET") {
    handleListProfiles(req, res, url);
    return true;
  }

  // Connections
  if (pathname === "/api/connections" && req.method === "GET") {
    handleListConnections(req, res);
    return true;
  }
  if (pathname === "/api/connections/request" && req.method === "POST") {
    await handleConnectionRequest(req, res);
    return true;
  }
  const connActionMatch = pathname.match(/^\/api\/connections\/([\w-]+)\/(accept|decline|withdraw)$/);
  if (connActionMatch && req.method === "POST") {
    await handleConnectionAction(req, res, connActionMatch[1], connActionMatch[2]);
    return true;
  }

  // Messages
  const msgMatch = pathname.match(/^\/api\/messages\/([\w-]+)$/);
  if (msgMatch) {
    const peerProfileId = msgMatch[1];
    if (req.method === "GET") {
      handleListMessages(req, res, peerProfileId, url);
      return true;
    }
    if (req.method === "POST") {
      await handlePostMessage(req, res, peerProfileId);
      return true;
    }
  }

  // Admin settings (existing)
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

  // Admin members
  if (pathname === "/api/admin/accounts" && req.method === "GET") {
    handleAdminListAccounts(req, res);
    return true;
  }
  const adminAcctMatch = pathname.match(/^\/api\/admin\/accounts\/([\w-]+)$/);
  if (adminAcctMatch) {
    if (req.method === "GET") {
      handleAdminGetAccount(req, res, adminAcctMatch[1]);
      return true;
    }
    if (req.method === "DELETE") {
      await handleAdminDeleteAccount(req, res, adminAcctMatch[1]);
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

function resolveStaticPath(requestPath) {
  let normalizedPath = decodeURIComponent(requestPath);
  if (normalizedPath === "/") normalizedPath = "/index.html";
  if (normalizedPath === "/admin" || normalizedPath === "/admin/") normalizedPath = "/admin.html";
  const filePath = path.normalize(path.join(ROOT_DIR, normalizedPath));
  if (!filePath.startsWith(ROOT_DIR)) return null;
  return filePath;
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
  const headers = { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" };
  if (!isAdmin && [".css", ".jpg", ".jpeg", ".png", ".svg", ".ico"].includes(ext)) {
    headers["Cache-Control"] = "public, max-age=86400";
  } else if (!isAdmin && ext === ".js") {
    headers["Cache-Control"] = "no-cache";
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

seedAccountsIfEmpty();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      sendText(res, 200, "ok\n");
      return;
    }

    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, pathname, url);
      if (!handled) sendJson(res, 404, { ok: false, error: "Unknown API endpoint." });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    if (error && error.statusCode === 400) {
      sendJson(res, 400, { ok: false, error: error.message });
    } else {
      console.error("Request handler error:", error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Internal server error." });
    }
  }
});

server.listen(PORT, () => {
  if (!ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD is not set. /admin will stay disabled until it is configured.");
  }
  console.log(`SpiritualShaadi server listening on port ${PORT}`);
});
