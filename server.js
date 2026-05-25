require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const session = require('express-session');
const bcrypt  = require('bcryptjs');

const MODEL = 'claude-opus-4-6';

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

app.use(session({
  secret: process.env.SESSION_SECRET || 'quizzicle-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(express.json());

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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password)
    return res.status(400).json({ error: 'Email, username, and password are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (username.trim().length < 2 || username.trim().length > 30)
    return res.status(400).json({ error: 'Username must be 2–30 characters.' });

  const users = loadUsers();
  if (users.find(u => u.email === email.toLowerCase() && u.provider === 'local'))
    return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const id   = 'user_' + crypto.randomUUID();
  users.push({ id, email: email.toLowerCase(), username: username.trim(), passwordHash: hash, provider: 'local', createdAt: Date.now() });
  saveUsers(users);

  const user = { id, email: email.toLowerCase(), name: username.trim(), picture: null, provider: 'local' };
  req.session.user = user;
  res.json({ user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const found = loadUsers().find(u => u.email === email.toLowerCase() && u.provider === 'local');
  if (!found) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, found.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  const user = { id: found.id, email: found.email, name: found.username, picture: null, provider: 'local' };
  req.session.user = user;
  res.json({ user });
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

app.post('/api/auth/google', (req, res) => {
  const { id, email, name, picture } = req.body;
  if (!id || !email) return res.status(400).json({ error: 'Missing user data.' });

  const users = loadUsers();
  const idx   = users.findIndex(u => u.id === id);
  let username = name;
  if (idx >= 0) {
    username = users[idx].username; // preserve any custom name the user set
    users[idx] = { ...users[idx], email, picture };
  } else {
    users.push({ id, email, username: name, picture, provider: 'google', createdAt: Date.now() });
  }
  saveUsers(users);

  const user = { id, email, name: username, picture, provider: 'google' };
  req.session.user = user;
  res.json({ user });
});

app.post('/api/auth/update-username', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { username } = req.body;
  if (!username || username.trim().length < 2 || username.trim().length > 30)
    return res.status(400).json({ error: 'Username must be 2–30 characters.' });

  const users = loadUsers();
  const i = users.findIndex(u => u.id === req.session.user.id);
  if (i >= 0) users[i].username = username.trim();
  saveUsers(users);

  req.session.user = { ...req.session.user, name: username.trim() };
  res.json({ user: req.session.user });
});

// ── AI routes ─────────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { problem, messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'No messages provided.' });

  const systemText = problem
    ? `You are a friendly, encouraging math tutor. The student is working on this problem:\n\n${problem}\n\nHelp them understand and solve it. Guide them step by step, explain concepts clearly, and keep responses concise.`
    : `You are a friendly math tutor. Help the student with their math questions.`;

  // Cache conversation history at the last assistant turn before the new user message
  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1);
  const messagesForApi = messages.map((m, i) => {
    if (i === lastAssistantIdx) {
      return { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] };
    }
    return { role: m.role, content: m.content };
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: messagesForApi,
    });
    res.json({ reply: response.content[0].text.trim() });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/extract-math', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const base64Image = req.file.buffer.toString('base64');
  const mediaType   = req.file.mimetype;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: 'You are a math tutor. Extract the math problem from the image and provide a completely accurate and detailed explanation on how to solve the problem' },
        ],
      }],
    });
    res.json({ mathProblem: response.content[0].text.trim() });
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-practice', async (req, res) => {
  const { recentProblems } = req.body;
  if (!recentProblems?.length) return res.status(400).json({ error: 'No problem history provided.' });

  const list = recentProblems.slice(0, 10).map((p, i) => `${i + 1}. ${p}`).join('\n');

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are a math tutor. A student has been working on these problems:\n${list}\n\nGenerate 3 new practice problems of similar type and difficulty. Each must have a single, unambiguous, and different numerical answer (integer or decimal with at most 2 decimal places) for each problem.\n\nRespond with ONLY a raw JSON array — no markdown, no extra text:\n[{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}]`,
      }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Model did not return a valid JSON array');
    res.json({ problems: JSON.parse(jsonMatch[0]) });
  } catch (err) {
    console.error('Practice generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
