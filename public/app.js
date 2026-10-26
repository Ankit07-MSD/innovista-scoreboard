const socket = io();
let state = null;
let winnerShownFor = null;
let activeBooyahOverlay = null;
let booyahConfettiTimer = null;
let booyahAudio = null;
let initialStateReceived = false;
let lastRecapSeenAt = null;
let lastZoneEventId = null;
let zoneClosingAudio = null;
let previousHudCounts = null;
const previousRanks = new Map();
const previousTotals = new Map();
const previousEliminations = new Map();

function compareStandings(a, b) {
  const points = (b.total || 0) - (a.total || 0);
  if (points) return points;
  const booyahs = ((b.boyahs || 0) + Number(Boolean(b.isWinner))) - ((a.boyahs || 0) + Number(Boolean(a.isWinner)));
  if (booyahs) return booyahs;
  const kills = ((b.cumKills || 0) + (b.kills || 0)) - ((a.cumKills || 0) + (a.kills || 0));
  if (kills) return kills;
  const aPosition = Number(a.lastPosition || a.position) || Number.POSITIVE_INFINITY;
  const bPosition = Number(b.lastPosition || b.position) || Number.POSITIVE_INFINITY;
  return aPosition === bPosition ? 0 : aPosition - bPosition;
}

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pipHtml(alive) {
  let h = '';
  for (let i = 0; i < 4; i++) h += `<span class="pip ${i < alive ? 'on' : 'off'}"></span>`;
  return h;
}

function renderKillFeedPlayer() {
  const viewport = document.getElementById('obsKillFeedViewport');
  if (!viewport) return;
  const url = state.killFeedPlayerUrl || '';
  const existing = viewport.querySelector('iframe.killfeed-player');
  if (!url) {
    existing?.remove();
    document.getElementById('killFeedPlaceholder')?.removeAttribute('hidden');
    return;
  }
  if (existing?.dataset.embedUrl === url) return;
  existing?.remove();
  const placeholder = document.getElementById('killFeedPlaceholder');
  if (placeholder) placeholder.hidden = true;
  const player = document.createElement('iframe');
  player.className = 'killfeed-player';
  player.dataset.embedUrl = url;
  const playerUrl = new URL(url);
  if (/^(?:www\.)?vdo\.ninja$/i.test(playerUrl.hostname)) {
    playerUrl.searchParams.set('cleanoutput', '');
  } else {
    playerUrl.searchParams.set('autoplay', 'true');
    playerUrl.searchParams.set('muted', 'true');
    playerUrl.searchParams.set('controls', 'true');
    playerUrl.searchParams.set('letterboxColor', 'transparent');
  }
  player.src = playerUrl.toString();
  player.title = 'Live game kill feed';
  player.allow = 'autoplay; encrypted-media; picture-in-picture';
  player.allowFullscreen = true;
  player.loading = 'eager';
  viewport.prepend(player);
}

function renderMatchMeta() {
  const el = document.getElementById('matchMeta');
  const stage = (state.stageName || 'League Stage').toUpperCase();
  const group = (state.groupName || 'Group A').toUpperCase();
  el.innerHTML = `
    <div class="poster-stage">${esc(stage)}</div>
    <div class="poster-group">${esc(group)}</div>
    <div class="poster-mode">LIVE STANDINGS</div>
  `;
}

function renderRoundDetails() {
  const el = document.getElementById('roundDetails');
  const teamsAlive = state.teams.filter(t => !t.eliminated).length;
  const playersAlive = state.teams.reduce((sum, t) => sum + (t.eliminated ? 0 : Number(t.alive) || 0), 0);
  const teamDrop = previousHudCounts ? previousHudCounts.teams - teamsAlive : 0;
  const playerDrop = previousHudCounts ? previousHudCounts.players - playersAlive : 0;
  el.innerHTML = `
    <div class="hud-left">
      <div class="hud-item"><span>MATCH</span><strong>${Number(state.matchNumber) || 1}</strong></div>
      <div class="hud-item hud-map"><span>MAP</span><strong>${esc(state.mapName || '—')}</strong></div>
    </div>
    <div class="hud-right">
      <div class="hud-stat ${teamDrop > 0 ? 'hud-stat-drop' : ''}"><strong>${teamsAlive}</strong><span>TEAMS ALIVE</span>${teamDrop > 0 ? `<i>−${teamDrop}</i>` : ''}</div>
      <div class="hud-stat ${playerDrop > 0 ? 'hud-stat-drop' : ''}"><strong>${playersAlive}</strong><span>PLAYERS ALIVE</span>${playerDrop > 0 ? `<i>−${playerDrop}</i>` : ''}</div>
    </div>
  `;
  previousHudCounts = { teams: teamsAlive, players: playersAlive };
}

