// ====== 全局状态 ======
const S = {
  user: null,
  currentPage: 'home',
  roomId: null,
  roomPollTimer: null,
  soupPage: 1,
  selectedSoupId: null
};

// ====== 工具函数 ======
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok && data.error) throw new Error(data.error);
  return data;
}
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function $(id) { return document.getElementById(id); }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

// ====== 粒子背景 ======
(function initBg() {
  const canvas = $('bg-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 2 + 0.5, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, opacity: Math.random() * 0.4 + 0.1 });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108,92,231,${p.opacity})`; ctx.fill();
    }
    // 连线
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(108,92,231,${0.08 * (1 - dist / 100)})`; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// 鼠标光效
(function initMouse() {
  const glow = $('mouse-glow');
  document.addEventListener('mousemove', e => { glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px'; });
})();

// ====== 导航 ======
function navigate(page, data) {
  S.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = $(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('#nav-links a').forEach(a => a.classList.remove('active'));
  const navLink = document.querySelector(`[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');

  // 清除房间轮询
  if (S.roomPollTimer) { clearInterval(S.roomPollTimer); S.roomPollTimer = null; }
  if (page !== 'room') S.roomId = null;

  window.location.hash = page === 'home' ? '/' : `/${page}`;

  switch (page) {
    case 'home': loadHomeSoups(); break;
    case 'soups': loadSoups(); break;
    case 'rooms': loadRooms(); loadSoupsForSelect(); break;
    case 'room': if (data?.roomId) { S.roomId = data.roomId; loadRoom(); S.roomPollTimer = setInterval(loadRoomMessages, 2000); } break;
    case 'admin': loadAdmin(); break;
  }
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#/', '').replace('#', '') || 'home';
  if (['home', 'soups', 'rooms', 'admin'].includes(hash)) navigate(hash);
});

// ====== 认证 ======
async function checkLogin() {
  try {
    const data = await api('/api/auth/me');
    S.user = data.user;
    $('user-info').style.display = 'flex';
    $('user-name-display').textContent = S.user.nickname;
    $('login-btn').style.display = 'none';
    if (S.user.role === 'admin') $('admin-link').style.display = '';
  } catch {
    S.user = null;
    $('user-info').style.display = 'none';
    $('login-btn').style.display = '';
    $('admin-link').style.display = 'none';
  }
}

function showLoginModal() {
  S._loginMode = 'login';
  $('login-title').textContent = '登录';
  $('login-nickname-group').style.display = 'none';
  $('login-submit-btn').textContent = '登录';
  $('toggle-mode').textContent = '没有账号？去注册';
  $('login-modal').classList.add('open');
}

function toggleLoginMode() {
  S._loginMode = S._loginMode === 'login' ? 'register' : 'login';
  if (S._loginMode === 'register') {
    $('login-title').textContent = '注册';
    $('login-nickname-group').style.display = '';
    $('login-submit-btn').textContent = '注册';
    $('toggle-mode').textContent = '已有账号？去登录';
  } else {
    $('login-title').textContent = '登录';
    $('login-nickname-group').style.display = 'none';
    $('login-submit-btn').textContent = '登录';
    $('toggle-mode').textContent = '没有账号？去注册';
  }
}

async function doLogin() {
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  const endpoint = S._loginMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const body = { username, password };
  if (S._loginMode === 'register') body.nickname = $('login-nick').value.trim();
  try {
    await api(endpoint, { method: 'POST', body });
    $('login-modal').classList.remove('open');
    toast(S._loginMode === 'register' ? '注册成功！' : '登录成功！');
    await checkLogin();
    if (S.currentPage === 'home') loadHomeSoups();
    else navigate(S.currentPage);
  } catch (e) { toast(e.message, 'error'); }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  S.user = null;
  await checkLogin();
  navigate('home');
  toast('已退出');
}

// ====== 汤谱 ======
async function loadHomeSoups() {
  try {
    const data = await api('/api/soups?limit=6');
    $('home-soups').innerHTML = data.soups.length
      ? data.soups.map(s => soupCard(s)).join('')
      : '<p style="color:var(--text-dim)">暂无汤谱</p>';
  } catch { $('home-soups').innerHTML = '<p style="color:var(--text-dim)">加载失败</p>'; }
}

async function loadSoups() {
  const search = $('soup-search')?.value || '';
  const type = $('soup-type')?.value || '';
  const params = new URLSearchParams({ search, type, page: S.soupPage, limit: 12 });
  try {
    const data = await api(`/api/soups?${params}`);
    $('soups-grid').innerHTML = data.soups.length
      ? data.soups.map(s => soupCard(s)).join('')
      : '<p style="color:var(--text-dim);grid-column:1/-1">没有找到汤谱</p>';
    const totalPages = Math.ceil(data.total / data.limit);
    $('soups-pagination').innerHTML = totalPages > 1
      ? `<button class="btn btn-outline btn-sm" ${S.soupPage<=1?'disabled':''} onclick="S.soupPage--;loadSoups()">上一页</button>
         <span style="margin:0 12px;color:var(--text-dim)">${S.soupPage} / ${totalPages}</span>
         <button class="btn btn-outline btn-sm" ${S.soupPage>=totalPages?'disabled':''} onclick="S.soupPage++;loadSoups()">下一页</button>`
      : '';
  } catch { $('soups-grid').innerHTML = '<p style="color:var(--text-dim)">加载失败</p>'; }
}

function soupCard(s) {
  return `<div class="card" style="cursor:pointer" onclick="showSoupDetail('${s.id}')">
    <div class="card-header">${s.title}</div>
    <div class="card-meta">
      <span class="difficulty">${stars(s.difficulty)}</span>
      ${s.type === 'host_manual' ? '<span style="margin-left:8px;color:#f39c12">📋 主持人手册</span>' : ''}
    </div>
    <div class="card-body">${(s.soup_face || '').substring(0, 120)}...</div>
    <div class="tags">${(s.tags||[]).map(t => `<span class="tag">${t}</span>`).join('')}</div>
  </div>`;
}

async function showSoupDetail(id) {
  try {
    const data = await api(`/api/soups/${id}`);
    $('soup-detail-title').textContent = data.soup.title;
    $('soup-detail-meta').innerHTML = `<span class="difficulty">${stars(data.soup.difficulty)}</span>
      ${data.soup.tags.map(t => `<span class="tag">${t}</span>`).join('')}`;
    $('soup-detail-face').textContent = data.soup.soup_face;
    if (data.showBottom) {
      $('soup-detail-bottom').hidden = false;
      $('soup-detail-bottom-text').textContent = data.soup.soup_bottom;
    } else {
      $('soup-detail-bottom').hidden = true;
    }
    S.selectedSoupId = id;
    $('btn-use-soup').style.display = S.user ? '' : 'none';
    $('soup-detail-modal').classList.add('open');
  } catch (e) { toast(e.message, 'error'); }
}

function closeSoupDetail() { $('soup-detail-modal').classList.remove('open'); }

function useSoupInRoom() {
  closeSoupDetail();
  navigate('rooms');
  setTimeout(() => showCreateRoom(S.selectedSoupId), 300);
}

// ====== 房间 ======
async function loadRooms() {
  const search = $('room-search')?.value || '';
  try {
    const data = await api(`/api/rooms?search=${search}`);
    $('rooms-grid').innerHTML = data.rooms.length
      ? data.rooms.map(r => `
        <div class="card" style="cursor:pointer" onclick="joinRoomByCode('${r.code}')">
          <div class="card-header">${r.title}</div>
          <div class="card-meta">
            <span>🏷 ${r.code}</span>
            <span style="margin-left:8px">${r.status === 'playing' ? '🟢 游戏中' : r.status === 'waiting' ? '🟡 等待中' : '⚫ 已结束'}</span>
            <span style="margin-left:8px">👥 ${r.player_count}人</span>
          </div>
          ${r.soup_title ? `<div class="card-body">📜 《${r.soup_title}》</div>` : '<div class="card-body" style="font-style:italic">未选择汤谱</div>'}
          <div style="margin-top:8px"><span class="tag">${r.host_type === 'ai' ? '🤖 AI主持' : '👤 真人主持'}</span></div>
        </div>`).join('')
      : '<p style="color:var(--text-dim);grid-column:1/-1">暂无房间，来创建一个吧</p>';
  } catch { $('rooms-grid').innerHTML = '<p style="color:var(--text-dim)">加载失败</p>'; }
}

async function loadSoupsForSelect() {
  try {
    const data = await api('/api/soups?limit=50');
    const sel = $('new-room-soup');
    sel.innerHTML = '<option value="">暂不选择</option>' + data.soups.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
  } catch {}
}

function showCreateRoom(soupId) {
  if (!S.user) { showLoginModal(); return; }
  if (soupId) $('new-room-soup').value = soupId;
  $('create-room-modal').classList.add('open');
}

function closeCreateRoom() { $('create-room-modal').classList.remove('open'); }

async function createRoom() {
  const title = $('new-room-title').value.trim();
  if (!title) return toast('请输入房间名称', 'error');
  try {
    const data = await api('/api/rooms', {
      method: 'POST',
      body: { title, soup_id: $('new-room-soup').value || null, host_type: $('new-room-host').value }
    });
    closeCreateRoom();
    toast('房间创建成功！房间码: ' + data.room.code);
    navigate('room', { roomId: data.room.id });
  } catch (e) { toast(e.message, 'error'); }
}

function showJoinRoom() {
  if (!S.user) { showLoginModal(); return; }
  $('join-room-modal').classList.add('open');
}

function closeJoinRoom() { $('join-room-modal').classList.remove('open'); }

async function joinRoom() {
  const code = $('join-code').value.trim().toUpperCase();
  if (!code) return toast('请输入房间码', 'error');
  await joinRoomByCode(code);
}

async function joinRoomByCode(code) {
  if (!S.user) { showLoginModal(); return; }
  try {
    const data = await api('/api/rooms/join', { method: 'POST', body: { code } });
    closeJoinRoom();
    navigate('room', { roomId: data.room_id });
  } catch (e) { toast(e.message, 'error'); }
}

// ====== 房间页 ======
async function loadRoom() {
  if (!S.roomId) return;
  try {
    const data = await api(`/api/rooms/${S.roomId}`);
    $('room-title-display').textContent = data.room.title;
    $('room-code-display').textContent = '#' + data.room.code;
    $('room-status-display').textContent = data.room.status === 'playing' ? '游戏中' : data.room.status === 'waiting' ? '等待中' : '已结束';
    $('room-host-display').textContent = data.room.host_type === 'ai' ? '🤖 AI' : '👤 真人';
    $('room-players-display').textContent = data.players.length + '人';
    $('room-soup-face').textContent = data.room.soup_face || '未选择汤谱';
    $('room-players-list').innerHTML = data.players.map(p => `<div>${p.role === 'owner' ? '👑 ' : ''}${p.nickname}</div>`).join('');

    // 房主控制
    const isOwner = data.players.some(p => p.id === S.user?.id && p.role === 'owner');
    $('room-owner-controls').style.display = isOwner ? '' : 'none';

    // 渲染消息
    renderMessages(data.messages);
  } catch (e) { toast(e.message, 'error'); navigate('rooms'); }
}

async function loadRoomMessages() {
  if (!S.roomId) return;
  try {
    const data = await api(`/api/rooms/${S.roomId}`);
    renderMessages(data.messages);
    $('room-players-display').textContent = data.players.length + '人';
    $('room-players-list').innerHTML = data.players.map(p => `<div>${p.role === 'owner' ? '👑 ' : ''}${p.nickname}</div>`).join('');
  } catch {}
}

function renderMessages(messages) {
  const container = $('chat-messages');
  container.innerHTML = '';
  for (const m of messages) {
    const div = document.createElement('div');
    const isMine = m.user_id === S.user?.id;
    div.className = `chat-msg ${isMine ? 'mine' : ''} ${m.type === 'system' ? 'system' : ''} ${m.type === 'ai_intervene' ? 'ai_intervene' : ''} ${m.type === 'ai_answer' ? 'ai_answer' : ''}`;
    div.innerHTML = `
      <div class="msg-nickname">${m.type === 'system' ? '' : m.nickname}</div>
      <div class="msg-bubble">${escapeHtml(m.content)}</div>
      <div class="msg-time">${formatTime(m.created_at)}</div>`;
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function sendMessage() {
  const input = $('chat-input');
  const content = input.value.trim();
  if (!content || !S.roomId) return;
  input.value = '';

  try {
    const isAsk = content.startsWith('/ask');
    const type = isAsk ? 'question' : 'chat';
    const msgContent = isAsk ? content.replace(/^\/ask\s*/, '') : content;
    await api(`/api/rooms/${S.roomId}/message`, { method: 'POST', body: { content: msgContent, type } });
    await loadRoomMessages();

    // 如果是提问，调AI回答
    if (isAsk) {
      try {
        const aiData = await api('/api/ai/ask', { method: 'POST', body: { room_id: S.roomId, question: msgContent } });
        await loadRoomMessages();
      } catch {}
    }

    // AI介入检查（每几条消息触发一次）
    await checkAIIntervene();
  } catch (e) { toast(e.message, 'error'); }
}

async function askAI() {
  const question = prompt('向主持人提问（只能回答是/不是/与此无关）：');
  if (!question || !S.roomId) return;
  try {
    await api(`/api/rooms/${S.roomId}/message`, { method: 'POST', body: { content: question, type: 'question' } });
    await loadRoomMessages();
    const aiData = await api('/api/ai/ask', { method: 'POST', body: { room_id: S.roomId, question } });
    await loadRoomMessages();
  } catch (e) { toast(e.message, 'error'); }
}

async function checkAIIntervene() {
  try {
    const data = await api('/api/ai/intervene', { method: 'POST', body: { room_id: S.roomId } });
    if (data.intervene) {
      await loadRoomMessages();
      if (data.bingo) toast('🎉 恭喜大家猜出了汤底！', 'success');
    }
  } catch {}
}

async function updateRoomStatus(status) {
  try {
    await api(`/api/rooms/${S.roomId}/status`, { method: 'PUT', body: { status } });
    await loadRoom();
  } catch (e) { toast(e.message, 'error'); }
}

async function leaveRoom() {
  if (S.roomId) {
    try { await api(`/api/rooms/${S.roomId}/leave`, { method: 'POST' }); } catch {}
  }
  navigate('rooms');
}

// ====== 管理后台 ======
async function loadAdmin() {
  try {
    const stats = await api('/api/admin/stats');
    $('stat-soups').textContent = stats.soups;
    $('stat-rooms').textContent = stats.rooms;
    $('stat-active').textContent = stats.activeRooms;
    $('stat-users').textContent = stats.users;

    const logs = await api('/api/admin/ai-logs');
    $('ai-logs').innerHTML = logs.logs.length
      ? logs.logs.map(l => `<div class="card" style="margin-bottom:8px;padding:12px">
        <div style="font-size:0.8em;color:var(--text-dim)">${l.room_title || '未知房间'} · ${formatTime(l.created_at)}</div>
        <div style="margin-top:4px"><b>触发：</b>${l.trigger_msg}</div>
        <div style="margin-top:2px;color:#f39c12"><b>AI回应：</b>${escapeHtml(l.ai_response)}</div>
      </div>`).join('')
      : '<p>暂无AI介入日志</p>';

    const soupsData = await api('/api/admin/soups-full');
    $('admin-soups').innerHTML = soupsData.soups.map(s => `
      <div class="card" style="margin-bottom:8px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>${s.title}</b>
          <span style="font-size:0.8em">${s.type === 'host_manual' ? '📋 有手册' : ''}</span>
        </div>
        <div style="font-size:0.8em;color:var(--text-dim);margin-top:4px">${(s.soup_bottom || '').substring(0, 100)}...</div>
      </div>`).join('');
  } catch (e) { toast('管理页面加载失败: ' + e.message, 'error'); }
}

// ====== 初始化 ======
async function init() {
  await checkLogin();
  const hash = window.location.hash.replace('#/', '').replace('#', '') || 'home';
  navigate(['home', 'soups', 'rooms', 'admin'].includes(hash) ? hash : 'home');
}
init();
