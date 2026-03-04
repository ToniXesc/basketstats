// ============================================================
// BASKETSTATS PWA - Main Application
// ============================================================

// ---- DATABASE (IndexedDB) ----
const DB_NAME = 'BasketStatsDB';
const DB_VERSION = 1;
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('seasons')) d.createObjectStore('seasons', {keyPath:'id', autoIncrement:true});
      if (!d.objectStoreNames.contains('teams')) { const s = d.createObjectStore('teams', {keyPath:'id', autoIncrement:true}); s.createIndex('seasonId','seasonId',{unique:false}); }
      if (!d.objectStoreNames.contains('players')) { const s = d.createObjectStore('players', {keyPath:'id', autoIncrement:true}); s.createIndex('teamId','teamId',{unique:false}); }
      if (!d.objectStoreNames.contains('games')) { const s = d.createObjectStore('games', {keyPath:'id', autoIncrement:true}); s.createIndex('seasonId','seasonId',{unique:false}); }
      if (!d.objectStoreNames.contains('stats')) { const s = d.createObjectStore('stats', {keyPath:'id', autoIncrement:true}); s.createIndex('gameId','gameId',{unique:false}); s.createIndex('playerId','playerId',{unique:false}); }
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function dbGet(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetByIndex(store, index, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---- STATE ----
let currentPage = 'home';
let activeSeason = null;
let liveGame = null; // {gameId, homeTeamId, awayTeamId, homeScore, awayScore, quarter, homePlayers, awayPlayers, stats}
let selectedPlayer = null;

// ---- NAVIGATION ----
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  currentPage = page;
  const titles = {home:'BasketStats', seasons:'Temporadas', teams:'Equipos', live:'Partido en Directo', history:'Historial'};
  document.getElementById('pageTitle').textContent = titles[page] || 'BasketStats';
  const navAction = document.getElementById('navAction');
  if (page === 'seasons') { navAction.style.display='block'; navAction.onclick = showSeasonModal; }
  else if (page === 'teams') { navAction.style.display='block'; navAction.onclick = showTeamModal; }
  else { navAction.style.display='none'; }
  renderPage(page);
}

async function renderPage(page) {
  if (page === 'home') await renderHome();
  else if (page === 'seasons') await renderSeasons();
  else if (page === 'teams') await renderTeams();
  else if (page === 'history') await renderHistory();
  else if (page === 'live') renderLive();
}

// ---- TOAST ----
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- MODAL ----
function openModal(html) {
  document.getElementById('modalContent').innerHTML = '<div class="modal-handle"></div>' + html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').classList.remove('open');
  }
}

// ---- HOME ----
async function renderHome() {
  const seasons = await dbGetAll('seasons');
  activeSeason = seasons.find(s => s.active) || seasons[seasons.length - 1] || null;
  
  const noSeasonEl = document.getElementById('homeNoSeason');
  const seasonInfoEl = document.getElementById('homeSeasonInfo');
  const recentEl = document.getElementById('recentGames');

  if (!activeSeason) {
    noSeasonEl.style.display = 'block';
    seasonInfoEl.style.display = 'none';
    recentEl.innerHTML = '';
    return;
  }

  noSeasonEl.style.display = 'none';
  seasonInfoEl.style.display = 'block';
  document.getElementById('homeSeasonName').textContent = activeSeason.name;

  const games = await dbGetByIndex('games', 'seasonId', activeSeason.id);
  const wins = games.filter(g => g.finished && g.homeScore > g.awayScore).length;
  const losses = games.filter(g => g.finished && g.homeScore <= g.awayScore).length;
  const teams = await dbGetByIndex('teams', 'seasonId', activeSeason.id);
  let totalPlayers = 0;
  for (const t of teams) {
    const players = await dbGetByIndex('players', 'teamId', t.id);
    totalPlayers += players.length;
  }

  document.getElementById('homeStats').innerHTML = `
    <div class="stat-box"><div class="stat-num">${games.length}</div><div class="stat-lbl">Partidos</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--green)">${wins}</div><div class="stat-lbl">Victorias</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--red)">${losses}</div><div class="stat-lbl">Derrotas</div></div>
    <div class="stat-box"><div class="stat-num" style="color:var(--blue)">${totalPlayers}</div><div class="stat-lbl">Jugadores</div></div>
  `;

  const recent = games.filter(g => g.finished).slice(-3).reverse();
  if (recent.length > 0) {
    let html = '<div class="section-header"><span class="section-title">Últimos Partidos</span></div>';
    for (const g of recent) {
      const homeTeam = teams.find(t => t.id === g.homeTeamId);
      const awayTeam = teams.find(t => t.id === g.awayTeamId);
      const won = g.homeScore > g.awayScore;
      html += `
        <div class="list-item" onclick="showGameSummary(${g.id})">
          <div class="list-avatar" style="font-size:14px">${g.homeScore}-${g.awayScore}</div>
          <div class="list-info">
            <div class="list-name">${homeTeam?.name || '?'} vs ${awayTeam?.name || '?'}</div>
            <div class="list-sub">${new Date(g.date).toLocaleDateString('es-ES')}</div>
          </div>
          <span class="badge ${won ? 'badge-win' : 'badge-loss'}">${won ? 'Victoria' : 'Derrota'}</span>
        </div>`;
    }
    recentEl.innerHTML = html;
  } else {
    recentEl.innerHTML = '';
  }
}