function renderTeamComparison() {
  let overlay = document.getElementById('comparisonOverlay');
  if (!state.showTeamComparison) {
    overlay?.remove();
    return;
  }
  const previousFirst = overlay?.querySelector('#compareTeamA')?.value || '';
  const previousSecond = overlay?.querySelector('#compareTeamB')?.value || '';
  const sorted = [...state.teams].sort(compareStandings);
  if (!overlay) {
    overlay = document.createElement('section');
    overlay.id = 'comparisonOverlay';
    overlay.className = 'full-screen-overlay comparison-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Live team comparison');
    document.body.appendChild(overlay);
  }
  const options = sorted.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  const firstId = sorted.some(t => t.id === previousFirst) ? previousFirst : (sorted[0]?.id || '');
  const secondId = sorted.some(t => t.id === previousSecond) ? previousSecond : (sorted[1]?.id || sorted[0]?.id || '');
  overlay.innerHTML = `<div class="team-compare-modal">
    <div class="full-modal-kicker">INNOVISTA · LIVE STATS</div>
    <h2>TEAM COMPARISON</h2>
    <div class="compare-selects"><select id="compareTeamA" aria-label="First team to compare">${options || '<option value="">No teams</option>'}</select><span>VS</span><select id="compareTeamB" aria-label="Second team to compare">${options || '<option value="">No teams</option>'}</select></div>
    <div id="teamComparison"></div>
    <div class="modal-hint">Comparison is controlled from the admin panel</div>
  </div>`;
  const firstSelect = overlay.querySelector('#compareTeamA');
  const secondSelect = overlay.querySelector('#compareTeamB');
  firstSelect.value = firstId;
  secondSelect.value = secondId;

  const a = state.teams.find(t => t.id === firstSelect.value);
  const b = state.teams.find(t => t.id === secondSelect.value);
  const output = overlay.querySelector('#teamComparison');
  if (!a || !b) {
    output.innerHTML = '<div class="compare-empty">Add at least two teams to compare live stats.</div>';
    return;
  }
  const rankById = new Map(sorted.map((t, i) => [t.id, i + 1]));
  const stats = [
    ['RANK', `#${rankById.get(a.id)}`, `#${rankById.get(b.id)}`],
    ['LIVE PTS', a.total || 0, b.total || 0],
    ['KILLS', a.kills || 0, b.kills || 0],
    ['ALIVE', a.alive || 0, b.alive || 0],
    ['PLACE PTS', a.livePlacementPts || 0, b.livePlacementPts || 0],
    ['BOOYAHS', a.boyahs || 0, b.boyahs || 0]
  ];
  output.innerHTML = `<div class="compare-team-names"><strong>${esc(a.name)}</strong><b>VS</b><strong>${esc(b.name)}</strong></div>
    ${stats.map(([label, av, bv]) => `<div class="compare-stat"><span>${label}</span><b>${av}</b><b>${bv}</b></div>`).join('')}`;
}

function currentMatchRecap() {
  const eliminated = state.teams.filter(t => t.eliminated).length;
  const teams = state.teams.map(t => ({
    ...t,
    position: t.position || (t.isWinner ? 1 : Math.max(1, state.teams.length - eliminated)),
    placementPoints: Number(t.livePlacementPts) || 0,
    points: (Number(t.kills) || 0) + (Number(t.livePlacementPts) || 0)
  })).sort((a, b) => a.position - b.position || compareStandings(a, b));
  return { matchNumber: state.matchNumber, stageName: state.stageName, groupName: state.groupName, mapName: state.mapName,
    winner: teams.find(t => t.isWinner)?.name || teams.find(t => t.position === 1)?.name || null, teams };
}

