const socket = io();
const previousRanks = new Map();
const previousTotals = new Map();

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMatchMeta(state) {
  const el = document.getElementById('matchMeta');
  const stage = state.stageName || 'League Stage';
  const group = state.groupName || 'Group A';
  el.innerHTML = `
    <div class="meta-chip"><span>Stage</span><strong>${esc(stage)}</strong></div>
    <div class="live-dot"></div>
    <div class="meta-chip"><span>Group</span><strong>${esc(group)}</strong></div>
  `;
}

function render(state) {
  renderMatchMeta(state);
  const table = document.getElementById('table');
  const firstRects = {};
  table.querySelectorAll('.pt-row[data-id]').forEach(el => {
    firstRects[el.dataset.id] = el.getBoundingClientRect();
  });

  const rows = [...state.teams]
    .map(t => {
      const kills = (t.cumKills || 0) + (t.kills || 0); // banked kills + this match's live kills
      const bankedPlacementPts = (t.cumPoints || 0) - (t.cumKills || 0); // placement points from finished matches
      const livePlacementPts = t.position ? (state.placementPoints[t.position - 1] ?? 1) : 0; // this match, if placed
      return {
        id: t.id,
        name: t.name,
        matches: t.matches || 0,
        boyahs: t.boyahs || 0,
        kills,
        placementPts: bankedPlacementPts + livePlacementPts,
        total: t.total
      };
    })
    .sort((a, b) => b.total - a.total);

  const rowsHtml = rows.map((t, i) => {
    const previousRank = previousRanks.get(t.id);
    const movementClass = previousRank && previousRank > i + 1 ? ' rank-up' : (previousRank && previousRank < i + 1 ? ' rank-down' : '');
    const scoreClass = previousTotals.has(t.id) && t.total > previousTotals.get(t.id) ? ' ptsPulse' : '';
    return `
      <div class="pt-row${movementClass}" data-id="${t.id}">
        <div class="c rank">${i + 1}</div>
        <div class="c team">${esc(t.name)}</div>
        <div class="c">${t.matches}</div>
        <div class="c">${t.boyahs}</div>
        <div class="c">${t.kills}</div>
        <div class="c">${t.placementPts}</div>
        <div class="c pts ${scoreClass}">${t.total}</div>
      </div>
    `;
  }).join('');

  table.innerHTML = `
    <div class="pt-row head">
      <div class="c">#</div><div class="c team">TEAM</div><div class="c">MATCHES</div>
      <div class="c">BOOYAH</div><div class="c">KILLS</div><div class="c">PLACEMENT&nbsp;PTS</div><div class="c">TOTAL</div>
    </div>
    ${rowsHtml || '<div class="statusMsg">No teams added yet</div>'}
  `;

  table.querySelectorAll('.pt-row[data-id]').forEach(el => {
    const first = firstRects[el.dataset.id];
    if (first) {
      const last = el.getBoundingClientRect();
      const deltaY = first.top - last.top;
      if (Math.abs(deltaY) > 1) {
        el.classList.add('row-moving');
        el.style.transition = 'none';
        el.style.transform = `translateY(${deltaY}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 650ms cubic-bezier(.2,.9,.18,1)';
          el.style.transform = '';
          setTimeout(() => el.classList.remove('row-moving'), 720);
        });
      }
    } else {
      el.classList.add('rowAnim');
    }
  });

  previousRanks.clear();
  previousTotals.clear();
  rows.forEach((t, i) => {
    previousRanks.set(t.id, i + 1);
    previousTotals.set(t.id, t.total);
  });
}

socket.on('state', render);