// ---- SEASONS ----
async function renderSeasons() {
  const seasons = await dbGetAll('seasons');
  const container = document.getElementById('seasonsList');
  if (seasons.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">No hay temporadas. ¡Crea la primera!</div></div>`;
    return;
  }
  let html = '';
  for (const s of seasons.reverse()) {
    const games = await dbGetByIndex('games', 'seasonId', s.id);
    const wins = games.filter(g => g.finished && g.homeScore > g.awayScore).length;
    html += `
      <div class="list-item">
        <div class="list-avatar">📅</div>
        <div class="list-info">
          <div class="list-name">${s.name}</div>
          <div class="list-sub">${games.length} partidos · ${wins} victorias</div>
        </div>
        <div class="list-actions">
          ${s.active ? '<span class="badge badge-active">Activa</span>' : `<button class="btn btn-secondary btn-sm" onclick="setActiveSeason(${s.id})">Activar</button>`}
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSeason(${s.id})">🗑</button>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

function showSeasonModal(season = null) {
  openModal(`
    <div class="modal-title">${season ? 'Editar' : 'Nueva'} Temporada</div>
    <div class="form-group">
      <label class="form-label">Nombre de la temporada</label>
      <input class="form-input" id="seasonName" placeholder="Ej: Temporada 2025-26" value="${season?.name || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción (opcional)</label>
      <input class="form-input" id="seasonDesc" placeholder="Liga local..." value="${season?.description || ''}">
    </div>
    <button class="btn btn-primary btn-full" onclick="saveSeason(${season?.id || null})">Guardar</button>
  `);
}

async function saveSeason(id) {
  const name = document.getElementById('seasonName').value.trim();
  if (!name) { showToast('Escribe un nombre'); return; }
  const seasons = await dbGetAll('seasons');
  const isFirst = seasons.length === 0 && !id;
  await dbPut('seasons', { id: id || undefined, name, description: document.getElementById('seasonDesc').value, active: isFirst || (id && (await dbGet('seasons', id))?.active) });
  closeModal();
  showToast(id ? 'Temporada actualizada' : 'Temporada creada');
  renderSeasons();
  renderHome();
}

async function setActiveSeason(id) {
  const seasons = await dbGetAll('seasons');
  for (const s of seasons) { await dbPut('seasons', {...s, active: s.id === id}); }
  showToast('Temporada activada');
  renderSeasons();
  renderHome();
}

async function deleteSeason(id) {
  if (!confirm('¿Eliminar esta temporada y todos sus datos?')) return;
  await dbDelete('seasons', id);
  showToast('Temporada eliminada');
  renderSeasons();
  renderHome();
}

// ---- TEAMS ----
async function renderTeams() {
  const seasons = await dbGetAll('seasons');
  activeSeason = seasons.find(s => s.active) || seasons[seasons.length - 1] || null;
  const container = document.getElementById('teamsList');

  if (!activeSeason) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Crea una temporada primero</div></div>`;
    return;
  }

  const teams = await dbGetByIndex('teams', 'seasonId', activeSeason.id);
  let html = `<div class="section-header"><span class="section-title">${activeSeason.name}</span></div>`;
  if (teams.length === 0) {
    html += `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No hay equipos. ¡Añade el primero!</div></div>`;
  } else {
    for (const t of teams) {
      const players = await dbGetByIndex('players', 'teamId', t.id);
      html += `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${t.name}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="showPlayerModal(null,${t.id})">+ Jugador</button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteTeam(${t.id})">🗑</button>
            </div>
          </div>
          <div id="players-${t.id}">
            ${players.length === 0 ? '<div style="color:var(--text2);font-size:13px;text-align:center;padding:8px">Sin jugadores</div>' :
              players.map(p => `
                <div class="list-item" style="margin-bottom:6px">
                  <div class="list-avatar" style="font-size:14px">#${p.number}</div>
                  <div class="list-info">
                    <div class="list-name">${p.name}</div>
                    <div class="list-sub">${p.position || 'Sin posición'}</div>
                  </div>
                  <button class="btn btn-danger btn-sm btn-icon" onclick="deletePlayer(${p.id},${t.id})">🗑</button>
                </div>`).join('')}
          </div>
        </div>`;
    }
  }
  container.innerHTML = html;
}