function openMatchRecap(recap) {
  if (!recap || !Array.isArray(recap.teams) || !recap.teams.length) return;
  document.getElementById('comparisonOverlay')?.remove();
  document.getElementById('matchRecapOverlay')?.remove();
  const overlay = document.createElement('section');
  overlay.id = 'matchRecapOverlay';
  overlay.className = 'full-screen-overlay recap-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Match recap');
  overlay.innerHTML = `<div class="match-recap-modal">
    <button class="recap-close" type="button" aria-label="Close match recap">×</button>
    <div class="full-modal-kicker">${esc(recap.groupName || 'GROUP')} · ${esc(recap.stageName || 'STAGE')}${recap.mapName ? ` · ${esc(recap.mapName)}` : ''}</div>
    <h2>MATCH ${Number(recap.matchNumber) || ''} RECAP</h2>
    ${recap.winner ? `<div class="recap-champion">🏆 BOOYAH · ${esc(recap.winner)}</div>` : ''}
    <div class="recap-table-head"><span>PLACE</span><span>TEAM</span><span>KILLS</span><span>PLACE PTS</span><span>MATCH PTS</span></div>
    <div class="recap-full-list">${recap.teams.map((t, i) => `<div class="recap-full-row ${(t.isWinner || t.position === 1) ? 'recap-first' : ''}">
      <b>#${Number(t.position) || i + 1}</b><strong>${esc(t.name)}</strong><span>${Number(t.kills) || 0}</span><span>${Number(t.placementPoints) || 0}</span><em>${Number(t.points) || 0}</em>
    </div>`).join('')}</div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.recap-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
}

function renderMatchRecap() {
  const recap = state.lastRecap;
  if (!initialStateReceived) {
    lastRecapSeenAt = recap?.completedAt || null;
    return;
  }
  if (!recap?.completedAt || recap.completedAt === lastRecapSeenAt) return;
  lastRecapSeenAt = recap.completedAt;
  openMatchRecap(recap);
}

function primeZoneClosingAudio() {
  if (!zoneClosingAudio) {
    zoneClosingAudio = new Audio('/zone-closing.webm');
    zoneClosingAudio.preload = 'none';
  }
  zoneClosingAudio.muted = true;
  zoneClosingAudio.play().then(() => {
    zoneClosingAudio.pause();
    zoneClosingAudio.currentTime = 0;
    zoneClosingAudio.muted = false;
  }).catch(() => {
    zoneClosingAudio.muted = false;
  });
}

document.addEventListener('pointerdown', primeZoneClosingAudio, { once: true, passive: true });

function showZoneClosing() {
  document.querySelector('.zone-closing-overlay')?.remove();
  if (!zoneClosingAudio) {
    zoneClosingAudio = new Audio('/zone-closing.webm');
    zoneClosingAudio.preload = 'none';
  }
  zoneClosingAudio.pause();
  zoneClosingAudio.currentTime = 0;
  zoneClosingAudio.play().catch(() => {});
  const overlay = document.createElement('div');
  overlay.className = 'zone-closing-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="zone-ring"></div>
    <div class="zone-warning-card">
      <span class="zone-warning-kicker">SAFE ZONE ALERT</span>
      <strong>ZONE CLOSING</strong>
      <span class="zone-warning-sub">MOVE TO THE SAFE ZONE</span>
      <i class="zone-warning-progress"></i>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 7200);
}

function checkZoneClosing() {
  const event = state?.zoneClosingEvent;
  if (!event) return;
  if (!initialStateReceived) {
    lastZoneEventId = event.id;
    return;
  }
  if (event.id !== lastZoneEventId) {
    lastZoneEventId = event.id;
    showZoneClosing();
  }
}

document.addEventListener('change', (event) => {
  if (event.target?.id === 'compareTeamA' || event.target?.id === 'compareTeamB') renderTeamComparison();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.getElementById('matchRecapOverlay')?.remove();
});

function renderTable() {
  const container = document.getElementById('table');
  const eliminationOccurred = state.teams.some(t => previousEliminations.get(t.id) === false && t.eliminated);
  const sorted = [...state.teams].sort(compareStandings);

  // FLIP step 1 (First): remember where every existing row currently sits on screen.
  const firstRects = {};
  container.querySelectorAll('.row[data-id]').forEach(el => {
    firstRects[el.dataset.id] = el.getBoundingClientRect();
  });

  container.innerHTML = `<div class="row head"><div class="c cr">RUSH</div><div class="c rank">#</div><div class="c team">TEAM</div><div class="c alive">ALIVE</div><div class="c elims">ELIMS</div><div class="c pts">PTS</div></div>`;

  if (sorted.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="statusMsg">No teams added yet</div>');
    return;
  }

  sorted.forEach((t, i) => {
    const el = document.createElement('div');
    const previousRank = previousRanks.get(t.id);
    const movementClass = !eliminationOccurred && previousRank && previousRank > i + 1 ? ' rank-up' : (!eliminationOccurred && previousRank && previousRank < i + 1 ? ' rank-down' : '');
    const scoreClass = previousTotals.has(t.id) && t.total > previousTotals.get(t.id) ? ' ptsPulse' : '';
    const qualifyClass = state.qualifyCount && i < state.qualifyCount ? ' qualified' : '';
    const justEliminated = previousEliminations.get(t.id) === false && t.eliminated;
    el.className = (t.eliminated ? 'row elim' : (t.isWinner ? 'row winner' : 'row')) + movementClass + qualifyClass + (justEliminated ? ' elimination-sweep' : '');
    el.dataset.id = t.id;
    const rankLabel = t.isWinner ? '★' : (i + 1);
    el.innerHTML = `
      <div class="c cr">${t.championRush ? '<span class="cr-badge"><b>CR</b><small>RUSH</small></span>' : ''}</div>
      <div class="c rank">${rankLabel}</div>
      <div class="c team">${t.isWinner ? '<span class="booyah">BOOYAH</span>' : ''}${esc(t.name)}</div>
      <div class="c alive">${pipHtml(t.alive)}</div>
      <div class="c elims">${t.kills}</div>
      <div class="c pts ${scoreClass}">${t.total}</div>`;
    container.appendChild(el);
    if (justEliminated) setTimeout(() => el.classList.remove('elimination-sweep'), 2800);
  });

  // FLIP step 2 (Last, Invert, Play): compare new position to old, animate the difference away.
  container.querySelectorAll('.row[data-id]').forEach(el => {
    const id = el.dataset.id;
    const first = firstRects[id];
    if (first && !eliminationOccurred) {
      const last = el.getBoundingClientRect();
      const deltaY = first.top - last.top;
      if (Math.abs(deltaY) > 1) {
        el.classList.add('row-moving');
        el.style.transition = 'none';
        el.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 550ms cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
          setTimeout(() => el.classList.remove('row-moving'), 620);
        });
      }
    } else {
      // brand new row (just added) — fade/slide in instead of jumping in place
      el.classList.add('rowAnim');
    }
  });

  previousRanks.clear();
  previousTotals.clear();
  previousEliminations.clear();
  sorted.forEach((t, i) => {
    previousRanks.set(t.id, i + 1);
    previousTotals.set(t.id, t.total);
    previousEliminations.set(t.id, Boolean(t.eliminated));
  });
}

