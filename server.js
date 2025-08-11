/**
 * SQLite Leaderboard API (Node/Express)
 * -------------------------------------
 * A tiny REST backend for your HTML game.
 *
 * Features
 * - POST /api/scores : submit scores (per-player + optional team row)
 * - GET  /api/leaderboard : fetch top scores (player or team)
 * - GET  /api/health : liveness check
 * - SQLite schema auto-migrates on start
 * - Optional bearer token auth for POST (set API_TOKEN)
 * - Basic IP rate-limit + duplicate protection
 * - CORS enabled (so your static site can call it directly)
 *
 * Quick start
 *   npm init -y
 *   npm i express cors better-sqlite3
 *   node server.js
 *
 * Env vars (optional)
 *   PORT=8787               # server port
 *   DB_FILE=./leaderboard.sqlite
 *   API_TOKEN=secret123     # if set, require Authorization: Bearer secret123 on POST
 *   CORS_ORIGIN=*           # override CORS origin; default "*"
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const DB_FILE = process.env.DB_FILE || './leaderboard.sqlite';
const API_TOKEN = process.env.API_TOKEN || null; // if set, require bearer for POST
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cors({ origin: CORS_ORIGIN }));

// ---------- SQLite setup ----------
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gameId TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  isTeam INTEGER NOT NULL DEFAULT 0,
  mode INTEGER,
  wave INTEGER,
  timestamp INTEGER NOT NULL,
  ip TEXT,
  fingerprint TEXT, -- dedupe key
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(gameId, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_game_time ON scores(gameId, timestamp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_unique ON scores(gameId, name, score, isTeam, mode, wave, timestamp);
`);

const insertScore = db.prepare(`
  INSERT OR IGNORE INTO scores
  (gameId, name, score, isTeam, mode, wave, timestamp, ip, fingerprint, createdAt)
  VALUES (@gameId, @name, @score, @isTeam, @mode, @wave, @timestamp, @ip, @fingerprint, @createdAt)
`);

const selectTop = db.prepare(`
  SELECT name, score, mode, wave, timestamp
  FROM scores
  WHERE gameId = @gameId
    AND isTeam = @isTeam
    AND (@mode IS NULL OR mode = @mode)
    AND (@since IS NULL OR timestamp >= @since)
  ORDER BY score DESC, timestamp DESC
  LIMIT @limit
`);

// ---------- helpers ----------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const now = () => Date.now();
const ipOf = req => (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex');

function requireAuthIfConfigured(req, res) {
  if (!API_TOKEN) return true;
  const h = req.headers['authorization'] || '';
  const ok = h.startsWith('Bearer ') && h.slice(7) === API_TOKEN;
  if (!ok) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

// super-minimal validation to avoid extra deps
function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function validateSubmit(body) {
  if (!isPlainObject(body)) return 'body must be an object';
  const { gameId, players, team, mode, wave, timestamp } = body;
  if (!gameId || typeof gameId !== 'string') return 'gameId required';
  if (!Array.isArray(players) || players.length === 0) return 'players[] required';
  for (const p of players) {
    if (!p || typeof p.name !== 'string') return 'player.name required';
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) return 'player.score must be number';
  }
  if (timestamp != null && !Number.isFinite(timestamp)) return 'timestamp must be number if provided';
  if (mode != null && !Number.isInteger(mode)) return 'mode must be integer if provided';
  if (wave != null && !Number.isInteger(wave)) return 'wave must be integer if provided';
  if (team != null && typeof team !== 'number') return 'team must be number if provided';
  return null;
}

// in-memory rate-limit (best-effort)
const lastByIp = new Map();
function rateLimit(req, res, windowMs = 2000) {
  const ip = ipOf(req);
  const t = now();
  const last = lastByIp.get(ip) || 0;
  if (t - last < windowMs) {
    res.status(429).json({ ok: false, error: 'rate_limited' });
    return false;
  }
  lastByIp.set(ip, t);
  return true;
}

// ---------- routes ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/scores', (req, res) => {
  if (!requireAuthIfConfigured(req, res)) return;
  if (!rateLimit(req, res)) return;

  const err = validateSubmit(req.body);
  if (err) return res.status(400).json({ ok: false, error: err });

  const { gameId } = req.body;
  const players = req.body.players.map(p => ({
    name: String(p.name || '匿名').slice(0, 40).trim() || '匿名',
    score: Math.round(Number(p.score) || 0)
  }));
  const mode = Number.isInteger(req.body.mode) ? req.body.mode : null;
  const wave = Number.isInteger(req.body.wave) ? req.body.wave : null;
  const timestamp = Number.isFinite(req.body.timestamp) ? req.body.timestamp : now();
  const ip = ipOf(req);

  // derive team name (optional)
  const teamScore = Number.isFinite(req.body.team) ? Math.round(req.body.team) : null;
  const teamName = players.map(p => p.name).filter(Boolean).slice(0, 2).join(' & ').slice(0, 60) || 'TEAM';

  const createdAt = now();

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const p of players) {
      const fp = hash(`${gameId}\n${p.name}\n${p.score}\n0\n${mode}\n${wave}\n${timestamp}`);
      inserted += insertScore.run({ gameId, name: p.name, score: p.score, isTeam: 0, mode, wave, timestamp, ip, fingerprint: fp, createdAt }).changes;
    }
    if (teamScore != null) {
      const fpTeam = hash(`${gameId}\n${teamName}\n${teamScore}\n1\n${mode}\n${wave}\n${timestamp}`);
      inserted += insertScore.run({ gameId, name: teamName, score: teamScore, isTeam: 1, mode, wave, timestamp, ip, fingerprint: fpTeam, createdAt }).changes;
    }
  });

  try { tx(); } catch (e) {
    console.error('insert failed', e);
    return res.status(500).json({ ok: false, error: 'db_insert_failed' });
  }

  res.json({ ok: true, inserted });
});

app.get('/api/leaderboard', (req, res) => {
  const gameId = req.query.gameId;
  if (!gameId) return res.status(400).json({ ok: false, error: 'gameId required' });
  const limit = clamp(parseInt(req.query.limit || '10', 10) || 10, 1, 100);
  const type = (req.query.type || 'player').toLowerCase();
  const isTeam = type === 'team' ? 1 : 0;
  const mode = req.query.mode != null ? parseInt(req.query.mode, 10) : null;
  const sinceDays = req.query.sinceDays != null ? parseInt(req.query.sinceDays, 10) : null;
  const since = sinceDays != null ? (now() - Math.max(0, sinceDays) * 24 * 60 * 60 * 1000) : null;

  try {
    const rows = selectTop.all({ gameId, isTeam, mode, since, limit });
    res.json({ ok: true, leaderboard: rows });
  } catch (e) {
    console.error('select failed', e);
    res.status(500).json({ ok: false, error: 'db_select_failed' });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`SQLite Leaderboard API listening on http://localhost:${PORT}`);
});