function showTeamModal() {
  if (!activeSeason) { showToast('Crea una temporada primero'); return; }
  openModal(`
    <div class="modal-title">Nuevo Equipo</div>
    <div class="form-group">
      <label class="form-label">Nombre del equipo</label>
      <input class="form-input" id="teamName" placeholder="Ej: Los Tigres">
    </div>
    <button class="btn btn-primary btn-full" onclick="saveTeam()">Guardar</button>
  `);
}

async function saveTeam() {
  const name = document.getElementById('teamName').value.trim();
  if (!name) { showToast('Escribe un nombre'); return; }
  await dbPut('teams', { name, seasonId: activeSeason.id });
  closeModal();
  showToast('Equipo creado');
  renderTeams();
}

async function deleteTeam(id) {
  if (!confirm('¿Eliminar este equipo y sus jugadores?')) return;
  const players = await dbGetByIndex('players', 'teamId', id);
  for (const p of players) await dbDelete('players', p.id);
  await dbDelete('teams', id);
  showToast('Equipo eliminado');
  renderTeams();
}

function showPlayerModal(player, teamId) {
  openModal(`
    <div class="modal-title">${player ? 'Editar' : 'Nuevo'} Jugador</div>
    <div class="two-col">
      <div class="form-group">
        <label class="form-label">Nombre</label>
        <input class="form-input" id="playerName" placeholder="Nombre" value="${player?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Dorsal</label>
        <input class="form-input" id="playerNumber" type="number" placeholder="7" value="${player?.number || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Posición</label>
      <select class="form-select" id="playerPosition">
        <option value="">Sin posición</option>
        <option value="Base" ${player?.position==='Base'?'selected':''}>Base</option>
        <option value="Escolta" ${player?.position==='Escolta'?'selected':''}>Escolta</option>
        <option value="Alero" ${player?.position==='Alero'?'selected':''}>Alero</option>
        <option value="Ala-Pívot" ${player?.position==='Ala-Pívot'?'selected':''}>Ala-Pívot</option>
        <option value="Pívot" ${player?.position==='Pívot'?'selected':''}>Pívot</option>
      </select>
    </div>
    <button class="btn btn-primary btn-full" onclick="savePlayer(${player?.id || null}, ${teamId})">Guardar</button>
  `);
}

async function savePlayer(id, teamId) {
  const name = document.getElementById('playerName').value.trim();
  const number = document.getElementById('playerNumber').value;
  if (!name) { showToast('Escribe el nombre'); return; }
  await dbPut('players', { id: id || undefined, name, number: number || '0', position: document.getElementById('playerPosition').value, teamId });
  closeModal();
  showToast(id ? 'Jugador actualizado' : 'Jugador añadido');
  renderTeams();
}

