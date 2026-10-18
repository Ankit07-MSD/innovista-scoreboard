const socket = io();
let state = null;
let winnerShownFor = null;
let activeBooyahOverlay = null;
let booyahConfettiTimer = null;
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
  const aliveTeams = state.teams.filter(t => !t.eliminated && !t.isWinner).length + state.teams.filter(t => t.isWinner).length;
  const kills = state.teams.reduce((sum, t) => sum + (Number(t.kills) || 0), 0);
  const winner = state.teams.find(t => t.isWinner);
  el.innerHTML = `
    <div class="live-card-title">ROUND DETAILS <span class="live-dot"></span></div>
    <div class="round-number">MATCH ${Number(state.matchNumber) || 1}</div>
    <div class="round-meta"><span>STAGE</span><strong>${esc(state.stageName || 'League Stage')}</strong></div>
    <div class="round-meta"><span>GROUP</span><strong>${esc(state.groupName || 'Group A')}</strong></div>
    <div class="round-stats">
      <div><strong>${aliveTeams}</strong><span>TEAMS ALIVE</span></div>
      <div><strong>${kills}</strong><span>TOTAL KILLS</span></div>
    </div>
    ${winner ? `<div class="round-winner">🏆 BOOYAH · ${esc(winner.name)}</div>` : '<div class="round-status"><i></i> MATCH IN PROGRESS</div>'}
  `;
}

function renderTeamComparison() {
  const card = document.getElementById('comparisonCard');
  card.hidden = !state.showTeamComparison;
  if (card.hidden) return;
  const firstSelect = document.getElementById('compareTeamA');
  const secondSelect = document.getElementById('compareTeamB');
  const output = document.getElementById('teamComparison');
  const sorted = [...state.teams].sort(compareStandings);
  const previousFirst = firstSelect.value;
  const previousSecond = secondSelect.value;
  const options = sorted.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  firstSelect.innerHTML = options || '<option value="">Add teams</option>';
  secondSelect.innerHTML = options || '<option value="">Add teams</option>';
  firstSelect.value = sorted.some(t => t.id === previousFirst) ? previousFirst : (sorted[0]?.id || '');
  secondSelect.value = sorted.some(t => t.id === previousSecond) ? previousSecond : (sorted[1]?.id || sorted[0]?.id || '');

  const a = state.teams.find(t => t.id === firstSelect.value);
  const b = state.teams.find(t => t.id === secondSelect.value);
  if (!a || !b) {
    output.innerHTML = '<div class="compare-empty">Add teams to compare live stats.</div>';
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

function renderMatchRecap() {
  const el = document.getElementById('matchRecap');
  const recap = state.lastRecap;
  if (!recap || !Array.isArray(recap.teams) || !recap.teams.length) {
    el.innerHTML = '<div class="live-card-title">LAST MATCH RECAP</div><div class="compare-empty">Match results will show here after End Match.</div>';
    return;
  }
  const teams = recap.teams;
  const topTeams = teams.slice(0, 5);
  el.innerHTML = `<div class="live-card-title">LAST MATCH RECAP</div>
    <div class="recap-heading">MATCH ${Number(recap.matchNumber) || ''}</div>
    <div class="recap-winner">${recap.winner ? `🏆 ${esc(recap.winner)}` : 'MATCH COMPLETE'}</div>
    <div class="recap-subtitle">${esc(recap.groupName || '')} · ${esc(recap.stageName || '')}</div>
    <div class="recap-list">${topTeams.map((t, i) => `<div class="recap-row ${i === 0 ? 'recap-first' : ''}">
      <b>#${t.position || i + 1}</b><strong>${esc(t.name)}</strong><span>${Number(t.kills) || 0}K</span><em>${Number(t.points) || 0} PTS</em>
    </div>`).join('')}</div>
    ${teams.length > topTeams.length ? `<div class="recap-foot">+ ${teams.length - topTeams.length} more teams</div>` : ''}`;
}

document.addEventListener('change', (event) => {
  if (event.target?.id === 'compareTeamA' || event.target?.id === 'compareTeamB') renderTeamComparison();
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
  overlay.querySelector('.booyah-recap-button').addEventListener('click', () => showCurrentMatchRecap(overlay));
  document.body.classList.add('booyah-active');
  activeBooyahOverlay = overlay;
  spawnConfetti(overlay, 130);
  booyahConfettiTimer = setInterval(() => spawnConfetti(overlay, 46), 2600);
}

function showCurrentMatchRecap(overlay) {
  const existing = overlay.querySelector('.booyah-recap-modal');
  if (existing) {
    existing.remove();
    return;
  }
  const eliminated = state.teams.filter(t => t.eliminated).length;
  const rows = state.teams.map(t => ({
    ...t,
    recapPosition: t.position || (t.isWinner ? 1 : Math.max(1, state.teams.length - eliminated)),
    recapPoints: (Number(t.kills) || 0) + (Number(t.livePlacementPts) || 0)
  })).sort((a, b) => a.recapPosition - b.recapPosition || compareStandings(a, b));
  const modal = document.createElement('section');
  modal.className = 'booyah-recap-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Match recap');
  modal.innerHTML = `<button class="booyah-recap-close" type="button" aria-label="Close match recap">×</button>
    <div class="booyah-recap-title">MATCH ${Number(state.matchNumber) || 1} RECAP</div>
    <div class="booyah-recap-subtitle">${esc(state.groupName || 'Group A')} · ${esc(state.stageName || 'League Stage')}</div>
    <div class="booyah-recap-columns"><span>POS</span><span>TEAM</span><span>KILLS</span><span>PTS</span></div>
    <div class="booyah-recap-list">${rows.map(t => `<div class="booyah-recap-row ${t.isWinner ? 'winner-row' : ''}">
      <b>#${t.recapPosition}</b><strong>${esc(t.name)}</strong><span>${Number(t.kills) || 0}</span><em>${t.recapPoints}</em>
    </div>`).join('')}</div>`;
  overlay.appendChild(modal);
  modal.querySelector('.booyah-recap-close').addEventListener('click', () => modal.remove());
}

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
  renderMatchMeta();
  renderTable();
  renderRoundDetails();
  renderTeamComparison();
  renderMatchRecap();
  updateBanner();
  checkWinner();
});

// Lightweight tick just for the banner's disappearing act.
setInterval(updateBanner, 1000);
