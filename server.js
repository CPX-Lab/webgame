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
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8787;
const API_TOKEN = process.env.API_TOKEN;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 2000; // 2 seconds

// Database setup
const db = new Database('leaderboard.sqlite');

// Auto-migrate schema
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    isTeam INTEGER DEFAULT 0,
    mode INTEGER,
    wave INTEGER,
    timestamp INTEGER NOT NULL,
    ip TEXT,
    fingerprint TEXT NOT NULL,
    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_game_score ON scores(gameId, score DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dedupe ON scores(gameId, name, score, isTeam, mode, wave, timestamp);
`);

// Helper functions
function createFingerprint(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function isRateLimited(ip) {
  const now = Date.now();
  const userRateLimit = rateLimit.get(ip);
  
  if (!userRateLimit) {
    rateLimit.set(ip, now);
    return false;
  }
  
  if (now - userRateLimit < RATE_LIMIT_WINDOW) {
    return true;
  }
  
  rateLimit.set(ip, now);
  return false;
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!API_TOKEN) return next();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }
  
  const token = authHeader.substring(7);
  if (token !== API_TOKEN) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  next();
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.post('/api/scores', requireAuth, (req, res) => {
  try {
    const { gameId, players, team, mode, wave, timestamp } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (!gameId || !players || !Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Rate limited' });
    }
    
    const now = timestamp || Date.now();
    const inserted = [];
    
    // Insert individual player scores
    for (const player of players) {
      if (!player.name || typeof player.score !== 'number') continue;
      
      const fingerprint = createFingerprint({
        gameId, name: player.name, score: player.score, isTeam: 0,
        mode, wave, timestamp: now, ip
      });
      
      try {
        const stmt = db.prepare(`
          INSERT INTO scores (gameId, name, score, isTeam, mode, wave, timestamp, ip, fingerprint)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(gameId, player.name, player.score, 0, mode, wave, now, ip, fingerprint);
        inserted.push({ name: player.name, score: player.score, id: result.lastInsertRowid });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
    
    // Insert team score if provided
    if (team && typeof team === 'number') {
      const teamFingerprint = createFingerprint({
        gameId, name: 'TEAM', score: team, isTeam: 1,
        mode, wave, timestamp: now, ip
      });
      
      try {
        const stmt = db.prepare(`
          INSERT INTO scores (gameId, name, score, isTeam, mode, wave, timestamp, ip, fingerprint)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(gameId, 'TEAM', team, 1, mode, wave, now, ip, teamFingerprint);
        inserted.push({ name: 'TEAM', score: team, id: result.lastInsertRowid });
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
    
    res.json({ ok: true, inserted });
  } catch (error) {
    console.error('Error submitting scores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const { gameId, limit = 10, type = 'player', mode, sinceDays } = req.query;
    
    if (!gameId) {
      return res.status(400).json({ error: 'gameId required' });
    }
    
    let query = `
      SELECT name, score, mode, wave, timestamp, isTeam
      FROM scores 
      WHERE gameId = ? AND isTeam = ?
    `;
    
    const params = [gameId, type === 'team' ? 1 : 0];
    
    if (mode !== undefined && mode !== '') {
      query += ' AND mode = ?';
      params.push(parseInt(mode));
    }
    
    if (sinceDays) {
      const sinceTimestamp = Date.now() - (parseInt(sinceDays) * 24 * 60 * 60 * 1000);
      query += ' AND timestamp >= ?';
      params.push(sinceTimestamp);
    }
    
    query += ' ORDER BY score DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const stmt = db.prepare(query);
    const leaderboard = stmt.all(...params);
    
    res.json({ 
      ok: true, 
      leaderboard: leaderboard.map(row => ({
        name: row.name,
        score: row.score,
        mode: row.mode,
        wave: row.wave,
        timestamp: row.timestamp
      }))
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve index_multiplayer.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index_multiplayer.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Multiplayer game state
const multiplayerState = {
  rooms: new Map(),
  players: new Map()
};

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const playerId = crypto.randomBytes(8).toString('hex');
  const ip = req.socket.remoteAddress;
  
  console.log(`Player connected: ${playerId} from ${ip}`);
  
  // Store player connection
  multiplayerState.players.set(playerId, {
    ws,
    id: playerId,
    ip,
    roomId: null,
    playerIndex: null,
    lastUpdate: Date.now()
  });
  
  // Send player their ID
  ws.send(JSON.stringify({
    type: 'playerId',
    playerId: playerId
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(playerId, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    handlePlayerDisconnect(playerId);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${playerId}:`, error);
    handlePlayerDisconnect(playerId);
  });
});

