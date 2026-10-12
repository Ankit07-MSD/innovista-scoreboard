const socket = io();
const previousRanks = new Map();
const previousTotals = new Map();

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMatchMeta(state) {
  const el = document.getElementById('matchMeta');
  const stage = (state.stageName || 'League Stage').toUpperCase();
  const group = (state.groupName || 'Group A').toUpperCase();
  el.innerHTML = `
    <div class="poster-present">HLD ESPORTS PRESENTS</div>
    <div class="poster-stage">${esc(stage)}</div>
    <div class="poster-group">${esc(group)}</div>
    <div class="poster-mode">OVERALL STANDINGS</div>
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
        championRush: Boolean(t.championRush),
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
    const qualifyClass = state.qualifyCount && i < state.qualifyCount ? ' qualified' : '';
    return `
      <div class="pt-row${movementClass}${qualifyClass}" data-id="${t.id}">
        <div class="c cr">${t.championRush ? '<span class="cr-badge"><b>CR</b><small>RUSH</small></span>' : ''}</div>
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
      <div class="c cr">RUSH</div><div class="c">POS</div><div class="c team">TEAM</div><div class="c">MATCH</div>
      <div class="c">BOOYAH</div><div class="c">KILL</div><div class="c">PLACE</div><div class="c">TOTAL</div>
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
