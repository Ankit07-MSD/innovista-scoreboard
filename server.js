const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---- CONFIG ----
// Change this before going live! Set it via environment variable in production:
//   ADMIN_KEY=yourSecretKey node server.js
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'state.json');

// ---- STATE ----
function defaultPlacementPoints(n) {
  // Standard Free Fire style booyah points table, extended with 1s beyond 10th
  const base = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(base[i] !== undefined ? base[i] : 1);
  return arr;
}
function defaultState() {
  return {
    teams: [],
    placementPoints: defaultPlacementPoints(12),
    lastElim: null,
    stageName: 'League Stage',
    groupName: 'Group A',
    qualifyCount: 0
  };
}

let state = defaultState();
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { /* ignore corrupt file, keep default */ }
}
state.stageName = state.stageName || 'League Stage';
state.groupName = state.groupName || 'Group A';
state.qualifyCount = Math.max(0, parseInt(state.qualifyCount, 10) || 0);
state.placementPoints = state.placementPoints || defaultPlacementPoints(Math.max(12, state.teams.length));
state.teams.forEach(t => { t.championRush = Boolean(t.championRush); });
let saveQueue = Promise.resolve();
function saveState() {
  const snapshot = JSON.stringify(state, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await fs.promises.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.promises.writeFile(STATE_FILE, snapshot);
  });
  return saveQueue;
}

function findTeam(id) { return state.teams.find(t => t.id === id); }

function computeTotal(t) {
  // Total shown live = points already banked from finished matches + this match's live points.
  let pts = (t.cumPoints || 0) + (t.kills || 0);
  if (t.position) {
    const v = state.placementPoints[t.position - 1];
    pts += (v !== undefined ? v : 1);
  }
  return pts;
}

// If only one team remains alive (not eliminated), auto-crown them Booyah / position 1
function checkBooyah() {
  const remaining = state.teams.filter(t => !t.eliminated);
  if (state.teams.length > 1 && remaining.length === 1 && !remaining[0].position) {
    remaining[0].position = 1;
    remaining[0].isWinner = true;
  }
}

function eliminateTeam(team) {
  if (!team || team.eliminated) return false;

  // If a previous match already had a winner and admin forgot to click
  // "End Match", auto-bank that finished match before starting this one.
  if (state.teams.some(x => x.isWinner)) rolloverMatch();

  const t = findTeam(team.id);
  if (!t || t.eliminated) return false;

  const alreadyEliminated = state.teams.filter(x => x.eliminated).length;
  t.eliminated = true;
  t.alive = 0;
  t.position = state.teams.length - alreadyEliminated; // reverse order placement
  state.lastElim = { name: t.name, position: t.position, ts: Date.now() };
  return true;
}

// Banks points from a finished match into cumulative totals, then clears per-match fields.
function rolloverMatch() {
  state.teams.forEach(t => {
    const matchPoints = (t.kills || 0) + (t.position ? (state.placementPoints[t.position - 1] ?? 1) : 0);
    t.cumPoints = (t.cumPoints || 0) + matchPoints;
    t.cumKills = (t.cumKills || 0) + (t.kills || 0);
    if (t.isWinner) t.boyahs = (t.boyahs || 0) + 1;
    t.matches = (t.matches || 0) + 1;
    t.kills = 0; t.alive = 4; t.eliminated = false; t.position = null; t.isWinner = false;
  });
  state.lastElim = null;
}

function stateWithTotals() {
  return {
    ...state,
    teams: state.teams.map(t => ({ ...t, total: computeTotal(t) }))
  };
}

function broadcast() {
  io.emit('state', stateWithTotals());
}

// ---- ADMIN ACTIONS ----
function handleAction(action, payload) {
  switch (action) {
    case 'addTeam': {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('Team name required');
      state.teams.push({
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
        name, alive: 4, kills: 0, eliminated: false, position: null, isWinner: false,
        // cumulative tournament-wide stats, carried across matches
        cumPoints: 0, cumKills: 0, boyahs: 0, matches: 0, championRush: false
      });
      while (state.placementPoints.length < state.teams.length) state.placementPoints.push(1);
      break;
    }
    case 'removeTeam':
      state.teams = state.teams.filter(t => t.id !== payload.id);
      break;
    case 'renameTeam': {
      const t = findTeam(payload.id);
      if (t) t.name = (payload.name || t.name).trim();
      break;
    }
    case 'updateMatchMeta': {
      state.stageName = String(payload.stageName || '').trim() || 'League Stage';
      state.groupName = String(payload.groupName || '').trim() || 'Group A';
      state.qualifyCount = Math.max(0, parseInt(payload.qualifyCount, 10) || 0);
      break;
    }
    case 'toggleChampionRush': {
      const t = findTeam(payload.id);
      if (t) t.championRush = Boolean(payload.value);
      break;
    }
    case 'adjustAlive': {
      const t = findTeam(payload.id);
      if (t) {
        t.alive = Math.max(0, Math.min(4, t.alive + payload.delta));
        if (t.alive === 0 && !t.eliminated) eliminateTeam(t);
      }
      break;
    }
    case 'addKill': {
      const t = findTeam(payload.id);
      if (t) t.kills = Math.max(0, (t.kills || 0) + payload.delta);
      break;
    }
    case 'eliminate': {
      const t = findTeam(payload.id);
      eliminateTeam(t);
      break;
    }
    case 'undoElim': {
      const t = findTeam(payload.id);
      if (t) { t.eliminated = false; t.position = null; t.isWinner = false; t.alive = t.alive || 4; }
      break;
    }
    case 'updatePlacementPoints': {
      const idx = parseInt(payload.idx, 10);
      state.placementPoints[idx] = parseInt(payload.value, 10) || 0;
      break;
    }
    case 'endMatch':
      rolloverMatch();
      break;
    default:
      throw new Error('Unknown action: ' + action);
  }
  checkBooyah();
}

// ---- ROUTES ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/standings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'standings.html')));
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ---- SOCKETS ----
io.on('connection', (socket) => {
  socket.emit('state', stateWithTotals());

  socket.on('admin:action', ({ key, action, payload } = {}, cb) => {
    if (key !== ADMIN_KEY) {
      if (cb) cb({ error: 'unauthorized' });
      return;
    }
    try {
      handleAction(action, payload || {});
    } catch (e) {
      if (cb) cb({ error: e.message });
      return;
    }
    // Update every connected display immediately; persist without blocking the
    // Node event loop that serves button actions and static page requests.
    broadcast();
    if (cb) cb({ ok: true });
    saveState().catch(error => console.error('Failed to persist scoreboard state:', error));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Innovista scoreboard running at http://localhost:${PORT}`);
  console.log(`Admin panel:     http://localhost:${PORT}/admin`);
  console.log(`Admin key:       ${ADMIN_KEY}  (change via ADMIN_KEY env var before going live)`);
  console.log(`State file:      ${STATE_FILE}`);
});
