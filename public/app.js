const socket = io();
let state = null;
let winnerShownFor = null;
const previousRanks = new Map();
const previousTotals = new Map();

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
  const stage = state.stageName || 'League Stage';
  const group = state.groupName || 'Group A';
  el.innerHTML = `
    <div class="meta-chip"><span>Stage</span><strong>${esc(stage)}</strong></div>
    <div class="live-dot"></div>
    <div class="meta-chip"><span>Group</span><strong>${esc(group)}</strong></div>
  `;
}

function renderTable() {
  const container = document.getElementById('table');
  const sorted = [...state.teams].sort((a, b) => b.total - a.total);

  // FLIP step 1 (First): remember where every existing row currently sits on screen.
  const firstRects = {};
  container.querySelectorAll('.row[data-id]').forEach(el => {
    firstRects[el.dataset.id] = el.getBoundingClientRect();
  });

  container.innerHTML = `<div class="row head"><div class="c rank">#</div><div class="c team">TEAM</div><div class="c alive">ALIVE</div><div class="c elims">ELIMS</div><div class="c pts">PTS</div></div>`;

  if (sorted.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="statusMsg">No teams added yet</div>');
    return;
  }

  sorted.forEach((t, i) => {
    const el = document.createElement('div');
    const previousRank = previousRanks.get(t.id);
    const movementClass = previousRank && previousRank > i + 1 ? ' rank-up' : (previousRank && previousRank < i + 1 ? ' rank-down' : '');
    const scoreClass = previousTotals.has(t.id) && t.total > previousTotals.get(t.id) ? ' ptsPulse' : '';
    el.className = (t.eliminated ? 'row elim' : (t.isWinner ? 'row winner' : 'row')) + movementClass;
    el.dataset.id = t.id;
    const rankLabel = t.isWinner ? '★' : (i + 1);
    el.innerHTML = `
      <div class="c rank">${rankLabel}</div>
      <div class="c team">${t.isWinner ? '<span class="booyah">BOOYAH</span>' : ''}${esc(t.name)}</div>
      <div class="c alive">${pipHtml(t.alive)}</div>
      <div class="c elims">${t.kills}</div>
      <div class="c pts ${scoreClass}">${t.total}</div>`;
    container.appendChild(el);
  });

  // FLIP step 2 (Last, Invert, Play): compare new position to old, animate the difference away.
  container.querySelectorAll('.row[data-id]').forEach(el => {
    const id = el.dataset.id;
    const first = firstRects[id];
    if (first) {
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
  sorted.forEach((t, i) => {
    previousRanks.set(t.id, i + 1);
    previousTotals.set(t.id, t.total);
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
  }
}

function showBooyah(teamName) {
  const flash = document.createElement('div');
  flash.className = 'booyah-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  const overlay = document.createElement('div');
  overlay.className = 'booyah-overlay';
  overlay.innerHTML = `
    <div class="rays"></div>
    <div class="booyah-banner">
      <div class="booyah-title">BOOYAH</div>
      <div class="booyah-sub">FLAWLESS VICTORY</div>
    </div>
    <div class="booyah-team">${esc(teamName)} WINS THE MATCH</div>
  `;
  document.body.appendChild(overlay);
  spawnConfetti(overlay, 130);
  setTimeout(() => overlay.classList.add('fadeOut'), 6800);
  setTimeout(() => overlay.remove(), 7600);
}

function checkWinner() {
  const winner = state.teams.find(t => t.isWinner);
  if (winner && winnerShownFor !== winner.id) {
    winnerShownFor = winner.id;
    showBooyah(winner.name);
  }
  if (!winner) winnerShownFor = null; // so the next win in a new match can trigger again
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
