const socket = io();
let state = null;
let winnerShownFor = null;
let activeBooyahOverlay = null;
let booyahConfettiTimer = null;
const previousRanks = new Map();
const previousTotals = new Map();
const previousEliminations = new Map();

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

function renderTable() {
  const container = document.getElementById('table');
  const eliminationOccurred = state.teams.some(t => previousEliminations.get(t.id) === false && t.eliminated);
  const sorted = [...state.teams].sort((a, b) => b.total - a.total);

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
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('booyah-active');
  activeBooyahOverlay = overlay;
  spawnConfetti(overlay, 130);
  booyahConfettiTimer = setInterval(() => spawnConfetti(overlay, 46), 2600);
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
  updateBanner();
  checkWinner();
});

// Lightweight tick just for the banner's disappearing act.
setInterval(updateBanner, 1000);