async function deletePlayer(id, teamId) {
  await dbDelete('players', id);
  showToast('Jugador eliminado');
  renderTeams();
}

// ---- LIVE GAME ----
async function showGameSetup() {
  const seasons = await dbGetAll('seasons');
  activeSeason = seasons.find(s => s.active) || seasons[seasons.length - 1];
  if (!activeSeason) { showToast('Crea una temporada primero'); return; }
  const teams = await dbGetByIndex('teams', 'seasonId', activeSeason.id);
  if (teams.length < 2) { showToast('Necesitas al menos 2 equipos'); return; }

  const teamOpts = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  openModal(`
    <div class="modal-title">Configurar Partido</div>
    <div class="form-group">
      <label class="form-label">Equipo Local</label>
      <select class="form-select" id="homeTeamSel">${teamOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Equipo Visitante</label>
      <select class="form-select" id="awayTeamSel">${teamOpts}</select>
    </div>
    <button class="btn btn-primary btn-full" onclick="startGame()">Iniciar Partido</button>
  `);
}

async function startGame() {
  const homeId = parseInt(document.getElementById('homeTeamSel').value);
  const awayId = parseInt(document.getElementById('awayTeamSel').value);
  if (homeId === awayId) { showToast('Selecciona equipos diferentes'); return; }
  
  const homePlayers = await dbGetByIndex('players', 'teamId', homeId);
  const awayPlayers = await dbGetByIndex('players', 'teamId', awayId);
  
  const gameId = await dbPut('games', {
    homeTeamId: homeId, awayTeamId: awayId,
    homeScore: 0, awayScore: 0,
    quarter: 1, finished: false,
    seasonId: activeSeason.id,
    date: new Date().toISOString()
  });

  liveGame = {
    gameId, homeTeamId: homeId, awayTeamId: awayId,
    homeScore: 0, awayScore: 0, quarter: 1,
    homePlayers, awayPlayers, stats: {},
    activeTeam: 'home'
  };

  // Initialize stats
  [...homePlayers, ...awayPlayers].forEach(p => {
    liveGame.stats[p.id] = { pts2m:0, pts2a:0, pts3m:0, pts3a:0, ftm:0, fta:0, reb:0, ast:0, stl:0, blk:0, tov:0, foul:0 };
  });

  closeModal();
  renderLive();
}