function handleWebSocketMessage(playerId, data) {
  const player = multiplayerState.players.get(playerId);
  if (!player) return;
  
  switch (data.type) {
    case 'joinRoom':
      handleJoinRoom(playerId, data.roomId);
      break;
    case 'createRoom':
      handleCreateRoom(playerId);
      break;
    case 'playerInput':
      handlePlayerInput(playerId, data.input);
      break;
    case 'gameState':
      handleGameState(playerId, data.state);
      break;
    case 'requestGameStart':
      handleGameStartRequest(playerId, data.roomId);
      break;
    case 'playerReady':
      handlePlayerReady(playerId, data.ready);
      break;
    case 'startRLAgent':
      console.log('Starting RL agent for room:', data.roomId);
      // Start the Python RL agent script
      const { spawn } = require('child_process');
      const pythonProcess = spawn('python', ['public/train_agent.py'], {
          cwd: __dirname,
          stdio: 'inherit'
      });
      
      pythonProcess.on('error', (error) => {
          console.error('Failed to start RL agent:', error);
      });
      
      pythonProcess.on('exit', (code) => {
          console.log('RL agent process exited with code:', code);
      });
      break;

  }
}

function handleJoinRoom(playerId, roomId) {
  const player = multiplayerState.players.get(playerId);
  if (!player) return;
  
  let room = multiplayerState.rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      players: new Map(),
      gameState: null,
      lastUpdate: Date.now(),
      readyPlayers: new Set(),
      gameStarted: false
    };
    multiplayerState.rooms.set(roomId, room);
  }
  
  // Assign player to room
  player.roomId = roomId;
  player.playerIndex = room.players.size;
  room.players.set(playerId, player);
  
  // Notify all players in room
  broadcastToRoom(roomId, {
    type: 'playerJoined',
    playerId: playerId,
    playerIndex: player.playerIndex,
    totalPlayers: room.players.size
  });
  
  console.log(`Player ${playerId} joined room ${roomId} as player ${player.playerIndex}`);
}

function handleCreateRoom(playerId) {
  const roomId = crypto.randomBytes(4).toString('hex');
  handleJoinRoom(playerId, roomId);
}

function handlePlayerInput(playerId, input) {
  const player = multiplayerState.players.get(playerId);
  if (!player || !player.roomId) return;
  
  const room = multiplayerState.rooms.get(player.roomId);
  if (!room) return;
  
  // Broadcast input to other players in room
  broadcastToRoom(player.roomId, {
    type: 'playerInput',
    playerId: playerId,
    playerIndex: player.playerIndex,
    input: input
  }, playerId); // Exclude sender
}

function handleGameState(playerId, state) {
  const player = multiplayerState.players.get(playerId);
  if (!player || !player.roomId) return;
  
  const room = multiplayerState.rooms.get(player.roomId);
  if (!room) return;
  
  // Update room game state
  room.gameState = state;
  room.lastUpdate = Date.now();
  
  // Broadcast to other players
  broadcastToRoom(player.roomId, {
    type: 'gameState',
    playerId: playerId,
    state: state
  }, playerId);
}

