const socket = io();
let state = null;

let adminKey = localStorage.getItem('innovista_admin_key') || '';

function esc(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pipHtml(alive) {
  let h = '';
  for (let i = 0; i < 4; i++) h += `<span class="pip ${i < alive ? 'on' : 'off'}"></span>`;
  return h;
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (document.activeElement !== input) input.value = value || '';
}

function sendAction(action, payload, onSuccess) {
  const keyInput = document.getElementById('adminKey');
  adminKey = keyInput.value || adminKey;
  localStorage.setItem('innovista_admin_key', adminKey);
  keyInput.value = '';
  keyInput.placeholder = adminKey ? 'Saved in this browser' : 'admin123';
  socket.emit('admin:action', { key: adminKey, action, payload }, (res) => {
    const statusEl = document.getElementById('status');
    if (res && res.error === 'unauthorized') {
      statusEl.textContent = 'Wrong admin key. Reload the page and re-enter it.';
      localStorage.removeItem('innovista_admin_key');
    } else if (res && res.error) {
      statusEl.textContent = 'Error: ' + res.error;
    } else {
      if (onSuccess) onSuccess(res);
      else statusEl.textContent = '';
    }
  });
}

function render() {
  if (!state) return;

  document.getElementById('adminKey').placeholder = adminKey ? 'Saved in this browser' : 'admin123';
  setInputValue('stageName', state.stageName || 'League Stage');
  setInputValue('groupName', state.groupName || 'Group A');
  setInputValue('qualifyCount', state.qualifyCount || 0);

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
      <button data-act="rush" data-id="${t.id}" data-value="${t.championRush ? '0' : '1'}" class="${t.championRush ? 'rush-on' : ''}">Champion Rush</button>
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
      else if (act === 'rush') sendAction('toggleChampionRush', { id, value: btn.dataset.value === '1' });
      else if (act === 'remove') sendAction('removeTeam', { id });
    };
  });
}

document.getElementById('addTeamsBtn').onclick = () => {
  const textarea = document.getElementById('bulkTeamNames');
  const names = textarea.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  const statusEl = document.getElementById('status');
  if (!names.length) {
    statusEl.textContent = 'Enter one team name per line.';
    return;
  }
  sendAction('addTeams', { names }, () => {
    textarea.value = '';
    statusEl.textContent = `${names.length} team${names.length === 1 ? '' : 's'} added.`;
  });
};
document.getElementById('bulkTeamNames').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) document.getElementById('addTeamsBtn').click();
});
document.getElementById('endMatchBtn').onclick = () => {
  if (confirm('End this match? Points earned so far will be locked in and carried forward. Kills/alive/eliminations reset for the next match.')) sendAction('endMatch', {});
};
document.getElementById('saveMetaBtn').onclick = () => {
  sendAction('updateMatchMeta', {
    stageName: document.getElementById('stageName').value,
    groupName: document.getElementById('groupName').value,
    qualifyCount: document.getElementById('qualifyCount').value
  });
};
document.getElementById('adminKey').addEventListener('change', (event) => {
  adminKey = event.target.value;
  localStorage.setItem('innovista_admin_key', adminKey);
  event.target.value = '';
  event.target.placeholder = adminKey ? 'Saved in this browser' : 'admin123';
});
['stageName', 'groupName', 'qualifyCount'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.getElementById('saveMetaBtn').click();
  });
});

socket.on('state', (s) => { state = s; render(); });
