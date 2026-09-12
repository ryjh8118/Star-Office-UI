/* Renguin read-only workflow projection for Star Office. */
(() => {
  const areaMeta = {
    research_area: ['資料研究', '12%', '20%'],
    director_area: ['導演決策', '36%', '20%'],
    editing_area: ['剪輯執行', '60%', '20%'],
    sync_area: ['儲存同步', '84%', '20%'],
    maintenance_area: ['檢查修復', '72%', '70%'],
    rest_area: ['等待／休息', '25%', '70%']
  };

  const roster = [
    { key:'renguin', name: '企鵝 Renguin', duty: '主控／導演', asset: '/static/renguin-characters/director/renguin.png' },
    { key:'xuebao', name: '雪寶 Xuebao', duty: '檢查／挑錯', asset: '/static/renguin-characters/scanner/xuebao.png' },
    { key:'dola', name: '哆啦 Dola', duty: '剪輯／同步', asset: '/static/renguin-characters/editor/dola.png' }
  ];

  function addStyles() {
    if (document.getElementById('renguin-office-styles')) return;
    const style = document.createElement('style');
    style.id = 'renguin-office-styles';
    style.textContent = `
      #control-buttons { display: none !important; }
      #control-bar { display:none !important; }
      #lang-toggle-group { display:none !important; }
      #control-bar-title { display:none !important; }
      #status-text { display:none !important; }
      #renguin-workflow-panel { position:relative; z-index:50; box-sizing:border-box; width:calc(100% - 24px); margin:8px 12px; color:#e5e7eb; background:rgba(15,23,42,.96); border:1px solid rgba(250,204,21,.38); border-radius:10px; font:12px/1.4 system-ui,sans-serif; padding:10px; }
      #renguin-workflow-panel .rw-title { color:#fef08a; font-weight:800; margin:0 0 7px; }
      #renguin-workflow-panel .rw-sync { margin:0 0 7px; color:#bbf7d0; }
      #renguin-workflow-panel .rw-sync.is-stale { color:#fda4af; font-weight:700; }
      #renguin-workflow-panel .rw-section-title { color:#cbd5e1; font-weight:700; margin:9px 0 5px; }
      #renguin-workflow-panel .rw-scroll-hint { margin:-2px 0 7px; color:#93c5fd; font-weight:700; }
      #renguin-workflow-panel .rw-project-grid { display:grid; grid-template-columns:1fr; gap:7px; max-height:min(62vh,620px); overflow-y:scroll; overflow-x:hidden; scrollbar-gutter:stable; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; padding-right:8px; }
      #renguin-workflow-panel .rw-project-grid:focus-visible { outline:2px solid #60a5fa; outline-offset:3px; }
      #renguin-workflow-panel .rw-project-grid::-webkit-scrollbar { width:14px; }
      #renguin-workflow-panel .rw-project-grid::-webkit-scrollbar-track { background:rgba(15,23,42,.88); border-radius:10px; }
      #renguin-workflow-panel .rw-project-grid::-webkit-scrollbar-thumb { background:#60a5fa; border:3px solid rgba(15,23,42,.88); border-radius:10px; }
      #renguin-workflow-panel .rw-project-group-title { position:sticky; top:0; z-index:2; padding:7px 9px; border:1px solid rgba(148,163,184,.32); border-radius:8px; color:#e2e8f0; background:#172033; font-weight:900; box-shadow:0 3px 8px rgba(2,6,23,.55); }
      #renguin-workflow-panel .rw-project-group-title.is-yt { color:#fff7ed; border-color:rgba(251,146,60,.72); background:#7c2d12; }
      #renguin-workflow-panel .rw-project-group-title.is-local { color:#dcfce7; border-color:rgba(74,222,128,.55); background:#14532d; }
      #renguin-workflow-panel .rw-project-group-title.is-cloud { color:#dbeafe; border-color:rgba(96,165,250,.6); background:#1e3a8a; }
      #renguin-workflow-panel .rw-project { min-width:0; padding:7px 8px; border:1px solid rgba(148,163,184,.24); border-radius:8px; background:rgba(30,41,59,.78); }
      #renguin-workflow-panel .rw-project.is-yt { border-color:rgba(251,146,60,.5); background:rgba(124,45,18,.38); }
      #renguin-workflow-panel .rw-project.is-local { border-left:4px solid #4ade80; }
      #renguin-workflow-panel .rw-project.is-cloud { border-left:4px solid #60a5fa; }
      #renguin-workflow-panel .rw-project-heading { display:flex; align-items:center; gap:7px; min-width:0; }
      #renguin-workflow-panel .rw-project-name { flex:1; min-width:0; color:#fff; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #renguin-workflow-panel .rw-origin-badge { flex:none; padding:2px 6px; border-radius:999px; font-size:11px; font-weight:900; }
      #renguin-workflow-panel .rw-origin-badge.is-local { color:#dcfce7; background:rgba(20,83,45,.85); border:1px solid rgba(74,222,128,.55); }
      #renguin-workflow-panel .rw-origin-badge.is-cloud { color:#dbeafe; background:rgba(30,58,138,.85); border:1px solid rgba(96,165,250,.6); }
      #renguin-workflow-panel .rw-project-meta { color:#cbd5e1; margin-top:3px; overflow-wrap:anywhere; }
      #renguin-workflow-panel .rw-project-task { color:#fef3c7; margin-top:4px; font-weight:700; overflow-wrap:anywhere; }
      #renguin-workflow-panel .rw-project-release { color:#fdba74; margin-top:4px; font-weight:700; }
      #renguin-workflow-panel .rw-task-grid { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
      #renguin-workflow-panel .rw-task-chip { padding:3px 6px; border-radius:6px; color:#cbd5e1; background:rgba(51,65,85,.75); border:1px solid rgba(148,163,184,.24); }
      #renguin-workflow-panel .rw-task-chip.is-completed { color:#bbf7d0; border-color:rgba(74,222,128,.42); background:rgba(20,83,45,.45); }
      #renguin-workflow-panel .rw-task-chip.is-verified { color:#bbf7d0; border-color:rgba(74,222,128,.42); background:rgba(20,83,45,.45); }
      #renguin-workflow-panel .rw-task-chip.is-running { color:#fef08a; border-color:rgba(250,204,21,.48); background:rgba(113,63,18,.45); }
      #renguin-workflow-panel .rw-task-chip.is-partial { color:#fed7aa; border-color:rgba(251,146,60,.48); background:rgba(124,45,18,.42); }
      #renguin-workflow-panel .rw-task-chip.is-blocked, #renguin-workflow-panel .rw-task-chip.is-blocked-external, #renguin-workflow-panel .rw-task-chip.is-failed, #renguin-workflow-panel .rw-task-chip.is-invalidated { color:#fecaca; border-color:rgba(248,113,113,.5); background:rgba(127,29,29,.45); }
      #renguin-workflow-panel .rw-task-chip.is-not-started { color:#94a3b8; }
      #renguin-workflow-panel .rw-role-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
      #renguin-workflow-panel .rw-role { min-width:0; display:grid; grid-template-columns:52px 1fr; gap:7px; padding:8px; border:1px solid rgba(250,204,21,.2); border-radius:9px; background:rgba(30,41,59,.72); }
      #renguin-workflow-panel .rw-role img { width:48px; height:48px; object-fit:contain; filter:drop-shadow(0 3px 3px rgba(0,0,0,.45)); }
      #renguin-workflow-panel .rw-role-name { color:#fef08a; font-weight:800; }
      #renguin-workflow-panel .rw-role-state { color:#93c5fd; font-weight:700; }
      #renguin-workflow-panel .rw-role.is-thinking .rw-role-state { color:#fbbf24; }
      #renguin-workflow-panel .rw-role.is-overdue .rw-role-state { color:#fb7185; }
      #renguin-workflow-panel .rw-role-detail { grid-column:1/-1; color:#e2e8f0; overflow-wrap:anywhere; }
      #renguin-achievement-wall { position:relative; z-index:50; box-sizing:border-box; width:calc(100% - 24px); margin:8px 12px; padding:8px; display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; background:rgba(15,23,42,.96); border:1px solid rgba(250,204,21,.38); border-radius:10px; }
      #renguin-achievement-wall:empty { display:none; }
      #renguin-achievement-wall img { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:7px; background:#020617; box-shadow:0 3px 10px rgba(0,0,0,.45); transition:transform .18s ease,box-shadow .18s ease; }
      #renguin-achievement-wall img:hover { transform:scale(1.025); box-shadow:0 6px 18px rgba(250,204,21,.22); }
      @media (max-width:760px) { #renguin-workflow-panel .rw-project-grid, #renguin-workflow-panel .rw-role-grid { grid-template-columns:1fr; } }
      .renguin-scene-character { position:absolute; transform:translate(-50%,-50%); transition:left .42s linear,top .42s linear,opacity .4s ease,filter .4s ease; text-align:center; animation:renguin-bob 1.8s ease-in-out infinite; }
      .renguin-scene-character:nth-of-type(2) { animation-delay:.25s; }
      .renguin-scene-character:nth-of-type(3) { animation-delay:.5s; }
      .renguin-scene-character img { display:block; width:76px; height:76px; object-fit:contain; filter:drop-shadow(0 5px 4px rgba(0,0,0,.45)); }
      .renguin-scene-character .rsc-label { display:inline-block; margin-top:-3px; padding:2px 6px; border-radius:8px; color:#fff; background:rgba(15,23,42,.82); font:11px/1.25 system-ui,sans-serif; white-space:nowrap; }
      .renguin-scene-character.is-waiting { opacity:.76; filter:saturate(.72); }
      .renguin-scene-character.is-working .rsc-label { color:#fef08a; border:1px solid rgba(250,204,21,.55); }
      .renguin-scene-character.is-walking { animation:none; }
      .renguin-scene-character.is-walking img { animation:renguin-step .44s ease-in-out infinite; }
      @keyframes renguin-bob { 0%,100%{margin-top:0} 50%{margin-top:-7px} }
      @keyframes renguin-step { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-5px) rotate(2deg)} }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    addStyles();
    const host = document.body;
    let panel = document.getElementById('renguin-workflow-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'renguin-workflow-panel';
      const map = document.getElementById('game-container');
      if (window.CreatorOffice) host.appendChild(panel);
      else if (map && map.parentElement) map.insertAdjacentElement('afterend', panel);
      else host.appendChild(panel);
    }
    return panel;
  }

  function ensureAchievementWall() {
    let wall = document.getElementById('renguin-achievement-wall');
    if (!wall) {
      wall = document.createElement('div');
      wall.id = 'renguin-achievement-wall';
      ensurePanel().insertAdjacentElement('afterend', wall);
    }
    return wall;
  }

  function renderAchievements(items) {
    const wall = ensureAchievementWall();
    const sources = (Array.isArray(items) ? items : []).map(item => item && item.src).filter(Boolean);
    const current = [...wall.querySelectorAll('img')].map(img => img.getAttribute('src'));
    if (sources.length === current.length && sources.every((src, index) => src === current[index])) return;
    wall.replaceChildren();
    sources.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      wall.appendChild(img);
    });
  }

  function pollAchievements() {
    if (window.CreatorOffice) return;
    originalFetch(`/static/renguin-achievements.json?t=${Date.now()}`, {cache:'no-store'})
      .then(response => response.ok ? response.json() : [])
      .then(renderAchievements)
      .catch(() => renderAchievements([]));
  }

  function text(value, fallback = '—') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function progressText(value) {
    return typeof value === 'number' ? `${Math.round(value)}%` : 'UNKNOWN';
  }

  function hasNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function secondsSince(value) {
    const ms = Date.parse(value || '');
    return Number.isFinite(ms) ? (Date.now() - ms) / 1000 : null;
  }

  function durationText(seconds) {
    if (!Number.isFinite(seconds)) return 'UNKNOWN';
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分鐘`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小時 ${minutes % 60} 分鐘`;
  }

  function shortText(value, max = 28) {
    const valueText = text(value);
    return valueText.length > max ? `${valueText.slice(0, max - 1)}…` : valueText;
  }

  function canonicalProjectName(value) {
    let name = text(value, '').trim();
    name = name.replace(/^\d{8}[_\- ]*/, '').replace(/^本地[_\- ]*/, '').replace(/^YT(?:\s*[｜|_\-]\s*|\s*)/iu, '');
    name = name.replace(/專案$/u, '').replace(/跟哆啦$/u, '').replace(/REEL\s*\d*支?$/iu, '').trim();
    if (/這是誰的過去/u.test(name)) return '鵝這是誰的過去';
    if (/鵝想跟你唱/u.test(name)) return '鵝想跟你唱';
    return name;
  }

  function isContentProject(item) {
    const name = canonicalProjectName(item && item.project_name);
    if (!name) return false;
    return !/(Star Office|RENGUIN 辦公室|安全清理|連線測試|NATIVE COPY TEST|環境檢查|PRE-FLIGHT)/iu.test(name);
  }

  function shortDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分`;
    return `${Math.floor(minutes / 60)}時${minutes % 60}分`;
  }

  function friendlyAction(value) {
    const raw = text(value);
    const known = {
      'E0-VIDEO_SCAN_AND_INDEX': '掃描素材',
      'E1-TRANSCRIPT_AND_SRT': '逐字稿／字幕',
      'E2-DIRECTOR_AND_EDIT_PLAN': '導演規劃',
      'E3-AUTOMATIC_EDITING_ROUGH_CUT': '自動剪輯',
      'E3b-MARKER_PLACEMENT_29': '放置標記',
      'E4-FINISHING_DECISIONS': '後製決策',
      'E5-HUMAN_REVIEW_5_ITEMS': '人工審查',
      'E6-READBACK_AND_CORRECTION': 'READBACK 修正',
      'E7-EDITORIAL_ROUNDTRIP_AND_DELIVERY': '回寫／交付'
    };
    return known[raw] || shortText(raw, 22);
  }

  function roleForSource(source) {
    if (source === 'Codex') return {key:'renguin', name:'企鵝'};
    if (source === 'Bionic') return {key:'xuebao', name:'雪寶'};
    return {key:'dola', name:'哆啦'};
  }

  function sourceLabel(source) {
    if (source === 'Codex') return 'ChatGPT／Codex 雲端';
    if (source === 'Bionic') return 'Bionic 本地 AI';
    if (source === 'Content OS') return 'Content OS 本機流程';
    return source || '來源未回報';
  }

  function projectOrigin(item) {
    const source = text(item && item.source, '').toUpperCase();
    const executor = text(item && item.executor, '').toUpperCase();
    return /(CODEX|CHATGPT|OPENAI)/u.test(`${source} ${executor}`) ? 'cloud' : 'local';
  }

  function isYTProject(item) {
    const name = canonicalProjectName(item && item.project_name);
    const raw = [item && item.project_name, item && item.workspace, item && item.project_id].filter(Boolean).join(' ');
    return Boolean(item && item.release_date)
      || text(item && item.project_type, '').toUpperCase() === 'VIDEO_PROJECT'
      || /(^|[\s｜|_\-])YT(?:[\s｜|_\-]|鵝)/iu.test(raw)
      || /(暈船故事|鵝這是誰的過去|鵝想跟你唱)/u.test(name);
  }

  function projectGroup(item) {
    return isYTProject(item) ? 'yt' : projectOrigin(item);
  }

  const projectGroupMeta = {
    yt:{label:'YT 真正企劃案', icon:'▶'},
    local:{label:'本地執行／系統', icon:'▣'},
    cloud:{label:'雲端工作', icon:'☁'}
  };

  // A bridge process can restamp its own poll time forever while the session
  // underneath it never moves. "Still working" must be judged against the
  // session's own last reported update, not against how recently we last asked.
  const STALE_AFTER_SECONDS = 1800;
  function isStale(status) {
    return Boolean(status && status.working) &&
      !window.RenguinFreshness.inspect(status.session_updated_at, STALE_AFTER_SECONDS).fresh;
  }
  function lastReportedText(status) {
    const value = status && status.session_updated_at;
    const epoch = value && window.RenguinFreshness.epoch(value);
    if (!Number.isFinite(epoch)) return '最後回報時間未知';
    const date = new Date(epoch * 1000);
    return `最後回報 ${date.getMonth() + 1}/${date.getDate()}`;
  }

  function workerStatus(unit) {
    if (isStale(unit)) return `卡住／逾時｜${lastReportedText(unit)}`;
    const action = friendlyAction(String(unit.action || '處理目前任務').replace(/^(思考過久|持續思考中)[：:]\s*/, ''));
    const elapsed = hasNumber(unit.elapsed_seconds) ? durationText(Math.max(0, Math.round(Number(unit.elapsed_seconds)))) : '未回報';
    return `活動回報：${action}｜紀錄 ${elapsed}`;
  }

  function projectStatus(item, includeName = true) {
    const name = shortText(item.project_name || '未命名專案', 20);
    const prefix = includeName ? `${name}｜` : '';
    const state = item.working ? '執行中' : '等待／已停止';
    if (!item.working) {
      const age = secondsSince(item.updated_at);
      return `${prefix}${state}｜最後更新 ${shortDuration(age)}前`;
    }
    return `${prefix}${state}｜${workerStatus(item)}`;
  }

  function selectRecentProjects(items) {
    const usable = (Array.isArray(items) ? items : []).filter(item => {
      const name = String(item.project_name || '');
      const identity = `${name} ${item.workspace || ''}`;
      const belongsToKnownProject = /鵝想跟你唱|鵝.*這是誰.*過去|這是誰的過去/.test(identity);
      return name && (belongsToKnownProject || !/guardian|snapshot|native copy test|premiere mcp.*test/i.test(name));
    });
    const selected = [];
    const add = item => {
      if (!item || selected.some(existing => String(existing.project_id) === String(item.project_id) && existing.source === item.source)) return;
      selected.push(item);
    };
    usable.forEach(add);
    return selected;
  }

  function roleSource(key) {
    if (key === 'renguin') return 'Codex';
    if (key === 'xuebao') return 'Bionic';
    return 'Content OS';
  }

  function roleState(status) {
    if (!status) return '目前無法確認';
    if (isStale(status)) return '卡住／逾時';
    const age=secondsSince(status.updated_at);
    if(!window.RenguinFreshness.inspect(status.updated_at,10).fresh)return '活動紀錄可能過期';
    return status.working ? '收到活動回報' : '上次活動已結束';
  }

  function roleDetail(status) {
    if (!status) return '等待活動來源回報';
    if (isStale(status)) return lastReportedText(status);
    const rawAction = String(status.action || status.current_action || (status.working ? '處理目前任務' : '目前沒有工作')).replace(/^(思考過久|持續思考中)[：:]\s*/, '');
    const action = friendlyAction(rawAction);
    const elapsedNumber = Number(status.thinking_seconds ?? status.elapsed_seconds);
    const elapsed = hasNumber(status.thinking_seconds ?? status.elapsed_seconds) ? durationText(Math.max(0, Math.round(elapsedNumber))) : '未回報';
    return status.working ? `活動回報：${action}｜紀錄 ${elapsed}` : `上次執行：${action}`;
  }

  function renderPanel(data) {
    const panel = ensurePanel();
    const statuses = Array.isArray(data?.renguin?.character_statuses) ? data.renguin.character_statuses : [];
    panel.replaceChildren();
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'rw-section-title';
    sectionTitle.textContent = '角色活動紀錄（即時工作以 Agent 工作租約為準）';
    panel.appendChild(sectionTitle);
    const roleGrid = document.createElement('div');
    roleGrid.className = 'rw-role-grid';
    roster.forEach(person => {
      const wanted = roleSource(person.key);
      const status = statuses.find(item => item.source === wanted);
      const state = roleState(status);
      const card = document.createElement('div');
      card.className = `rw-role${state.includes('思考') ? ' is-thinking' : ''}${/卡住|逾時/.test(state) ? ' is-overdue' : ''}`;
      const img = document.createElement('img');
      img.src = person.asset;
      img.alt = person.name;
      const summary = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'rw-role-name';
      name.textContent = person.name;
      const stateNode = document.createElement('div');
      stateNode.className = 'rw-role-state';
      stateNode.textContent = state;
      summary.append(name, stateNode);
      const detail = document.createElement('div');
      detail.className = 'rw-role-detail';
      detail.textContent = roleDetail(status);
      card.append(img, summary, detail);
      roleGrid.appendChild(card);
    });
    panel.appendChild(roleGrid);
  }

  function ensureLayer() {
    let layer = document.getElementById('renguin-office-layer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'renguin-office-layer';
    Object.assign(layer.style, {position:'absolute', inset:'0', pointerEvents:'none', zIndex:'3000'});
    const host = document.getElementById('game-container') || document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(layer);
    for (const [key, [label, left, top]] of Object.entries(areaMeta)) {
      if (key === 'rest_area') continue;
      const node = document.createElement('div');
      node.dataset.area = key;
      node.textContent = label;
      Object.assign(node.style, {position:'absolute', left, top, transform:'translate(-50%,-50%)', padding:'4px 8px', borderRadius:'8px', background:'rgba(15,23,42,.72)', color:'#cbd5e1', font:'12px sans-serif', border:'1px solid rgba(148,163,184,.35)'});
      layer.appendChild(node);
    }
    roster.forEach(person => {
      const avatar = document.createElement('div');
      avatar.id = `renguin-scene-${person.key}`;
      avatar.className = 'renguin-scene-character is-waiting';
      const img = document.createElement('img');
      img.src = person.asset;
      img.alt = person.name;
      const label = document.createElement('div');
      label.className = 'rsc-label';
      label.textContent = `${person.name.split(' ')[0]}｜待命`;
      avatar.append(img, label);
      layer.appendChild(avatar);
    });
    return layer;
  }

  let latestProjection = {};
  let latestStatus = {};
  let projectScrollTop = 0;
  let projectInteractionUntil = 0;
  const latestActivities = new Map();
  const activityHealth = new Map();
  let currentCommandKey = null;
  let activeRosterIndex = -1;
  const characterDestinations = {};
  const movementTokens = {};
  const characterAreas = {renguin:'rest_area', xuebao:'rest_area', dola:'rest_area'};
  const waiting = {
    renguin:['20%','62%'], xuebao:['34%','62%'], dola:['48%','62%']
  };
  const workTargets = {
    research_area:['14%','30%','資料研究'],
    director_area:['36%','30%','導演決策'],
    editing_area:['61%','30%','剪輯／後製執行'],
    sync_area:['83%','30%','儲存／同步'],
    maintenance_area:['72%','64%','檢查／修復'],
    rest_area:['20%','62%','休息']
  };
  const areaDoors = {
    research_area:['30%','46%'],
    director_area:['43%','46%'],
    editing_area:['60%','46%'],
    sync_area:['78%','46%'],
    maintenance_area:['70%','55%'],
    rest_area:['50%','70%']
  };

  function setCharacterPosition(node, point) {
    node.style.left = point[0];
    node.style.top = point[1];
  }

  function interpolateAxis(from, to, fixed, horizontal) {
    const start = Number.parseFloat(from);
    const end = Number.parseFloat(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const distance = end - start;
    const count = Math.max(1, Math.ceil(Math.abs(distance) / 3));
    return Array.from({length:count}, (_, index) => {
      const value = `${start + distance * ((index + 1) / count)}%`;
      return horizontal ? [value, fixed] : [fixed, value];
    });
  }

  function corridorPath(node, target, destination, person) {
    const current = [node.style.left || waiting[person.key][0], node.style.top || waiting[person.key][1]];
    const fromDoor = areaDoors[characterAreas[person.key]] || areaDoors.rest_area;
    const toDoor = areaDoors[destination] || areaDoors.editing_area;
    const anchors = [
      [current[0], fromDoor[1]], fromDoor,
      [fromDoor[0], '52%'], ['50%', '52%'],
      [toDoor[0], '52%'], toDoor,
      [target[0], toDoor[1]], target
    ];
    const path = [];
    let cursor = current;
    anchors.forEach(anchor => {
      if (cursor[0] !== anchor[0]) path.push(...interpolateAxis(cursor[0], anchor[0], cursor[1], true));
      if (cursor[1] !== anchor[1]) path.push(...interpolateAxis(cursor[1], anchor[1], anchor[0], false));
      cursor = anchor;
    });
    return path.filter((point, index) => index === 0 || point[0] !== path[index - 1][0] || point[1] !== path[index - 1][1]);
  }

  function paceWhileWorking(node, target, label, person, token) {
    const baseX = Number.parseFloat(target[0]);
    const baseY = Number.parseFloat(target[1]);
    const points = [[baseX - 1.8, baseY], [baseX, baseY + 1.2], [baseX + 1.8, baseY], [baseX, baseY - 1.2]];
    let index = 0;
    node.classList.add('is-walking');
    const pace = () => {
      if (token !== movementTokens[person.key] || !node.classList.contains('is-working')) return;
      const point = points[index++ % points.length];
      setCharacterPosition(node, [`${point[0]}%`, `${point[1]}%`]);
      node.querySelector('.rsc-label').textContent = `${person.name.split(' ')[0]}｜${label}`;
      window.setTimeout(pace, 1250);
    };
    window.setTimeout(pace, 900);
  }

  function walkAlongCorridor(node, target, label, person, destination, keepWorking) {
    const token = (movementTokens[person.key] || 0) + 1;
    movementTokens[person.key] = token;
    const path = corridorPath(node, target, destination, person);
    const sceneName = person.name.split(' ')[0];
    node.querySelector('.rsc-label').textContent = `${sceneName}｜${label}`;
    node.classList.add('is-walking');
    const step = index => {
      if (token !== movementTokens[person.key]) return;
      if (index >= path.length) {
        characterAreas[person.key] = destination;
        node.querySelector('.rsc-label').textContent = `${sceneName}｜${label}`;
        if (keepWorking) paceWhileWorking(node, target, label, person, token);
        else node.classList.remove('is-walking');
        return;
      }
      setCharacterPosition(node, path[index]);
      window.setTimeout(() => step(index + 1), 440);
    };
    step(0);
  }

  function positionTeam(data) {
    latestProjection = data || latestProjection || {};
    const layer = ensureLayer();
    if (window.CreatorOffice) {
      window.CreatorOffice.syncMap();
      return;
    }
    const r = latestProjection && latestProjection.renguin;
    const sourceAge = r ? secondsSince(r.activity_observed_at || r.source_updated_at) : null;
    const fresh = window.RenguinFreshness.inspect(r && (r.activity_observed_at || r.source_updated_at),60).fresh;
    const working = !!(r && (r.live_working === true || (r.source === 'RUN_PROGRESS' && latestProjection.state !== 'idle' && fresh)));
    const standby = !!(r && !working && r.status === 'READY' && typeof latestProjection.progress === 'number' && latestProjection.progress < 100);
    const stage = r && r.stage || {};
    const commandKey = working ? [r.activity_id || '', r.current_action || '', r.active_tool || '', r.active_workers || '', stage.name || '', stage.completed ?? ''].join('|') : null;
    if (working && commandKey !== currentCommandKey) currentCommandKey = commandKey;
    const workerUnits = Array.isArray(r && r.worker_units) && r.worker_units.length
      ? r.worker_units
      : (Array.isArray(r && r.parallel_units) ? r.parallel_units.map(action => ({action, area:r.area || 'editing_area'})) : []);
    const reportedWorkers = Number(r && r.active_workers) || workerUnits.length || 1;
    const activeCount = working ? Math.min(roster.length, Math.max(1, reportedWorkers)) : 0;
    const activeKeys = new Set();
    const characterUnits = new Map();
    workerUnits.slice(0, activeCount).forEach(unit => {
      const preferred = roleForSource(unit.source).key;
      const selected = !activeKeys.has(preferred) ? preferred : roster.find(person => !activeKeys.has(person.key))?.key;
      if (selected) {
        activeKeys.add(selected);
        characterUnits.set(selected, unit);
      }
    });
    if (working && !activeKeys.size) {
      activeKeys.add('dola');
      characterUnits.set('dola', {action:r.current_action, area:r.area, source:'Content OS'});
    }
    const actionLabel = friendlyAction(r && (r.current_action || stage.name) || '工作');

    roster.forEach(person => {
      const node = layer.querySelector(`#renguin-scene-${person.key}`);
      const isActive = activeKeys.has(person.key);
      const isStandby = standby && person.key === 'renguin';
      const unit = isActive ? (characterUnits.get(person.key) || {}) : {};
      const activeOffset = Math.max(0, workerUnits.indexOf(unit));
      const destination = isActive ? (unit.area || r.area || 'editing_area') : 'rest_area';
      const target = workTargets[destination] || workTargets.editing_area;
      const sameAreaBefore = workerUnits.slice(0, activeOffset).filter(item => (item.area || r.area) === destination).length;
      const sameAreaTotal = workerUnits.slice(0, activeCount).filter(item => (item.area || r.area) === destination).length || 1;
      const targetX = Number.parseFloat(target[0]) + (sameAreaBefore - (sameAreaTotal - 1) / 2) * 8;
      const point = isActive ? [`${targetX}%`, target[1]] : (isStandby ? [workTargets.director_area[0], workTargets.director_area[1]] : waiting[person.key]);
      const cleanedAction = String(unit.action || actionLabel).replace(/^(思考過久|持續思考中)[：:]\s*/, '');
      const elapsed = hasNumber(unit.elapsed_seconds) ? durationText(Math.max(0, Math.round(Number(unit.elapsed_seconds)))) : '未回報';
      const label = isActive ? `最近活動：${friendlyAction(cleanedAction)}｜紀錄${elapsed}` : (isStandby ? '上次回報：等待啟動後製' : '等待活動回報');
      const destinationKey = isActive ? `work|${destination}|${unit.action || ''}|${commandKey}` : (isStandby ? `standby|${stage.name}` : 'rest');
      node.classList.toggle('is-working', isActive);
      node.classList.toggle('is-waiting', !isActive);
      if (characterDestinations[person.key] !== destinationKey) {
        characterDestinations[person.key] = destinationKey;
        walkAlongCorridor(node, point, label, person, destination, isActive);
      } else if (!node.classList.contains('is-walking')) {
        node.querySelector('.rsc-label').textContent = `${person.name.split(' ')[0]}｜${label}`;
      }
    });
  }

  function hideUpstreamCat() {
    try {
      (window.Phaser && Phaser.GAMES || []).forEach(g => {
        (g.scene && g.scene.scenes || []).forEach(scene => {
          const list = scene.children && scene.children.list || [];
          list.forEach(obj => {
            const key = obj.texture && obj.texture.key || '';
            if ((/^star_(idle|working|researching)/.test(key) || key === 'cats') && obj.setVisible) obj.setVisible(false);
          });
        });
      });
    } catch (_) {}
    try {
      if (window.catSprite && window.catSprite.setVisible) window.catSprite.setVisible(false);
      if (window.catBubble && window.catBubble.destroy) { window.catBubble.destroy(); window.catBubble = null; }
    } catch (_) {}
  }

  const traditionalReplacements = [
    ['海辛小龙虾的办公室','RENGUIN 辦公室'], ['Haixin Lobster Office','RENGUIN 辦公室'],
    ['Star 的像素办公室','RENGUIN 辦公室'], ['Star’s pixel office','RENGUIN 辦公室'],
    ['办公室','辦公室'], ['状态','狀態'], ['访客','訪客'], ['暂无','暫無'], ['日记','日記'], ['小记','小記'], ['记','記'],
    ['加载','載入'], ['进入','進入'], ['显示','顯示'], ['隐藏','隱藏'], ['移动视野','移動視野'],
    ['锁定视野','鎖定視野'], ['装修房间','裝修房間'], ['装修','裝修'], ['资产侧边栏','資產側邊欄'],
    ['关闭','關閉'], ['请输入','請輸入'], ['输入验证码','輸入驗證碼'], ['输入','輸入'], ['验证码','驗證碼'], ['验证','驗證'], ['坐标','座標'],
    ['报警','警報'], ['整理文档','整理文件'], ['搜索信息','搜尋資訊'], ['执行任务','執行任務'],
    ['正在加载','正在載入'], ['昨天小记','昨日小記'], ['访 客 列 表','訪 客 列 表']
  ];

  let brandingLanguageSet = false;
  function applyRenguinBranding() {
    document.title = 'RENGUIN 辦公室';
    try {
      if (!brandingLanguageSet && typeof window.setUILanguage === 'function') {
        window.setUILanguage('zh');
        brandingLanguageSet = true;
      }
    } catch (_) {}
    try {
      if (window.officePlaqueText && window.officePlaqueText.setText) window.officePlaqueText.setText('RENGUIN 辦公室');
    } catch (_) {}
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || /^(SCRIPT|STYLE)$/.test(node.parentElement.tagName)) continue;
      let value = node.nodeValue;
      traditionalReplacements.forEach(([from,to]) => { value = value.split(from).join(to); });
      if (value !== node.nodeValue) node.nodeValue = value;
    }
    document.querySelectorAll('[placeholder]').forEach(el => {
      let value = el.getAttribute('placeholder') || '';
      traditionalReplacements.forEach(([from,to]) => { value = value.split(from).join(to); });
      el.setAttribute('placeholder', value);
    });
  }

  function mergeLiveActivities(data) {
    const freshActivities = [...latestActivities.values()].filter(activity => {
      const bridgeAge = secondsSince(activity && activity.generated_at);
      return activity && window.RenguinFreshness.inspect(activity.generated_at,10).fresh;
    });
    const workingActivities = freshActivities.filter(activity => activity.working === true);
    if (!freshActivities.length) return data || {};
    const base = data && data.renguin ? data : {
      state:'idle',
      progress:null,
      renguin:{source:'LIVE_ACTIVITY', task_name:'本機 AI 工作', status:'RUNNING'}
    };
    const merged = {...base, renguin:{...base.renguin}};
    const liveTaskNames = workingActivities.map(activity => activity.session_name).filter(Boolean);
    const baseTaskName = String(merged.renguin.task_name || '');
    const mismatchedTask = liveTaskNames.find(name => !baseTaskName.includes(name) && !String(name).includes(baseTaskName));
    if (mismatchedTask) {
      merged.renguin.live_task_name = mismatchedTask;
      merged.renguin.live_progress_mismatch = true;
    }
    const workerUnits = [];
    const projectItems = [];
    const characterStatuses = [];
    const completedEvents = [];
    freshActivities.forEach(activity => {
      const sourceName = activity.source_name || (activity.source === 'CODEX_SESSION' ? 'Codex' : 'Bionic');
      characterStatuses.push({
        source:sourceName,
        working:activity.working === true,
        work_state:activity.work_state || (activity.working ? 'RUNNING' : 'IDLE'),
        action:activity.current_action,
        elapsed_seconds:activity.elapsed_active_seconds,
        thinking_seconds:activity.thinking_seconds,
        progress:hasNumber(activity.progress) ? Number(activity.progress) : null,
        eta:activity.eta || null,
        updated_at:activity.generated_at,
        // generated_at is the bridge's own poll time and stays fresh forever;
        // session_updated_at only moves when the underlying session actually
        // reports something new, so staleness must be judged against it.
        session_updated_at:activity.session_updated_at || activity.session_finished_at || null
      });
      (Array.isArray(activity.completed_events)?activity.completed_events:[]).forEach(event => {if(event&&typeof event==='object'&&!Array.isArray(event))completedEvents.push({...event, source:event.source || sourceName});});
      const units = Array.isArray(activity.worker_units) && activity.worker_units.length
        ? activity.worker_units
        : (Array.isArray(activity.parallel_units) && activity.parallel_units.length
          ? activity.parallel_units.map(action => ({action, area:activity.area}))
          : [{action:activity.current_action || '處理目前任務', area:activity.area}]);
      (activity.working ? units : []).forEach(unit => {
        if (workerUnits.length >= roster.length) return;
        workerUnits.push({
          action:unit.action || activity.current_action || '處理目前任務',
          area:unit.area || activity.area || 'director_area',
          source:unit.source || sourceName,
          elapsed_seconds:hasNumber(unit.elapsed_seconds) ? Number(unit.elapsed_seconds) : activity.elapsed_active_seconds,
          progress:hasNumber(unit.progress) ? Number(unit.progress) : activity.progress,
          eta:unit.eta || activity.eta || null,
          working:true,
          session_updated_at:activity.session_updated_at || activity.session_finished_at || null
        });
      });
    });
    // Activity feeds are presence observations only. Canonical cards are rendered
    // exclusively by renguin-control-room.js through the validated GET boundary.
    const actions = [...new Set(workerUnits.map(unit => unit.action))];
    merged.renguin.current_action = actions.join(' ＋ ') || merged.renguin.current_action;
    merged.renguin.active_tool = workingActivities.map(activity => activity.active_tool).filter(Boolean).join(' ＋ ') || merged.renguin.active_tool;
    merged.renguin.active_workers = workerUnits.length;
    merged.renguin.parallel_units = workerUnits.map(unit => unit.action);
    merged.renguin.worker_units = workerUnits;
    merged.renguin.project_items = [];
    merged.renguin.character_statuses = characterStatuses;
    merged.renguin.completed_events = completedEvents;
    merged.renguin.activity_id = workingActivities.map(activity => `${activity.source}:${activity.command_id || ''}`).join('|');
    const observationTimes = workingActivities.map(activity => activity.generated_at).sort();
    merged.renguin.activity_observed_at = observationTimes[observationTimes.length - 1];
    merged.renguin.area = workerUnits[0] ? workerUnits[0].area : (merged.renguin.area || 'director_area');
    merged.renguin.live_source = workingActivities.map(activity => activity.source).join('+');
    merged.renguin.live_working = workingActivities.length > 0;
    merged.state = workingActivities.length ? (workerUnits.some(unit => unit.area === 'research_area') ? 'researching' : 'executing') : 'idle';
    return merged;
  }

  function renderYesterdayMemo(events) {
    const title = document.getElementById('memo-title');
    const date = document.getElementById('memo-date');
    const content = document.getElementById('memo-content');
    if (!title || !date || !content) return;
    const unique = new Map();
    (Array.isArray(events) ? events : []).forEach((event,index) => {
      if(!event||typeof event!=='object'||Array.isArray(event))return;
      const value=event.completed_at||event.updated_at;
      if(!window.RenguinFreshness.inspect(value,48*60*60).fresh)return;
      const stamp=window.RenguinFreshness.epoch(value);
      const key=event.event_id?`${event.source||'UNKNOWN'}|${event.event_id}`:`unidentified:${index}`;
      const old=unique.get(key);
      if(!old||stamp>window.RenguinFreshness.epoch(old.completed_at||old.updated_at))unique.set(key,event);
    });
    const items = [...unique.values()].sort((a,b) => Date.parse(b.completed_at || b.updated_at) - Date.parse(a.completed_at || a.updated_at));
    title.textContent = '活 動 完 成 紀 錄';
    date.textContent = '最近 48 小時';
    content.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.id = 'memo-placeholder';
      empty.textContent = '目前沒有偵測到完成紀錄';
      content.appendChild(empty);
      return;
    }
    items.slice(0, 20).forEach(event => {
      const finished = new Date(event.completed_at || event.updated_at);
      const line = document.createElement('div');
      line.style.marginBottom = '7px';
      line.textContent = `${String(finished.getHours()).padStart(2,'0')}:${String(finished.getMinutes()).padStart(2,'0')}｜${event.source || 'AI'}｜${shortText(event.project_name || '未命名專案', 18)}｜完成 ${friendlyAction(event.action || '工作')}`;
      content.appendChild(line);
    });
  }

  function update(data) {
    if (data && data.renguin && data.renguin.source === 'RUN_PROGRESS' && !data.renguin.live_source) latestStatus = data;
    const projection = mergeLiveActivities(data && data.renguin ? data : latestStatus);
    renderPanel(projection || {});
    renderYesterdayMemo(projection && projection.renguin && projection.renguin.completed_events);
    positionTeam(projection || {});
    hideUpstreamCat();
    applyRenguinBranding();
    if (!projection || !projection.renguin) return;
    const layer = ensureLayer();
    const activeAreas = new Set(Array.isArray(projection.renguin.worker_units)
      ? projection.renguin.worker_units.map(unit => unit.area)
      : [projection.renguin.area]);
    layer.querySelectorAll('[data-area]').forEach(node => {
      const active = activeAreas.has(node.dataset.area);
      node.style.borderColor = active ? '#facc15' : 'rgba(148,163,184,.35)';
      node.style.color = active ? '#fef08a' : '#cbd5e1';
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const target = String(args[0] && args[0].url ? args[0].url : args[0]);
    const options = args[1] || {};
    if (target.includes('/set_state') && String(options.method || 'GET').toUpperCase() === 'POST') {
      return new Response(JSON.stringify({status:'readonly', source:'RUN_PROGRESS'}), {
        status: 200,
        headers: {'Content-Type':'application/json'}
      });
    }
    const response = await originalFetch(...args);
    try {
      if (target.includes('/status')) response.clone().json().then(update).catch(() => {});
    } catch (_) {}
    return response;
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderPanel({});
    positionTeam({});
    applyRenguinBranding();
    originalFetch('/status').then(r => r.json()).then(update).catch(() => {});
    const pollActivity = filename => {
      const expectedSource = filename.startsWith('bionic') ? 'BIONIC_SESSION' : 'CODEX_SESSION';
      originalFetch(`/static/${filename}?t=${Date.now()}`, {cache:'no-store'})
        .then(response => {
          if (!response.ok) throw new Error(`${filename} HTTP ${response.status}`);
          return response.json();
        })
        .then(activity => {
          if (activity && activity.source) {
            latestActivities.set(activity.source, activity);
            const healthy = !activity.error && activity.registry_sync !== 'SYNC_ERROR';
            activityHealth.set(activity.source, {ok:healthy, generatedAt:activity.generated_at});
            update(latestStatus);
          } else {
            activityHealth.set(expectedSource, {ok:false, generatedAt:null});
          }
        })
        .catch(() => {
          activityHealth.set(expectedSource, {ok:false, generatedAt:null});
          renderPanel(latestProjection);
        });
    };
    const pollAllActivities = () => {
      if (window.CreatorOffice) return;
      pollActivity('bionic_activity.json');
      pollActivity('codex_activity.json');
    };
    pollAllActivities();
    pollAchievements();
    window.setInterval(pollAllActivities, 1500);
    window.setInterval(pollAchievements, 10000);
    const suppressUpstreamCat = () => { hideUpstreamCat(); window.requestAnimationFrame(suppressUpstreamCat); };
    window.requestAnimationFrame(suppressUpstreamCat);
    window.setInterval(applyRenguinBranding, 750);
    window.setInterval(() => {
      renderPanel(latestProjection);
      renderYesterdayMemo(latestProjection && latestProjection.renguin && latestProjection.renguin.completed_events);
      positionTeam(latestProjection);
    }, 1000);
  });
  window.RenguinOfficeExtension = { update, isStale, roleState, roleDetail, workerStatus };
})();