function renderLive() {
  const container = document.getElementById('liveGameContent');
  if (!liveGame) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏀</div>
        <div class="empty-text">No hay partido en curso</div>
        <br>
        <button class="btn btn-primary" onclick="showGameSetup()">Nuevo Partido</button>
      </div>`;
    return;
  }

  const g = liveGame;
  const teams = { home: null, away: null };
  
  async function buildLive() {
    teams.home = await dbGet('teams', g.homeTeamId);
    teams.away = await dbGet('teams', g.awayTeamId);
    
    const allPlayers = g.activeTeam === 'home' ? g.homePlayers : g.awayPlayers;
    const selectedStats = selectedPlayer ? g.stats[selectedPlayer.id] : null;

    const quarterDots = [1,2,3,4].map(q => `
      <div class="q-dot ${g.quarter === q ? 'active' : g.quarter > q ? 'done' : ''}" onclick="setQuarter(${q})">${q}</div>
    `).join('');

    const playerChips = allPlayers.map(p => `
      <div class="player-chip ${selectedPlayer?.id === p.id ? 'selected' : ''}" onclick="selectPlayer(${p.id})">
        #${p.number} ${p.name.split(' ')[0]}
      </div>
    `).join('');

    const statsHTML = selectedStats ? `
      <div class="stat-buttons">
        <div class="stat-btn pts2" onclick="recordStat('pts2m')"><div class="stat-btn-num">2P ✓</div><div class="stat-btn-lbl">+2 Enc.</div></div>
        <div class="stat-btn pts3" onclick="recordStat('pts3m')"><div class="stat-btn-num">3P ✓</div><div class="stat-btn-lbl">+3 Enc.</div></div>
        <div class="stat-btn ft" onclick="recordStat('ftm')"><div class="stat-btn-num">TL ✓</div><div class="stat-btn-lbl">+1 Enc.</div></div>
        <div class="stat-btn miss2" onclick="recordStat('pts2a')"><div class="stat-btn-num">2P ✗</div><div class="stat-btn-lbl">Fallado</div></div>
        <div class="stat-btn miss3" onclick="recordStat('pts3a')"><div class="stat-btn-num">3P ✗</div><div class="stat-btn-lbl">Fallado</div></div>
        <div class="stat-btn ftmiss" onclick="recordStat('fta')"><div class="stat-btn-num">TL ✗</div><div class="stat-btn-lbl">Fallado</div></div>
        <div class="stat-btn reb" onclick="recordStat('reb')"><div class="stat-btn-num">REB</div><div class="stat-btn-lbl">Rebote</div></div>
        <div class="stat-btn ast" onclick="recordStat('ast')"><div class="stat-btn-num">AST</div><div class="stat-btn-lbl">Asistencia</div></div>
        <div class="stat-btn stl" onclick="recordStat('stl')"><div class="stat-btn-num">ROB</div><div class="stat-btn-lbl">Robo</div></div>
        <div class="stat-btn blk" onclick="recordStat('blk')"><div class="stat-btn-num">TAP</div><div class="stat-btn-lbl">Tapón</div></div>
        <div class="stat-btn tov" onclick="recordStat('tov')"><div class="stat-btn-num">PER</div><div class="stat-btn-lbl">Pérdida</div></div>
        <div class="stat-btn foul" onclick="recordStat('foul')"><div class="stat-btn-num">FALT</div><div class="stat-btn-lbl">Falta</div></div>
      </div>
    ` : `<div style="text-align:center;color:var(--text2);padding:16px;font-size:14px">Selecciona un jugador para registrar estadísticas</div>`;

    const playerStatsRow = selectedStats ? `
      <div class="stat-grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:12px">
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.pts2m*2 + selectedStats.pts3m*3 + selectedStats.ftm}</div><div class="stat-lbl">PTS</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.reb}</div><div class="stat-lbl">REB</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.ast}</div><div class="stat-lbl">AST</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.stl}</div><div class="stat-lbl">ROB</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.blk}</div><div class="stat-lbl">TAP</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:18px">${selectedStats.tov}</div><div class="stat-lbl">PER</div></div>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="score-display">
        <div class="score-team">
          <div class="score-name">${teams.home?.name || 'Local'}</div>
          <div class="score-pts score-home">${g.homeScore}</div>
        </div>
        <div class="score-sep">:</div>
        <div class="score-team">
          <div class="score-name">${teams.away?.name || 'Visitante'}</div>
          <div class="score-pts score-away">${g.awayScore}</div>
        </div>
      </div>
      
      <div class="quarters">${quarterDots}</div>

      <div class="chip-row">
        <div class="chip ${g.activeTeam==='home'?'active':''}" onclick="setActiveTeam('home')">${teams.home?.name || 'Local'}</div>
        <div class="chip ${g.activeTeam==='away'?'active':''}" onclick="setActiveTeam('away')">${teams.away?.name || 'Visitante'}</div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-title" style="margin-bottom:10px">Seleccionar Jugador</div>
        <div class="player-selector">${playerChips || '<div style="color:var(--text2);font-size:13px">No hay jugadores en este equipo</div>'}</div>
        ${playerStatsRow}
      </div>

      ${statsHTML}

      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-full" onclick="undoLastStat()">↩ Deshacer</button>
        <button class="btn btn-success btn-full" onclick="finishGame()">Finalizar Partido</button>
      </div>
    `;
  }
  
  buildLive();
}

function setActiveTeam(team) {
  liveGame.activeTeam = team;
  selectedPlayer = null;
  renderLive();
}

function setQuarter(q) {
  liveGame.quarter = q;
  renderLive();
}

function selectPlayer(id) {
  const allPlayers = [...liveGame.homePlayers, ...liveGame.awayPlayers];
  selectedPlayer = allPlayers.find(p => p.id === id) || null;
  renderLive();
}

let lastStat = null;

async function recordStat(statKey) {
  if (!selectedPlayer) { showToast('Selecciona un jugador'); return; }
  const isHome = liveGame.homePlayers.some(p => p.id === selectedPlayer.id);
  
  liveGame.stats[selectedPlayer.id][statKey]++;
  
  // Update score
  if (statKey === 'pts2m') { if (isHome) liveGame.homeScore += 2; else liveGame.awayScore += 2; }
  if (statKey === 'pts3m') { if (isHome) liveGame.homeScore += 3; else liveGame.awayScore += 3; }
  if (statKey === 'ftm') { if (isHome) liveGame.homeScore += 1; else liveGame.awayScore += 1; }

  lastStat = { playerId: selectedPlayer.id, statKey, isHome, scored: ['pts2m','pts3m','ftm'].includes(statKey) };

  // Save to DB
  await dbPut('games', {
    id: liveGame.gameId, homeTeamId: liveGame.homeTeamId, awayTeamId: liveGame.awayTeamId,
    homeScore: liveGame.homeScore, awayScore: liveGame.awayScore,
    quarter: liveGame.quarter, finished: false, seasonId: activeSeason.id,
    date: (await dbGet('games', liveGame.gameId)).date
  });

  renderLive();
}

async function undoLastStat() {
  if (!lastStat) { showToast('Nada que deshacer'); return; }
  const { playerId, statKey, isHome } = lastStat;
  if (liveGame.stats[playerId][statKey] > 0) {
    liveGame.stats[playerId][statKey]--;
    if (statKey === 'pts2m') { if (isHome) liveGame.homeScore -= 2; else liveGame.awayScore -= 2; }
    if (statKey === 'pts3m') { if (isHome) liveGame.homeScore -= 3; else liveGame.awayScore -= 3; }
    if (statKey === 'ftm') { if (isHome) liveGame.homeScore -= 1; else liveGame.awayScore -= 1; }
  }
  lastStat = null;
  await dbPut('games', {
    id: liveGame.gameId, homeTeamId: liveGame.homeTeamId, awayTeamId: liveGame.awayTeamId,
    homeScore: liveGame.homeScore, awayScore: liveGame.awayScore,
    quarter: liveGame.quarter, finished: false, seasonId: activeSeason.id,
    date: (await dbGet('games', liveGame.gameId)).date
  });
  showToast('Acción deshecha');
  renderLive();
}

async function finishGame() {
  if (!confirm('¿Finalizar el partido?')) return;
  
  // Save all stats
  const allPlayers = [...liveGame.homePlayers, ...liveGame.awayPlayers];
  for (const p of allPlayers) {
    const s = liveGame.stats[p.id];
    await dbPut('stats', {
      gameId: liveGame.gameId, playerId: p.id, teamId: p.teamId,
      pts: s.pts2m*2 + s.pts3m*3 + s.ftm,
      pts2m: s.pts2m, pts2a: s.pts2a, pts3m: s.pts3m, pts3a: s.pts3a,
      ftm: s.ftm, fta: s.fta, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, foul: s.foul
    });
  }

  const gameData = await dbGet('games', liveGame.gameId);
  await dbPut('games', { ...gameData, homeScore: liveGame.homeScore, awayScore: liveGame.awayScore, finished: true, quarter: liveGame.quarter });
  
  const gameId = liveGame.gameId;
  liveGame = null;
  selectedPlayer = null;
  showToast('Partido finalizado');
  switchPage('history');
  setTimeout(() => showGameSummary(gameId), 300);
}

// ---- HISTORY ----
async function renderHistory() {
  const seasons = await dbGetAll('seasons');
  activeSeason = seasons.find(s => s.active) || seasons[seasons.length - 1] || null;
  const container = document.getElementById('historyList');

  const allGames = await dbGetAll('games');
  const finished = allGames.filter(g => g.finished).reverse();
  
  if (finished.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">No hay partidos finalizados</div></div>`;
    return;
  }

  const allTeams = await dbGetAll('teams');
  let html = '';
  for (const g of finished) {
    const homeTeam = allTeams.find(t => t.id === g.homeTeamId);
    const awayTeam = allTeams.find(t => t.id === g.awayTeamId);
    const won = g.homeScore > g.awayScore;
    html += `
      <div class="list-item" onclick="showGameSummary(${g.id})">
        <div class="list-avatar" style="font-size:13px;font-weight:800">${g.homeScore}-${g.awayScore}</div>
        <div class="list-info">
          <div class="list-name">${homeTeam?.name || '?'} vs ${awayTeam?.name || '?'}</div>
          <div class="list-sub">${new Date(g.date).toLocaleDateString('es-ES')} · Q${g.quarter}</div>
        </div>
        <span class="badge ${won ? 'badge-win' : 'badge-loss'}">${won ? 'Victoria' : 'Derrota'}</span>
      </div>`;
  }
  container.innerHTML = html;
}