function handleGameStartRequest(playerId, roomId) {
  const player = multiplayerState.players.get(playerId);
  if (!player) return;
  
  const room = multiplayerState.rooms.get(roomId);
  if (!room) return;
  
  // Check if all players are ready
  if (room.readyPlayers.size < room.players.size) {
    // Notify the requesting player that not everyone is ready
    player.ws.send(JSON.stringify({
      type: 'gameStartDenied',
      reason: 'Not all players are ready'
    }));
    return;
  }
  
  // Mark room as started
  room.gameStarted = true;
  
  // Calculate synchronized start time (3 seconds from now)
  const startTime = Date.now() + 3000;
  
  // Notify all players in the room about the game start request with exact start time
  broadcastToRoom(roomId, {
    type: 'gameStartRequest',
    playerId: playerId,
    playerIndex: player.playerIndex,
    startTime: startTime
  });
  
  // Also send a final start signal at the exact time
  setTimeout(() => {
    broadcastToRoom(roomId, {
      type: 'gameStart',
      startTime: startTime
    });
    console.log(`Final game start signal sent for room ${roomId}`);
  }, 3000);
  
  console.log(`Game start scheduled for room ${roomId} at ${new Date(startTime).toISOString()}`);
}

function handlePlayerReady(playerId, ready) {
  const player = multiplayerState.players.get(playerId);
  if (!player || !player.roomId) return;
  
  const room = multiplayerState.rooms.get(player.roomId);
  if (!room) return;
  
  if (ready) {
    room.readyPlayers.add(playerId);
  } else {
    room.readyPlayers.delete(playerId);
  }
  
  // Broadcast ready status to all players in room
  broadcastToRoom(player.roomId, {
    type: 'playerReadyStatus',
    playerId: playerId,
    playerIndex: player.playerIndex,
    ready: ready,
    readyCount: room.readyPlayers.size,
    totalPlayers: room.players.size
  });
  
  console.log(`Player ${playerId} ${ready ? 'ready' : 'not ready'} (${room.readyPlayers.size}/${room.players.size})`);
}

function handlePlayerDisconnect(playerId) {
  const player = multiplayerState.players.get(playerId);
  if (!player) return;
  
  if (player.roomId) {
    const room = multiplayerState.rooms.get(player.roomId);
    if (room) {
      room.players.delete(playerId);
      
      // Notify other players
      broadcastToRoom(player.roomId, {
        type: 'playerLeft',
        playerId: playerId,
        playerIndex: player.playerIndex
      });
      
      // Clean up empty rooms
      if (room.players.size === 0) {
        multiplayerState.rooms.delete(player.roomId);
        console.log(`Room ${player.roomId} deleted (empty)`);
      }
    }
  }
  
  multiplayerState.players.delete(playerId);
  console.log(`Player ${playerId} disconnected`);
}

function broadcastToRoom(roomId, message, excludePlayerId = null) {
  const room = multiplayerState.rooms.get(roomId);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  room.players.forEach((player, playerId) => {
    if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(messageStr);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`SQLite Leaderboard API listening on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});





// API endpoints for game state and actions
// In your existing server.js, add these endpoints
app.get('/api/game/state', (req, res) => {
  res.json({
      players: gameState.players,
      enemies: gameState.enemies,
      bullets: gameState.bullets,
      score: gameState.score,
      wave: gameState.wave,
      running: gameState.running
  });
});

app.post('/api/game/action', (req, res) => {
  const { playerId, action } = req.body;
  
  if (playerId === 2 && gameState.players[1]) {
      // Apply AI action to Player 2
      applyAIAction(gameState.players[1], action);
  }
  
  res.json({ success: true });
});

function applyAIAction(player, action) {
  // Movement
  if (action.movement) {
      player.vx = action.movement[0] * 200;
      player.vy = action.movement[1] * 200;
  }
  
  // Actions
  if (action.shoot) player.shouldShoot = true;
  if (action.shield) player.shield = true;
  if (action.dash) player.shouldDash = true;
  if (action.ultimate) player.shouldUlt = true;
}