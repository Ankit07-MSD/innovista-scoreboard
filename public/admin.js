const socket = io();
let state = null;

// Ask for the admin key once and remember it in this browser.
let adminKey = localStorage.getItem('innovista_admin_key');
if (!adminKey) {
  adminKey = prompt('Enter admin key:') || '';
  localStorage.setItem('innovista_admin_key', adminKey);
}

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pipHtml(alive) {
  let h = '';
  for (let i = 0; i < 4; i++) h += `<span class="pip ${i < alive ? 'on' : 'off'}"></span>`;
  return h;
}

function sendAction(action, payload) {
  socket.emit('admin:action', { key: adminKey, action, payload }, (res) => {
    const statusEl = document.getElementById('status');
    if (res && res.error === 'unauthorized') {
      statusEl.textContent = 'Wrong admin key. Reload the page and re-enter it.';
      localStorage.removeItem('innovista_admin_key');
    } else if (res && res.error) {
      statusEl.textContent = 'Error: ' + res.error;
    } else {
      statusEl.textContent = '';
    }
  });
}

function render() {
  if (!state) return;

  const winner = state.teams.find(t => t.isWinner);
  const noticeEl = document.getElementById('matchNotice');
  if (winner) {
    noticeEl.innerHTML = `<div style="background:rgba(255,210,87,.12);border:1px solid var(--gold);color:var(--gold);padding:10px 14px;border-radius:6px;margin-bottom:14px;font-weight:700">
      🏆 ${esc(winner.name)} won this match — click <b>"End Match → Next"</b> before eliminating for the next round.
    </div>`;
  } else {
    noticeEl.innerHTML = '';
  }

  const rows = state.teams.map(t => `
    <div class="arow">
      <input class="nameInput" data-id="${t.id}" value="${esc(t.name)}">
      <div class="pips">${pipHtml(t.alive)}</div>
      <button data-act="alive-" data-id="${t.id}">Alive −</button>
      <button data-act="alive+" data-id="${t.id}">Alive +</button>
      <span>Kills: ${t.kills}</span>
      <button data-act="kill-" data-id="${t.id}">−</button>
      <button data-act="kill+" data-id="${t.id}">+</button>
      <span>Pos: ${t.position || '-'}</span>
      <span style="color:var(--cyan);font-weight:700">Pts: ${t.total}</span>
      <span style="color:var(--muted);font-size:12px">(M:${t.matches||0} · 🏆${t.boyahs||0})</span>
      ${t.eliminated
        ? `<button data-act="undo" data-id="${t.id}">Undo</button>`
        : `<button data-act="elim" data-id="${t.id}" style="border-color:var(--orange);color:var(--orange)">Eliminate</button>`}
      <button data-act="remove" data-id="${t.id}" style="border-color:#663;color:#e77">Remove</button>
    </div>
  `).join('');
  document.getElementById('teams').innerHTML = rows || '<p style="color:var(--muted)">Add your first team above.</p>';

  document.getElementById('ppInputs').innerHTML = state.placementPoints.map((p, i) =>
    `<label>#${i + 1}<input type="number" data-idx="${i}" class="ppInput" value="${p}"></label>`
  ).join('');

  document.querySelectorAll('.nameInput').forEach(inp => {
    inp.onchange = () => sendAction('renameTeam', { id: inp.dataset.id, name: inp.value });
  });
  document.querySelectorAll('.ppInput').forEach(inp => {
    inp.onchange = () => sendAction('updatePlacementPoints', { idx: inp.dataset.idx, value: inp.value });
  });
  document.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id, act = btn.dataset.act;
      if (act === 'alive-') sendAction('adjustAlive', { id, delta: -1 });
      else if (act === 'alive+') sendAction('adjustAlive', { id, delta: 1 });
      else if (act === 'kill-') sendAction('addKill', { id, delta: -1 });
      else if (act === 'kill+') sendAction('addKill', { id, delta: 1 });
      else if (act === 'elim') sendAction('eliminate', { id });
      else if (act === 'undo') sendAction('undoElim', { id });
      else if (act === 'remove') sendAction('removeTeam', { id });
    };
  });
}

document.getElementById('addBtn').onclick = () => {
  const inp = document.getElementById('newTeamName');
  const v = inp.value.trim();
  if (v) { sendAction('addTeam', { name: v }); inp.value = ''; }
};
document.getElementById('endMatchBtn').onclick = () => {
  if (confirm('End this match? Points earned so far will be locked in and carried forward. Kills/alive/eliminations reset for the next match.')) sendAction('endMatch', {});
};

socket.on('state', (s) => { state = s; render(); });