async function showGameSummary(gameId) {
  const game = await dbGet('games', gameId);
  if (!game) return;
  const homeTeam = await dbGet('teams', game.homeTeamId);
  const awayTeam = await dbGet('teams', game.awayTeamId);
  const stats = await dbGetByIndex('stats', 'gameId', gameId);
  const homePlayers = await dbGetByIndex('players', 'teamId', game.homeTeamId);
  const awayPlayers = await dbGetByIndex('players', 'teamId', game.awayTeamId);
  const won = game.homeScore > game.awayScore;

  function buildTable(players) {
    if (!players.length) return '<div style="color:var(--text2);font-size:13px;text-align:center;padding:8px">Sin datos</div>';
    let rows = players.map(p => {
      const s = stats.find(st => st.playerId === p.id);
      if (!s) return '';
      return `<tr>
        <td>#${p.number} ${p.name}</td>
        <td>${s.pts}</td>
        <td>${s.pts2m}/${s.pts2m+s.pts2a}</td>
        <td>${s.pts3m}/${s.pts3m+s.pts3a}</td>
        <td>${s.ftm}/${s.ftm+s.fta}</td>
        <td>${s.reb}</td>
        <td>${s.ast}</td>
        <td>${s.stl}</td>
        <td>${s.blk}</td>
        <td>${s.tov}</td>
      </tr>`;
    }).join('');
    return `<div style="overflow-x:auto"><table class="summary-table">
      <tr><th>Jugador</th><th>PTS</th><th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>AST</th><th>ROB</th><th>TAP</th><th>PER</th></tr>
      ${rows}
    </table></div>`;
  }

  openModal(`
    <div class="modal-title">Resumen del Partido</div>
    <div class="score-display" style="margin-bottom:12px">
      <div class="score-team">
        <div class="score-name">${homeTeam?.name || 'Local'}</div>
        <div class="score-pts score-home">${game.homeScore}</div>
      </div>
      <div class="score-sep">:</div>
      <div class="score-team">
        <div class="score-name">${awayTeam?.name || 'Visitante'}</div>
        <div class="score-pts score-away">${game.awayScore}</div>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <span class="badge ${won ? 'badge-win' : 'badge-loss'}" style="font-size:14px;padding:6px 16px">${won ? '🏆 Victoria' : '💔 Derrota'}</span>
      <span style="color:var(--text2);font-size:13px;margin-left:8px">${new Date(game.date).toLocaleDateString('es-ES')}</span>
    </div>
    <div class="card-title" style="margin-bottom:8px">${homeTeam?.name || 'Local'}</div>
    ${buildTable(homePlayers)}
    <div class="divider"></div>
    <div class="card-title" style="margin-bottom:8px">${awayTeam?.name || 'Visitante'}</div>
    ${buildTable(awayPlayers)}
    <div style="margin-top:16px">
      <button class="btn btn-danger btn-full" onclick="deleteGame(${gameId})">Eliminar Partido</button>
    </div>
  `);
}

async function deleteGame(id) {
  if (!confirm('¿Eliminar este partido?')) return;
  const stats = await dbGetByIndex('stats', 'gameId', id);
  for (const s of stats) await dbDelete('stats', s.id);
  await dbDelete('games', id);
  closeModal();
  showToast('Partido eliminado');
  renderHistory();
  renderHome();
}

// ---- INIT ----
async function init() {
  await initDB();
  await renderHome();
}

init();
