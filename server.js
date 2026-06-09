require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is not set.');
  process.exit(1);
}

const express   = require('express');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const session   = require('express-session');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');
const { OAuth2Client } = require('google-auth-library');

const SOLVER_URL   = 'http://localhost:3001';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── User store (JSON file) ────────────────────────────────────────────────────
const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }));

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users || []; }
  catch { return []; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:              ["'self'"],
      scriptSrc:               ["'self'", 'https://accounts.google.com'],
      styleSrc:                ["'self'", "'unsafe-inline'"],
      imgSrc:                  ["'self'", 'data:', 'https://*.googleusercontent.com'],
      connectSrc:              ["'self'", 'https://accounts.google.com'],
      frameSrc:                ["'none'"],
      frameAncestors:          ["'none'"],
      objectSrc:               ["'none'"],
      baseUri:                 ["'self'"],
      formAction:              ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(express.json({ limit: '100kb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF, and WebP images are supported'));
  },
});

app.use(express.static(path.join(__dirname, 'dist')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// ── Solver proxy helper ───────────────────────────────────────────────────────

async function proxyToSolver(res, path, body) {
  try {
    const pyRes = await fetch(`${SOLVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await pyRes.json();
    if (!pyRes.ok) return res.status(pyRes.status).json(data);
    res.json(data);
  } catch (err) {
    console.error(`Solver proxy error (${path}):`, err.message);
    res.status(502).json({ error: 'Math solver service unavailable' });
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

const EMAIL_RE    = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const USERNAME_RE = /^[\w\-. ]{2,30}$/;

app.post('/api/auth/register', loginLimiter, async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password)
    return res.status(400).json({ error: 'Email, username, and password are required.' });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!USERNAME_RE.test(username.trim()))
    return res.status(400).json({ error: 'Username may only contain letters, numbers, spaces, hyphens, underscores, and periods (2–30 characters).' });

  const users = loadUsers();
  if (users.find(u => u.email === email.toLowerCase() && u.provider === 'local'))
    return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const id   = 'user_' + crypto.randomUUID();
  users.push({ id, email: email.toLowerCase(), username: username.trim(), passwordHash: hash, provider: 'local', createdAt: Date.now() });
  saveUsers(users);

  const user = { id, email: email.toLowerCase(), name: username.trim(), picture: null, provider: 'local' };
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.user = user;
    res.json({ user });
  });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });

  const found = loadUsers().find(u => u.email === email.toLowerCase() && u.provider === 'local');
  if (!found) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, found.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  const user = { id: found.id, email: found.email, name: found.username, picture: null, provider: 'local' };
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.user = user;
    res.json({ user });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (req.session?.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ user: null });
  }
});

app.post('/api/auth/google', loginLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential.' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google credential.' });
  }

  const id = 'google_' + payload.sub;
  const { email, name, picture } = payload;

  const users = loadUsers();
  const idx   = users.findIndex(u => u.id === id);
  let username = name;
  if (idx >= 0) {
    username = users[idx].username;
    users[idx] = { ...users[idx], email, picture };
  } else {
    users.push({ id, email, username: name, picture, provider: 'google', createdAt: Date.now() });
  }
  saveUsers(users);

  const user = { id, email, name: username, picture, provider: 'google' };
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error.' });
    req.session.user = user;
    res.json({ user });
  });
});

app.post('/api/auth/update-username', loginLimiter, (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { username } = req.body;
  if (!username || !USERNAME_RE.test(username.trim()))
    return res.status(400).json({ error: 'Username may only contain letters, numbers, spaces, hyphens, underscores, and periods (2–30 characters).' });

  const users = loadUsers();
  const i = users.findIndex(u => u.id === req.session.user.id);
  if (i >= 0) users[i].username = username.trim();
  saveUsers(users);

  req.session.user = { ...req.session.user, name: username.trim() };
  res.json({ user: req.session.user });
});

// ── AI routes (proxied to Python solver) ─────────────────────────────────────

app.post('/api/chat', requireAuth, async (req, res) => {
  await proxyToSolver(res, '/api/chat', req.body);
});

app.post('/api/extract-math', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  await proxyToSolver(res, '/api/extract-math', {
    image_base64: req.file.buffer.toString('base64'),
    media_type: req.file.mimetype,
  });
});

app.post('/api/generate-practice', requireAuth, async (req, res) => {
  await proxyToSolver(res, '/api/generate-practice', req.body);
});

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// ── SPA catch-all (must be after all API routes) ──────────────────────────────

app.get('*', (req, res) => {
  const index = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(503).send('Frontend not built — run: npm run build');
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quizzicle.ai running → http://localhost:${PORT}`);
});