// Only touches the banner element, doesn't rebuild the table, so it never
// interrupts the row-reorder animation above.
function updateBanner() {
  const bannerEl = document.getElementById('banner');
  if (state && state.lastElim && Date.now() - state.lastElim.ts < 5000) {
    if (bannerEl.dataset.ts != state.lastElim.ts) {
      bannerEl.dataset.ts = state.lastElim.ts;
      bannerEl.innerHTML = `<div class="elim-banner">#${state.lastElim.position} ${esc(state.lastElim.name)} ELIMINATED</div>`;
    }
  } else if (bannerEl.innerHTML) {
    bannerEl.innerHTML = '';
    bannerEl.dataset.ts = '';
  }
}

function spawnConfetti(container, count) {
  const colors = ['#22e8ff', '#ffd257', '#ff6a1a', '#ffffff', '#7CFFB2'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.8) + 's';
    p.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p);
    setTimeout(() => p.remove(), 4700);
  }
}

function showBooyah(teamName, winnerId) {
  if (activeBooyahOverlay && document.body.contains(activeBooyahOverlay)) {
    activeBooyahOverlay.dataset.winnerId = winnerId;
    activeBooyahOverlay.querySelector('.booyah-team').textContent = teamName;
    return;
  }

  const flash = document.createElement('div');
  flash.className = 'booyah-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  if (!booyahAudio) {
    booyahAudio = new Audio('/booyah.mp3');
    booyahAudio.preload = 'auto';
  }
  booyahAudio.pause();
  booyahAudio.currentTime = 0;
  booyahAudio.play().catch(() => {});

  const overlay = document.createElement('div');
  overlay.className = 'booyah-overlay';
  overlay.dataset.winnerId = winnerId;
  overlay.innerHTML = `
    <div class="booyah-bg-grid"></div>
    <div class="booyah-stack">
      <span>BOOYAH</span>
      <span>BOOYAH</span>
      <span>BOOYAH</span>
    </div>
    <div class="booyah-main">BOOYAH!</div>
    <div class="character-line" aria-hidden="true">
      <img class="booyah-squad" src="assets/innovista-squad-cutout.png" alt="" loading="eager">
    </div>
    <div class="winner-plate">
      <div class="booyah-team">${esc(teamName)}</div>
    </div>
    <button class="booyah-recap-button" type="button">MATCH RECAP</button>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.booyah-recap-button').addEventListener('click', () => openMatchRecap(currentMatchRecap()));
  document.body.classList.add('booyah-active');
  activeBooyahOverlay = overlay;
  spawnConfetti(overlay, 130);
  booyahConfettiTimer = setInterval(() => spawnConfetti(overlay, 46), 2600);
}

function primeBooyahAudio() {
  if (!booyahAudio) {
    booyahAudio = new Audio('/booyah.mp3');
    booyahAudio.preload = 'auto';
  }
  booyahAudio.muted = true;
  booyahAudio.play().then(() => {
    booyahAudio.pause();
    booyahAudio.currentTime = 0;
    booyahAudio.muted = false;
  }).catch(() => {
    booyahAudio.muted = false;
  });
}

document.addEventListener('pointerdown', primeBooyahAudio, { once: true, passive: true });

function hideBooyah() {
  if (booyahConfettiTimer) {
    clearInterval(booyahConfettiTimer);
    booyahConfettiTimer = null;
  }
  if (!activeBooyahOverlay) return;
  const overlay = activeBooyahOverlay;
  activeBooyahOverlay = null;
  overlay.classList.add('fadeOut');
  setTimeout(() => {
    overlay.remove();
    if (!activeBooyahOverlay) document.body.classList.remove('booyah-active');
  }, 800);
}

function checkWinner() {
  const winner = state.teams.find(t => t.isWinner);
  if (winner) {
    if (winnerShownFor !== winner.id || !activeBooyahOverlay) {
      winnerShownFor = winner.id;
      showBooyah(winner.name, winner.id);
    } else {
      showBooyah(winner.name, winner.id);
    }
    return;
  }
  if (winnerShownFor || activeBooyahOverlay) {
    winnerShownFor = null;
    hideBooyah();
  }
}

socket.on('state', (s) => {
  state = s;
  renderKillFeedPlayer();
  renderMatchMeta();
  renderTable();
  renderRoundDetails();
  renderTeamComparison();
  renderMatchRecap();
  checkZoneClosing();
  updateBanner();
  checkWinner();
  initialStateReceived = true;
});

// Lightweight tick just for the banner's disappearing act.
setInterval(updateBanner, 1000);
