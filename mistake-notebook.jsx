import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { X, Plus, Search, Loader2, Sparkles, Trash2, BookOpen, AlertCircle, RefreshCw, FolderOpen, Settings, Edit3, Check, ChevronLeft, ChevronRight, ChevronDown, Target, History, ZoomIn, ZoomOut, Maximize, Send, Square, MessageSquare, Upload, Activity, FileText, Link2, Images } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============== TOKEN 统计辅助 ==============

const TOKEN_CATEGORIES = [
  { key: 'image_analysis', label: '图片题目提取', color: '#3b82f6' },
  { key: 'problem_ai', label: '解题分析', color: '#10b981' },
];

// 大数字缩写：1234 → 1.2K，1234567 → 1.23M
function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function TokenStatCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      flex: '1 1 180px', minWidth: 160, padding: '12px 14px',
      border: '1.5px solid var(--grid)', borderRadius: 10, background: 'var(--card)'
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor || 'var(--ink)' }}>
        {(Number(value) || 0).toLocaleString()}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// 当月每日消耗柱状图：每天两根柱（两类），高度按当月单日最大值归一化
function TokenDailyChart({ daily }) {
  const days = daily || [];
  const max = Math.max(1, ...days.flatMap(d => TOKEN_CATEGORIES.map(c => d[c.key]?.total || 0)));
  if (days.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>本月暂无调用记录</div>;
  }
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, minHeight: 120, minWidth: days.length * 26 }}>
        {days.map((d) => {
          const dayTotal = TOKEN_CATEGORIES.reduce((s, c) => s + (d[c.key]?.total || 0), 0);
          return (
            <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22 }}
              title={`${d.date}　总计 ${dayTotal.toLocaleString()}` + TOKEN_CATEGORIES.map(c => `　${c.label} ${(d[c.key]?.total || 0).toLocaleString()}（缓存命中 ${(d[c.key]?.cached || 0).toLocaleString()}）`).join('')}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
                {TOKEN_CATEGORIES.map((c) => {
                  const v = d[c.key]?.total || 0;
                  const h = v > 0 ? Math.max(3, Math.round((v / max) * 88)) : 0;
                  return (
                    <div key={c.key} style={{
                      width: 8, height: h, background: c.color, borderRadius: 2,
                      opacity: v > 0 ? 0.9 : 0.15, minHeight: 2
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>{d.day}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {TOKEN_CATEGORIES.map((c) => (
          <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
            <span style={{ width: 10, height: 10, background: c.color, borderRadius: 2, display: 'inline-block' }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============== API HELPERS ==============

// 当前学生 id：存 localStorage，所有请求经 X-Student-Id 头带给后端
const STUDENT_LS_KEY = 'mnb_student_id';
function getStudentId() {
  try { return localStorage.getItem(STUDENT_LS_KEY) || ''; } catch (e) { return ''; }
}
function setStudentId(id) {
  try {
    if (id == null || id === '') localStorage.removeItem(STUDENT_LS_KEY);
    else localStorage.setItem(STUDENT_LS_KEY, String(id));
  } catch (e) { /* ignore */ }
}
function withStudentHeader(options = {}) {
  const headers = { ...(options.headers || {}) };
  const sid = getStudentId();
  if (sid) headers['X-Student-Id'] = sid;
  return { ...options, headers };
}

async function apiFetch(url, options = {}) {
  options = withStudentHeader(options);
  const method = options.method || 'GET';
  console.log(`[API] ${method} ${url}`, options.body ? JSON.parse(options.body) : '');
  const r = await fetch(url, options);
  console.log(`[API] ${method} ${url} → ${r.status} ${r.statusText}`);
  if (!r.ok) {
    const errBody = await r.text().catch(() => '(无法读取响应体)');
    console.error(`[API] ${method} ${url} 错误响应:`, errBody);
    let detail = `HTTP ${r.status}`;
    try { const j = JSON.parse(errBody); detail = j.detail || j.message || detail; } catch (e) { /* ignore */ }
    throw new Error(detail);
  }
  return r;
}

const API = {
  async getStudents() {
    return (await apiFetch('/api/students')).json();
  },
  async createStudent(name) {
    return (await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })).json();
  },
  async renameStudent(id, name) {
    return (await apiFetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })).json();
  },
  async deleteStudent(id) {
    return (await apiFetch(`/api/students/${id}`, { method: 'DELETE' })).json();
  },
  async getConfig() {
    return (await apiFetch('/api/config')).json();
  },
  async saveImageDir(dir) {
    return (await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_dir: dir })
    })).json();
  },
  async saveConfig(config) {
    return (await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })).json();
  },
  async getTokenStats(scope = 'student') {
    return (await apiFetch(`/api/token-stats?scope=${scope}`)).json();
  },
  async scan() {
    return (await apiFetch('/api/scan')).json();
  },
  async indexImage(filePath, title, summary, content, tags, notes, mastery, practiceCount, lastPracticedAt, difficulty) {
    return (await apiFetch('/api/images/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, title, summary, content, tags, notes, mastery, practice_count: practiceCount, last_practiced_at: lastPracticedAt, difficulty })
    })).json();
  },
  async updateImage(filePath, title, summary, content, tags, notes, mastery, practiceCount, lastPracticedAt, solution, difficulty, source) {
    return (await apiFetch('/api/images/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, title, summary, content, tags, notes, mastery, practice_count: practiceCount, last_practiced_at: lastPracticedAt, solution, difficulty, source })
    })).json();
  },
  async deleteImage(filePath) {
    return (await apiFetch(`/api/images/delete?file_path=${encodeURIComponent(filePath)}`, { method: 'DELETE' })).json();
  },
  async purgeImage(filePath) {
    return (await apiFetch(`/api/images/purge?file_path=${encodeURIComponent(filePath)}`, { method: 'DELETE' })).json();
  },
  async getAllImages(params = {}) {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', params.query);
    if (params.subject) qs.set('subject', params.subject);
    if (params.mastery) qs.set('mastery', params.mastery);
    if (params.dateEnabled) qs.set('date_enabled', '1');
    if (params.startDate) qs.set('start_date', params.startDate);
    if (params.endDate) qs.set('end_date', params.endDate);
    const qsStr = qs.toString();
    const url = '/api/images/all' + (qsStr ? '?' + qsStr : '');
    return (await apiFetch(url)).json();
  },
  async getFocusImages(subject) {
    const url = subject ? `/api/images/focus?subject=${encodeURIComponent(subject)}` : '/api/images/focus';
    return (await apiFetch(url)).json();
  },
  async toggleFocusPractice(filePath, enabled) {
    return (await apiFetch('/api/images/focus', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, enabled })
    })).json();
  },
  async getFocusReminders(items) {
    return (await apiFetch('/api/images/focus/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    })).json();
  },
  async getTimeline(offset) {
    return (await apiFetch(`/api/timeline?offset=${offset}`)).json();
  },
  async findSimilar(payload) {
    return (await apiFetch('/api/images/find-similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })).json();
  },
  imageUrl(filePath) {
    const sid = getStudentId();
    const sidQ = sid ? `&sid=${encodeURIComponent(sid)}` : '';
    return `/api/image-file?path=${encodeURIComponent(filePath)}${sidQ}`;
  }
};

// ============== sida-agent 知识库 API（经本后端 /api/agent/* 代理） ==============

const AgentAPI = {
  async health() { return (await apiFetch('/api/agent/health')).json(); },
  async books() { return (await apiFetch('/api/agent/books')).json(); },
  async listSessions() { return (await apiFetch('/api/agent/chat/sessions')).json(); },
  async createSession(sessionId) {
    return (await apiFetch('/api/agent/chat/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {})
    })).json();
  },
  async getSession(id) { return (await apiFetch(`/api/agent/chat/sessions/${encodeURIComponent(id)}`)).json(); },
  async buildEstimate(payload) {
    return (await apiFetch('/api/agent/build/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })).json();
  },
  // 提交建库：409 等错误带出结构化 detail（message / estimate / active_task_id）
  async buildSubmit(payload) {
    const r = await apiFetch('/api/agent/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return r.json();
  },
  async buildTasks() { return (await apiFetch('/api/agent/build/tasks')).json(); },
  async buildTask(id) { return (await apiFetch(`/api/agent/build/tasks/${encodeURIComponent(id)}`)).json(); },
  buildEventsUrl(id, since = 0) {
    return `/api/agent/build/tasks/${encodeURIComponent(id)}/events?since=${since}`;
  }
};

// 从 apiFetch 抛错的响应里取结构化 detail 的辅助：apiFetch 只把 detail 转成 Error.message，
// 409 的 dict detail 会被 JSON.stringify 丢信息，因此 build 提交单独走这个函数。
async function agentBuildSubmitRaw(payload) {
  const r = await fetch('/api/agent/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let body = null;
  try { body = await r.json(); } catch (e) { /* ignore */ }
  return { ok: r.ok, status: r.status, body };
}

// 手工解析 SSE 流（EventSource 不支持 POST）。逐帧回调 onEvent，收到 event: end 或流关闭即返回。
// 帧格式：`data: <json>\n\n` 若干 + 收尾 `event: end\ndata: {}\n\n`。
async function readSSEStream(response, onEvent, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // 按空行切帧（SSE 帧以 \n\n 分隔）
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let eventName = 'message';
        const dataLines = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (eventName === 'end') return;
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join('\n');
        if (!dataStr) continue;
        let evt;
        try { evt = JSON.parse(dataStr); } catch (e) { continue; }
        onEvent(evt);
        if (signal && signal.aborted) return;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (e) { /* ignore */ }
  }
}

// ============== 学生切换器（下拉菜单） ==============

// 按学生 id/名字哈希取一个稳定的头像底色
const STUDENT_AVATAR_COLORS = ['#4C9A8E', '#C74B4B', '#B98A2F', '#5B7FB9', '#9A6FB5', '#B58A5B', '#3E7E8E', '#B05574'];
function studentAvatarColor(s) {
  const key = String(s && (s.id != null ? s.id : s.name) || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return STUDENT_AVATAR_COLORS[h % STUDENT_AVATAR_COLORS.length];
}

function StudentSwitcher({ students, currentStudentId, onSwitch, onManage }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // 点击外部 / Esc 关闭下拉
  useEffect(() => {
    if (!open) return;
    function onDocDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = students.find((s) => s.id === currentStudentId) || students[0];
  if (!current) return null;

  return (
    <div className={'student-switch' + (open ? ' open' : '')} ref={wrapRef}>
      <button type="button" className="student-switch-trigger"
        title="切换学生，错题库/重点练/统计均按学生隔离"
        aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <span className="student-avatar" style={{ background: studentAvatarColor(current) }}>
          {(current.name || '?').trim().charAt(0)}
        </span>
        <span className="student-switch-name">{current.name}</span>
        <ChevronDown size={14} className="student-switch-chevron" />
      </button>
      {open && (
        <div className="student-switch-menu" role="listbox">
          <div className="student-switch-menu-title">切换学生</div>
          {students.map((s) => {
            const active = s.id === currentStudentId;
            return (
              <button key={s.id} type="button" role="option" aria-selected={active}
                className={'student-switch-item' + (active ? ' active' : '')}
                onClick={() => { setOpen(false); if (!active) onSwitch(s.id); }}>
                <span className="student-avatar sm" style={{ background: studentAvatarColor(s) }}>
                  {(s.name || '?').trim().charAt(0)}
                </span>
                <span className="student-switch-item-name">{s.name}</span>
                {active && <Check size={14} className="student-switch-item-check" />}
              </button>
            );
          })}
          <div className="student-switch-menu-divider" />
          <button type="button" className="student-switch-manage"
            onClick={() => { setOpen(false); onManage(); }}>
            <Settings size={13} /> 管理学生（添加 / 重命名 / 删除）
          </button>
        </div>
      )}
    </div>
  );
}

// ============== CSS ==============

const CSS = `
.mnb {
  --paper: #FBF8F0;
  --grid: #DCE7F2;
  --margin: #C74B4B;
  --ink: #253654;
  --ink-soft: #57648A;
  --pencil: #9098A6;
  --accent: #E3B341;
  --accent-2: #4C9A8E;
  --card: #FFFFFF;
  --shadow: rgba(37, 54, 84, 0.10);
  font-family: "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif;
  color: var(--ink);
  background:
    linear-gradient(90deg, transparent 0 55px, var(--grid) 55px 56px, transparent 56px),
    repeating-linear-gradient(var(--paper) 0 27px, var(--grid) 27px 28px);
  background-color: var(--paper);
  min-height: 100%;
  padding: 28px 20px 60px;
  position: relative;
  box-sizing: border-box;
}
.mnb *, .mnb *::before, .mnb *::after { box-sizing: border-box; }
.mnb .holes {
  position: absolute; left: 22px; top: 90px;
  display: flex; flex-direction: column; gap: 46px;
}
.mnb .hole {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--paper);
  box-shadow: inset 0 1px 3px rgba(37,54,84,0.35), 0 0 0 1px var(--grid);
}
.mnb .shell { max-width: 1600px; margin: 0 auto; padding-left: 40px; }
.mnb .margin-rule {
  position: absolute; left: 56px; top: 0; bottom: 0;
  width: 2px; background: var(--margin); opacity: 0.55;
}
.mnb .header {
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: 12px; margin-bottom: 22px;
}
.mnb h1 {
  font-family: "Songti SC", "STSong", "Noto Serif SC", serif;
  font-size: 30px; font-weight: 700; margin: 0; letter-spacing: 1px;
  position: relative; display: inline-block;
}
.mnb h1 .hl { background: linear-gradient(transparent 60%, var(--accent) 60%); padding: 0 2px; }
.mnb .subtitle { color: var(--ink-soft); font-size: 13px; margin-top: 4px; }
/* 学生切换器：头像胶囊按钮 + 下拉菜单 */
.mnb .student-switch { position: relative; }
.mnb .student-switch-trigger {
  display: flex; align-items: center; gap: 8px;
  background: var(--card); border: 1.5px solid var(--ink); border-radius: 999px;
  padding: 4px 12px 4px 4px; cursor: pointer; font-family: inherit; color: var(--ink);
  box-shadow: 0 2px 6px var(--shadow); transition: all .15s ease;
}
.mnb .student-switch-trigger:hover { transform: translateY(-1px); box-shadow: 0 4px 10px var(--shadow); }
.mnb .student-switch.open .student-switch-trigger { border-color: var(--accent-2); }
.mnb .student-avatar {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 13px; font-weight: 700;
  font-family: "Songti SC", "STSong", serif;
  box-shadow: inset 0 -2px 3px rgba(0, 0, 0, 0.18);
}
.mnb .student-avatar.sm { width: 22px; height: 22px; font-size: 11px; }
.mnb .student-switch-name {
  font-family: "Songti SC", "STSong", serif; font-size: 14px; font-weight: 700;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mnb .student-switch-chevron { color: var(--ink-soft); transition: transform .18s ease; flex-shrink: 0; }
.mnb .student-switch.open .student-switch-chevron { transform: rotate(180deg); }
.mnb .student-switch-menu {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 60;
  min-width: 220px; background: var(--card);
  border: 1.5px solid var(--ink); border-radius: 12px;
  box-shadow: 0 10px 30px rgba(37, 54, 84, 0.18);
  padding: 6px; animation: mnb-pop .14s ease;
}
@keyframes mnb-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.mnb .student-switch-menu-title {
  font-size: 11px; color: var(--ink-soft); font-weight: 700; letter-spacing: 1px;
  padding: 6px 10px 4px;
}
.mnb .student-switch-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  border: none; background: none; cursor: pointer; font-family: inherit;
  padding: 7px 10px; border-radius: 8px; color: var(--ink); text-align: left;
  transition: background .12s ease;
}
.mnb .student-switch-item:hover { background: var(--paper); }
.mnb .student-switch-item.active { background: rgba(255, 236, 179, 0.45); }
.mnb .student-switch-item-name {
  flex: 1; min-width: 0; font-size: 14px; font-weight: 600;
  font-family: "Songti SC", "STSong", serif;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mnb .student-switch-item.active .student-switch-item-name { font-weight: 700; }
.mnb .student-switch-item-check { color: var(--accent-2); flex-shrink: 0; }
.mnb .student-switch-menu-divider { height: 1.5px; background: var(--grid); margin: 6px 4px; }
.mnb .student-switch-manage {
  display: flex; align-items: center; gap: 7px; width: 100%;
  border: none; background: none; cursor: pointer; font-family: inherit;
  padding: 7px 10px; border-radius: 8px; color: var(--ink-soft);
  font-size: 12.5px; font-weight: 600; text-align: left;
  transition: all .12s ease;
}
.mnb .student-switch-manage:hover { background: var(--paper); color: var(--accent-2); }
.mnb .tabs { display: flex; gap: 6px; }
.mnb .tab-btn {
  font-family: "Songti SC", "STSong", serif;
  font-size: 14px; padding: 9px 18px; border-radius: 8px 8px 0 0;
  border: 1.5px solid var(--ink); border-bottom: none;
  background: var(--paper); color: var(--ink-soft); cursor: pointer;
  position: relative; top: 1.5px; transition: all .15s ease;
}
.mnb .tab-btn.active {
  background: var(--card); color: var(--ink); font-weight: 700;
  box-shadow: 0 -2px 8px var(--shadow);
}
.mnb .tab-btn:not(.active):hover { color: var(--ink); }
.mnb .panel {
  background: var(--card); border: 1.5px solid var(--ink);
  border-radius: 0 10px 10px 10px; padding: 24px;
  box-shadow: 0 4px 18px var(--shadow);
}
.mnb .config-box {
  border: 1.5px dashed var(--grid); border-radius: 10px; padding: 16px;
  margin-bottom: 18px; background: rgba(255, 255, 255, 0.72);
}
.mnb .config-title {
  font-family: "Songti SC", "STSong", serif;
  font-size: 16px; font-weight: 700; margin: 0 0 6px;
}
.mnb .config-hint {
  color: var(--ink-soft); font-size: 12.5px; line-height: 1.6; margin: 0 0 12px;
}
.mnb .field-label {
  font-size: 12px; color: var(--ink-soft); font-weight: 700;
  letter-spacing: .5px; margin-bottom: 6px; display: block;
}
.mnb input[type="text"], .mnb input[type="password"], .mnb textarea {
  width: 100%; border: none; border-bottom: 1.5px solid var(--grid);
  background: transparent; padding: 7px 2px;
  font-size: 14px; color: var(--ink); font-family: inherit; outline: none;
}
.mnb textarea { resize: vertical; }
.mnb input[type="text"]:focus, .mnb input[type="password"]:focus, .mnb textarea:focus {
  border-bottom-color: var(--margin);
}
.mnb .field { margin-bottom: 16px; }
.mnb .save-btn {
  margin-top: 18px; padding: 10px 22px; border-radius: 7px;
  border: 1.5px solid var(--accent-2); background: var(--accent-2);
  color: #fff; font-weight: 700; font-size: 14px; cursor: pointer;
}
.mnb .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mnb .save-btn.secondary {
  background: var(--paper); color: var(--ink); border-color: var(--ink);
}
.mnb .save-msg { font-size: 12.5px; color: var(--accent-2); margin-top: 8px; font-weight: 600; }
.mnb .save-msg.error { color: var(--margin); }

/* 学生管理 */
.mnb .student-list { display: flex; flex-direction: column; gap: 6px; }
.mnb .student-row {
  display: flex; align-items: center; gap: 10px;
  border: 1.5px solid var(--grid); border-radius: 8px; padding: 8px 12px;
  background: var(--paper);
}
.mnb .student-row.current { border-color: var(--accent); background: rgba(255, 236, 179, 0.35); }
.mnb .mini-btn {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; padding: 4px 9px; border-radius: 6px;
  border: 1.5px solid var(--ink); background: var(--card); color: var(--ink);
  cursor: pointer; transition: all .12s ease;
}
.mnb .mini-btn:hover { background: var(--ink); color: var(--card); }
.mnb .mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mnb .mini-btn.danger { border-color: var(--margin); color: var(--margin); }
.mnb .mini-btn.danger:hover { background: var(--margin); color: #fff; }
.mnb .confirm-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 10px; padding: 10px 12px; border-radius: 8px;
  border: 1.5px solid var(--margin); background: rgba(229, 83, 75, 0.08);
  font-size: 12.5px; color: var(--ink);
}
.mnb .scope-toggle {
  display: inline-flex; border: 1.5px solid var(--ink); border-radius: 7px; overflow: hidden;
}
.mnb .scope-btn {
  font-size: 12px; padding: 4px 12px; border: none; cursor: pointer;
  background: var(--paper); color: var(--ink-soft); font-family: inherit;
}
.mnb .scope-btn + .scope-btn { border-left: 1.5px solid var(--ink); }
.mnb .scope-btn.active { background: var(--ink); color: var(--card); font-weight: 700; }

/* AI 重新分析的自定义提示输入 */
.mnb .reanalyze-prompt { margin: 0 0 14px; }
.mnb .reanalyze-prompt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px dashed var(--grid);
  background: none;
  color: var(--ink-soft);
  font-size: 12.5px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all .15s;
}
.mnb .reanalyze-prompt-toggle:hover { border-color: var(--accent-2); color: var(--accent-2); }
.mnb .reanalyze-prompt-toggle.open { border-color: var(--accent-2); color: var(--accent-2); background: rgba(59, 130, 246, .06); }
.mnb .reanalyze-prompt-chevron { transition: transform .2s; }
.mnb .reanalyze-prompt-toggle.open .reanalyze-prompt-chevron { transform: rotate(180deg); }
.mnb .error-msg {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--margin); margin-top: 8px; font-weight: 600;
}
.mnb .tag-pill {
  display: inline-flex; align-items: center; gap: 5px;
  background: #FFF6E0; border: 1px solid var(--accent); color: #6B5314;
  border-radius: 999px; padding: 4px 10px 4px 12px;
  font-size: 12.5px; font-weight: 600;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  cursor: default;
}
.mnb .tag-pill.editable { cursor: pointer; }
.mnb .tag-pill.editable:hover { background: #FFEDB0; }
.mnb .tag-pill button {
  background: none; border: none; cursor: pointer;
  color: #8A7020; display: flex; padding: 0;
}
.mnb .tag-pill input {
  border: none; background: transparent; font: inherit; color: inherit;
  width: auto; min-width: 40px; outline: none; padding: 0;
  border-bottom: 1px dashed var(--accent);
}
.mnb .tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.mnb .tag-list-vertical { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.mnb .tag-row { display: flex; align-items: center; }
.mnb .tag-add-row { display: flex; gap: 8px; align-items: center; }
.mnb .tag-add-row input {
  border: 1.5px dashed var(--grid); border-radius: 999px;
  padding: 5px 12px; font-size: 12.5px; flex: 1;
}
.mnb .tag-add-row button {
  border: 1.5px solid var(--ink); background: var(--paper);
  border-radius: 999px; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
}

/* Scan tab */
.mnb .scan-header {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px;
}
.mnb .scan-dir {
  font-size: 13px; color: var(--ink-soft);
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  background: var(--paper); padding: 4px 10px; border-radius: 4px;
  border: 1px solid var(--grid);
}
.mnb .refresh-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 7px;
  border: 1.5px solid var(--ink); background: var(--paper);
  color: var(--ink); font-weight: 700; font-size: 13px; cursor: pointer;
  transition: all .15s ease;
}
.mnb .refresh-btn:hover { background: var(--ink); color: var(--paper); }
.mnb .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mnb .scan-stats {
  font-size: 13px; color: var(--ink-soft); margin-left: auto;
}
.mnb .section-title {
  font-family: "Songti SC", "STSong", serif;
  font-size: 16px; font-weight: 700; margin: 0 0 12px;
  display: flex; align-items: center; gap: 8px;
}
.mnb .section-title .badge {
  font-size: 12px; background: var(--margin); color: #fff;
  border-radius: 999px; padding: 1px 8px; font-family: inherit;
}
.mnb .section-title .badge.green { background: var(--accent-2); }

.mnb .scan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 18px;
  margin-bottom: 24px;
}
.mnb .scan-card {
  background: var(--card); border: 1.5px solid var(--grid);
  border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.mnb .scan-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--shadow); }
.mnb .scan-card.unindexed { border-color: var(--accent); }
.mnb .scan-card .thumb {
  height: auto; overflow: hidden; background: var(--grid);
  display: flex; align-items: center; justify-content: center;
}
.mnb .scan-card .thumb img { width: 100%; height: auto; display: block; max-height: 720px; object-fit: contain; }
.mnb .scan-card .info {
  padding: 10px 12px; font-size: 12px; color: var(--ink-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mnb .scan-card .info .status { font-weight: 600; font-size: 11.5px; }
.mnb .scan-card .info .status.new { color: var(--margin); }
.mnb .scan-card .info .status.indexed { color: var(--accent-2); }
.mnb .scan-card-delete-btn {
  position: absolute; top: 4px; right: 4px; z-index: 5;
  width: 24px; height: 24px; border-radius: 50%;
  border: none; background: rgba(199,75,75,0.78); color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0; opacity: 0; transition: opacity .15s;
}
.mnb .scan-card:hover .scan-card-delete-btn { opacity: 1; }
.mnb .scan-card-delete-btn:hover { background: var(--margin); }
.mnb .scan-preview-close {
  position: absolute; top: 14px; right: 14px;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1.5px solid var(--ink); background: var(--paper);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 62;
}

/* Subject page header */
.mnb .subject-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  flex-wrap: wrap;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 2px solid var(--grid);
}
.mnb .subject-title-block {
  display: flex; align-items: baseline; gap: 10px;
  flex-shrink: 0; white-space: nowrap;
}
.mnb .subject-page-title {
  margin: 0; font-size: 20px; font-weight: 800; color: var(--ink);
}
.mnb .subject-page-stats {
  font-size: 13px; color: var(--ink-soft); font-weight: 500;
}
.mnb .subject-filtered-hint { color: var(--margin); font-weight: 600; }

/* Library */
/* 错题库面板：占满视口剩余高度，仅卡片列表内部滚动，
   错题本标题、学科标题、学科标签行、搜索栏保持静态 */
.mnb .panel.library-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 170px);
  max-height: calc(100vh - 170px);
  overflow: hidden;
}
.mnb .library-panel .subject-page-header { flex-shrink: 0; }
.mnb .library-panel .library-layout { flex: 1; min-height: 0; }
.mnb .library-toolbar {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
  /* 吸顶：滚动页面时搜索/筛选栏固定在上方，仅错题列表滚动 */
  position: sticky; top: 0; z-index: 20;
  background: var(--card);
  padding: 4px 0 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--grid);
}
.mnb .search-box {
  display: flex; align-items: center; gap: 6px;
  border-bottom: 1.5px solid var(--grid); padding: 6px 4px;
  flex: 1 1 220px; min-width: 180px;
}
.mnb .search-box input { border: none; }
.mnb .date-filter-check {
  display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; color: var(--ink-soft); font-weight: 600;
  white-space: nowrap; cursor: pointer; user-select: none;
}
.mnb .date-filter-check input[type="checkbox"] {
  width: 15px; height: 15px; cursor: pointer; accent-color: var(--accent-2);
}
.mnb .date-input {
  border: 1.5px solid var(--grid); border-radius: 6px;
  padding: 5px 8px; font-size: 12.5px; color: var(--ink);
  background: var(--paper); font-family: inherit;
  outline: none; width: 135px;
}
.mnb .date-input:focus { border-color: var(--accent-2); }
.mnb .date-input:disabled { opacity: 0.4; cursor: not-allowed; }
.mnb .date-sep {
  font-size: 12.5px; color: var(--pencil); font-weight: 600;
}
.mnb .clear-filter-btn {
  border: 1.5px dashed var(--margin); background: none; color: var(--margin);
  border-radius: 999px; padding: 5px 13px; font-size: 12.5px; font-weight: 600;
  cursor: pointer; white-space: nowrap; transition: all .12s;
}
.mnb .clear-filter-btn:hover { background: var(--margin); color: #fff; }
.mnb .date-error {
  font-size: 12px; color: var(--margin); font-weight: 600; white-space: nowrap;
}
.mnb .tag-filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.mnb .filter-pill {
  border: 1.5px solid var(--pencil); background: var(--paper); color: var(--ink-soft);
  border-radius: 999px; padding: 5px 13px; font-size: 12.5px; font-weight: 600;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  cursor: pointer; transition: all .12s;
}
.mnb .filter-pill.active {
  border-color: var(--margin); background: var(--margin); color: #fff;
}
.mnb .count-badge { opacity: 0.65; font-weight: 400; margin-left: 3px; }
.mnb .grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}
.mnb .card {
  background: var(--card); border: 1.5px solid var(--ink); border-radius: 8px;
  overflow: hidden; cursor: pointer; transition: transform .15s, box-shadow .15s;
  display: flex; flex-direction: column; position: relative;
}
.mnb .card:hover { transform: translateY(-3px); box-shadow: 0 8px 18px var(--shadow); }
.mnb .card-thumb {
  height: 200px; overflow: hidden; border-bottom: 1.5px solid var(--grid);
  background: var(--grid);
}
.mnb .card-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
.mnb .card-body { padding: 10px 12px 12px; flex: 1; display: flex; flex-direction: column; }
.mnb .card-title {
  font-weight: 700; font-size: 13.5px; margin: 0 0 6px;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.mnb .card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }
.mnb .card-tags span {
  font-size: 10.5px; font-family: ui-monospace, monospace;
  background: #FFF6E0; border: 1px solid var(--accent); color: #6B5314;
  border-radius: 999px; padding: 2px 7px;
}
.mnb .card-meta {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 6px; gap: 6px;
}
.mnb .card-mastery {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; color: var(--ink);
}
.mnb .card-practice { font-size: 10.5px; color: var(--ink-soft); }

/* Star Rating */
.mnb .star-rating { display: inline-flex; gap: 2px; align-items: center; vertical-align: middle; }
.mnb .star-rating-star { color: #d4d4d4; transition: color 0.15s; }
.mnb .star-rating-star.filled { color: #f5a623; }
.mnb .star-rating-star.clickable:hover { color: #f5a623; }

/* Analysis overlay */
.mnb .analyze-overlay {
  margin-top: 16px; padding: 16px;
  border: 1.5px dashed var(--grid); border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}
.mnb .analyze-img {
  width: 88%; max-height: 640px; object-fit: contain;
  display: block; margin: 0 auto 14px;
  border-radius: 8px; border: 1.5px solid var(--grid);
  cursor: zoom-in;
}
.mnb .analyze-btn {
  width: 100%; padding: 10px 14px; border-radius: 7px;
  border: 1.5px solid var(--ink); background: var(--ink); color: var(--paper);
  font-weight: 700; font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: opacity .15s;
}
.mnb .analyze-btn:hover { opacity: 0.85; }
.mnb .analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 分析中：tab 上的呼吸小圆点指示器 */
.mnb .tab-analyzing-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #f59e0b; margin-left: 5px; vertical-align: 1px;
  animation: mnb-pulse 1.2s ease-in-out infinite;
}
@keyframes mnb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.mnb .empty { text-align: center; padding: 50px 20px; color: var(--ink-soft); }
.mnb .empty svg { opacity: 0.4; margin-bottom: 10px; }

/* Modal */
.mnb .modal-overlay {
  position: fixed; inset: 0; background: rgba(37,54,84,0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 50;
}
.mnb .modal-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mnb .modal {
  background: var(--card); border: 1.5px solid var(--ink); border-radius: 10px;
  max-width: 820px; width: 100%; max-height: 88vh; overflow-y: auto;
  padding: 28px; position: relative;
}
.mnb .modal-close {
  position: absolute; top: 14px; right: 14px;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1.5px solid var(--ink); background: var(--paper);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.mnb .modal img {
  width: 100%; border-radius: 8px; border: 1.5px solid var(--grid); margin-bottom: 14px;
}
/* 详情弹窗：关闭按钮稍微向右上偏移，避免遮挡题目图片 */
.mnb .modal.detail-modal .modal-close {
  top: 10px; right: 10px;
}
.mnb .modal.detail-modal > img {
  margin-top: 14px;
}
.mnb .modal h2 {
  font-family: "Songti SC", "STSong", serif;
  font-size: 19px; margin: 0 0 10px; padding-right: 30px;
}
.mnb .modal .summary {
  font-size: 15px; line-height: 1.9;
  color: #1b3f7a; /* 加深的深蓝色：AI 分析的解题思路 */
  margin-bottom: 16px;
  background: rgba(110, 168, 254, 0.09);
  border: 1.5px solid rgba(110, 168, 254, 0.3);
  border-left: 4px solid #6ea8fe;
  border-radius: 8px;
  padding: 16px 18px;
  max-height: 420px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.mnb .modal .summary .ai-badge {
  display: inline-block;
  font-size: 11px; font-weight: 700;
  color: #ffffff;
  background: #4a7fd4;
  border-radius: 4px;
  padding: 2px 8px;
  margin-right: 8px;
  vertical-align: 1px;
}
.mnb .timestamp-row {
  display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 14px;
}
.mnb .timestamp {
  font-size: 12px; color: var(--pencil);
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
}
.mnb .modal .tag-list { margin-bottom: 18px; }
.mnb .modal-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  border-top: 1px dashed var(--grid); padding-top: 14px;
}
.mnb .del-btn {
  display: flex; align-items: center; gap: 6px;
  border: 1.5px solid var(--margin); background: none; color: var(--margin);
  padding: 7px 14px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer;
}

/* Image preview overlay (modal-over-modal) */
.mnb .image-preview-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 60;
}
/* Detail nav arrows */
.mnb .detail-nav-btn {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 44px; height: 44px; border-radius: 50%;
  border: 1.5px solid var(--ink); background: var(--paper);
  color: var(--ink); display: flex; align-items: center;
  justify-content: center; cursor: pointer; z-index: 55;
  transition: all .15s; box-shadow: 0 2px 8px var(--shadow);
}
.mnb .detail-nav-btn:hover { background: var(--ink); color: var(--paper); }
.mnb .detail-nav-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.mnb .detail-nav-btn:disabled:hover { background: var(--paper); color: var(--ink); }
.mnb .detail-nav-btn.left { left: -58px; }
.mnb .detail-nav-btn.right { right: -58px; }
.mnb .detail-position {
  font-size: 12.5px; color: var(--pencil); font-weight: 600;
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  margin-left: auto; white-space: nowrap;
}
@media (max-width: 860px) {
  .mnb .detail-nav-btn.left { left: 6px; }
  .mnb .detail-nav-btn.right { right: 6px; }
  .mnb .detail-nav-btn { width: 36px; height: 36px; }
}

.mnb .image-preview-modal {
  position: relative; max-width: 90vw; max-height: 90vh;
  padding: 12px; background: var(--card); border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.mnb .image-preview-modal img {
  max-width: 90vw;
  max-height: calc(90vh - 40px);
  width: auto; height: auto;
  object-fit: contain; display: block;
  border-radius: 6px;
  margin-bottom: 0; border: none;
}

/* ===== Zoomable image preview (窗口随图片整体缩放) ===== */
.mnb .image-preview-modal.zoomable {
  padding: 10px;
  max-width: none; max-height: none;
  display: flex; flex-direction: column;
}
/* 放大预览：关闭按钮向右上偏移并缩小，避免遮挡题目图片 */
.mnb .image-preview-modal.zoomable .modal-close {
  top: 6px; right: 6px;
  width: 26px; height: 26px;
}
/* 拖拽手柄：可按住移动整个预览窗口 */
.mnb .image-preview-modal.zoomable .zoom-preview-handle {
  display: flex; align-items: center; gap: 8px;
  height: 24px; padding: 2px 36px 0 10px;
  cursor: move; user-select: none; -webkit-user-select: none;
  color: var(--ink-soft); font-size: 12px;
  border-radius: 8px 8px 0 0;
  flex-shrink: 0;
}
.mnb .image-preview-modal.zoomable .zoom-preview-handle:hover {
  background: rgba(220, 231, 242, 0.45);
}
.mnb .image-preview-modal.zoomable .zoom-preview-handle:active {
  cursor: grabbing;
}
.mnb .zoom-preview-handle-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 55vw;
}
.mnb .zoom-preview-handle-hint {
  margin-left: auto; font-size: 11px; color: var(--pencil); white-space: nowrap;
}
.mnb .zoom-preview-scroll {
  overflow: auto;
  max-width: 92vw;
  /* 顶部为拖拽手柄让位，底部为工具栏预留空间，避免遮挡图片 */
  margin-top: 6px;
  max-height: calc(92vh - 116px);
  border-radius: 8px;
  background:
    repeating-conic-gradient(#f0ede4 0% 25%, #faf8f2 0% 50%) 0 0 / 20px 20px;
  overscroll-behavior: contain;
}
.mnb .zoom-preview-scroll img {
  display: block;
  max-width: none; max-height: none;
  border-radius: 4px;
  user-select: none;
  -webkit-user-drag: none;
  margin: 0; border: none;
}
.mnb .zoom-preview-toolbar {
  /* 放在图片滚动区下方，作为常规流布局，不再悬浮遮挡图片 */
  position: static;
  flex-shrink: 0;
  align-self: center;
  margin-top: 10px;
  display: flex; align-items: center; gap: 4px;
  background: rgba(255, 255, 255, 0.94);
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  padding: 4px 8px;
  box-shadow: 0 2px 10px var(--shadow);
}
.mnb .zoom-tool-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 28px; height: 28px; padding: 0 6px;
  border: none; background: none; border-radius: 999px;
  color: var(--ink); cursor: pointer;
  transition: background .12s;
}
.mnb .zoom-tool-btn:hover { background: var(--grid); }
.mnb .zoom-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.mnb .zoom-tool-btn:disabled:hover { background: none; }
/* 图片预览翻页箭头（覆盖层两侧） */
.mnb .zoom-preview-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 46px; height: 46px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.8); background: rgba(255,255,255,0.14);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.mnb .zoom-preview-nav:hover { background: rgba(255,255,255,0.35); }
.mnb .zoom-preview-nav.left { left: 24px; }
.mnb .zoom-preview-nav.right { right: 24px; }
@media (max-width: 860px) {
  .mnb .zoom-preview-nav { width: 38px; height: 38px; }
  .mnb .zoom-preview-nav.left { left: 8px; }
  .mnb .zoom-preview-nav.right { right: 8px; }
}
.mnb .zoom-tool-label {
  font-size: 12px; font-weight: 700; color: var(--ink);
  font-family: ui-monospace, "SF Mono", Consolas, monospace;
  min-width: 48px; text-align: center;
  cursor: pointer; user-select: none;
  border-radius: 4px; padding: 2px 0;
}
.mnb .zoom-tool-label:hover { background: var(--grid); }
.mnb .zoom-tool-sep {
  width: 1px; height: 16px; background: var(--grid); margin: 0 2px;
}

.mnb .spin { animation: mnbspin 0.9s linear infinite; }
@keyframes mnbspin { to { transform: rotate(360deg); } }

/* Mastery & Practice */
.mnb .mastery-light {
  display: inline-block; border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 1px 3px rgba(0,0,0,0.3),
    inset 0 -2px 3px rgba(0,0,0,0.3), inset 0 2px 2px rgba(255,255,255,0.4);
  flex-shrink: 0; vertical-align: middle;
}
.mnb .mastery-group { display: flex; flex-wrap: wrap; gap: 8px; }
.mnb .mastery-option {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 7px;
  border: 1.5px solid var(--grid); cursor: pointer;
  font-size: 13px; transition: all .15s;
}
.mnb .mastery-option:hover { border-color: var(--ink-soft); }
.mnb .mastery-option.active { border-color: var(--accent-2); background: #E8F5F2; }
.mnb .mastery-option input[type="radio"] { display: none; }
.mnb .practice-count {
  font-size: 28px; font-weight: 700; color: var(--ink);
  font-family: "Songti SC", "STSong", serif;
  min-width: 36px; text-align: center;
}
.mnb .practice-btn {
  padding: 8px 14px; border-radius: 7px;
  border: 1.5px solid var(--accent-2); background: var(--accent-2);
  color: #fff; font-weight: 700; font-size: 14px; cursor: pointer;
  transition: opacity .15s;
}
.mnb .practice-btn:hover { opacity: 0.85; }

/* Solution section */
.mnb .solution-section textarea {
  background: #FAFAF5; border: 1.5px dashed var(--grid);
  border-radius: 8px; padding: 10px 12px;
  font-size: 13.5px; min-height: 80px;
}
.mnb .solution-images {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
}
.mnb .solution-img-wrapper {
  position: relative; width: 100px; height: 80px;
  border: 1.5px solid var(--grid); border-radius: 6px;
  overflow: hidden; background: var(--grid);
}
.mnb .solution-img-wrapper img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  margin-bottom: 0; border: none; border-radius: 0;
}
.mnb .solution-img-delete {
  position: absolute; top: 2px; right: 2px;
  width: 20px; height: 20px; border-radius: 50%;
  border: none; background: rgba(199,75,75,0.85); color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 10px; padding: 0;
}
.mnb .solution-img-delete:hover { background: var(--margin); }
.mnb .solution-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: 7px;
  border: 1.5px dashed var(--pencil); background: var(--paper);
  color: var(--ink-soft); font-size: 12.5px; font-weight: 600;
  cursor: pointer; transition: all .15s;
}
.mnb .solution-add-btn:hover {
  border-color: var(--accent-2); color: var(--accent-2);
}

/* Inline tag edit */
.mnb .tag-edit-input {
  width: 80px; border: none; background: transparent;
  font-size: 12.5px; font-family: ui-monospace, "SF Mono", Consolas, monospace;
  color: #6B5314; font-weight: 600; outline: none; padding: 0;
  border-bottom: 1px dashed var(--accent);
}

@media (max-width: 520px) {
  .mnb .shell { padding-left: 24px; }
  .mnb .margin-rule { left: 40px; }
  .mnb .holes { display: none; }
  .mnb h1 { font-size: 24px; }
  .mnb .panel { padding: 16px; }
  .mnb .scan-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}

/* Subject tab bar (library)：与学科标题同行显示，占满剩余空间靠右排列 */
.mnb .subject-tab-bar {
  display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;
  flex: 1; min-width: 0; margin-bottom: 0; padding-bottom: 0;
  border-bottom: none;
}

/* Focus subject sections */
.mnb .focus-subject-section { margin-bottom: 28px; }
.mnb .focus-subject-header {
  display: flex; align-items: baseline; gap: 10px;
  padding: 6px 0 10px; margin-bottom: 6px;
  border-bottom: 2px solid var(--accent-2);
}
.mnb .focus-subject-label {
  font-family: "Songti SC", "STSong", serif;
  font-size: 18px; font-weight: 800; color: var(--accent-2);
  letter-spacing: 0.5px;
  padding: 2px 10px 2px 0;
}
.mnb .focus-subject-count {
  font-size: 13px; color: var(--ink-soft); font-weight: 600;
  background: var(--paper); padding: 1px 10px; border-radius: 4px;
  border: 1px solid var(--grid);
}

/* Library layout: sidebar + main */
.mnb .library-layout { display: flex; gap: 24px; align-items: stretch; }

/* Tag sidebar */
.mnb .tag-sidebar {
  flex: 0 0 240px; max-height: none;
  overflow-y: auto;
  border: 1.5px solid var(--grid); border-radius: 10px;
  padding: 16px; background: rgba(255,255,255,0.6);
}
.mnb .tag-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--grid);
}
.mnb .tag-sidebar-title {
  font-family: "Songti SC", "STSong", serif;
  font-size: 15px; font-weight: 700; color: var(--ink);
}
.mnb .tag-sidebar-clear {
  border: 1px dashed var(--pencil); background: none; color: var(--pencil);
  border-radius: 999px; padding: 3px 10px; font-size: 11.5px; font-weight: 600;
  cursor: pointer; transition: all .12s;
}
.mnb .tag-sidebar-clear:hover { border-color: var(--margin); color: var(--margin); }
.mnb .tag-sidebar-list { display: flex; flex-direction: column; gap: 5px; }
.mnb .sidebar-tag {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 7px 10px; border-radius: 7px;
  border: 1px solid transparent; background: none;
  cursor: pointer; text-align: left; transition: all .12s;
  font-family: inherit; font-size: 13px; color: var(--ink-soft);
}
.mnb .sidebar-tag:hover { background: #F5F3EC; border-color: var(--grid); }
.mnb .sidebar-tag.active {
  background: var(--margin); color: #fff; border-color: var(--margin); font-weight: 600;
}
.mnb .sidebar-tag.active .sidebar-tag-count { color: rgba(255,255,255,0.75); }
.mnb .sidebar-tag-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
  font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12.5px;
}

/* View type select */
.mnb .view-type-select {
  border: 1.5px solid var(--grid); border-radius: 6px;
  padding: 5px 8px; font-size: 12.5px; color: var(--ink);
  background: var(--paper); font-family: inherit; outline: none;
}
.mnb .view-type-select:focus { border-color: var(--accent-2); }

/* Date section grouping */
.mnb .date-section { margin-bottom: 24px; }
.mnb .date-section-header {
  display: flex; align-items: baseline; gap: 10px;
  padding: 6px 0 10px; margin-bottom: 6px;
  border-bottom: 2px solid #7C3AED;
}
.mnb .date-section-label {
  font-family: "Songti SC", "STSong", serif;
  font-size: 18px; font-weight: 800; color: #7C3AED;
  letter-spacing: 0.5px;
  padding: 2px 10px 2px 0;
}
.mnb .date-section-count {
  font-size: 13px; color: var(--ink-soft); font-weight: 600;
  background: var(--paper); padding: 1px 10px; border-radius: 4px;
  border: 1px solid var(--grid);
}
.mnb .sidebar-tag-count {
  font-size: 11px; color: var(--pencil); font-weight: 400; margin-left: 6px; flex-shrink: 0;
}
.mnb .tag-sidebar-empty {
  font-size: 12.5px; color: var(--pencil); text-align: center; padding: 20px 0;
}

/* Library main area：卡片列表在此区域内部滚动 */
.mnb .library-main { flex: 1; min-width: 0; overflow-y: auto; }

/* mastery select */
.mnb .mastery-select {
  border: 1.5px solid var(--grid); border-radius: 6px;
  padding: 5px 8px; font-size: 12.5px; color: var(--ink);
  background: var(--paper); font-family: inherit; outline: none;
}
.mnb .mastery-select:focus { border-color: var(--accent-2); }

/* responsive: sidebar collapses on narrow screens */
@media (max-width: 860px) {
  /* 窄屏下恢复页面整体滚动，避免面板内容被截断 */
  .mnb .panel.library-panel { height: auto; max-height: none; overflow: visible; }
  .mnb .library-layout { flex-direction: column; align-items: flex-start; }
  .mnb .tag-sidebar { flex: none; width: 100%; max-height: none; position: static; }
  .mnb .tag-sidebar-list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
  .mnb .sidebar-tag { width: auto; }
  .mnb .library-main { overflow-y: visible; }
}

/* ========= Focus Practice ========= */
.mnb .card-focus-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(245, 158, 11, .35);
  line-height: 1.5;
  letter-spacing: .5px;
}

.mnb .focus-page { padding: 0 4px; }

.mnb .focus-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
}

.mnb .focus-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--ink);
}

.mnb .focus-page-desc {
  font-size: 13px;
  color: var(--ink-soft);
  margin: 0;
  line-height: 1.6;
}

.mnb .focus-count-badge {
  display: flex;
  align-items: baseline;
  gap: 2px;
  flex-shrink: 0;
  padding: 8px 14px;
  background: var(--bg-3);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.mnb .focus-count-num {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent-1);
  line-height: 1;
}
.mnb .focus-count-unit {
  font-size: 14px;
  color: var(--ink-soft);
  margin-left: 2px;
}

.mnb .focus-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--ink);
  font-size: 12.5px;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.mnb .focus-btn:hover { border-color: #f59e0b; color: #f59e0b; }
.mnb .focus-btn.active {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #d97706;
}
.mnb .focus-btn.active:hover {
  background: #fde68a;
  border-color: #d97706;
  color: #b45309;
}

/* (focus-reminder-banner removed per user request) */

/* ========= Overdue Card ========= */
.mnb .card-overdue {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 1.5px #ef4444, 0 4px 12px rgba(239, 68, 68, .15) !important;
}
.mnb .card-overdue:hover {
  box-shadow: 0 0 0 2px #dc2626, 0 8px 18px rgba(239, 68, 68, .25) !important;
}

.mnb .card-overdue-info {
  margin-top: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: #dc2626;
  line-height: 1.4;
}

.mnb .card-reminder {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #b91c1c;
  line-height: 1.4;
  padding: 6px 10px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.mnb .card-reminder.loading {
  color: var(--ink-soft);
  background: #F5F3EC;
  font-weight: 400;
}

.mnb .card-focus-context .card-body {
  padding-bottom: 8px;
}

/* ===== Timeline ===== */
.mnb .timeline-page {
  position: relative;
  padding-left: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.mnb .timeline-day {
  position: relative;
  margin-bottom: 28px;
}
.mnb .timeline-day-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  position: relative;
}
.mnb .timeline-day-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--paper);
  box-shadow: 0 0 0 2px var(--accent);
  flex-shrink: 0;
  z-index: 1;
}
/* 纵向连接线 */
.mnb .timeline-day::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 18px;
  bottom: -10px;
  width: 2px;
  background: var(--grid);
}
.mnb .timeline-day:last-child::before {
  display: none;
}
.mnb .timeline-day-date {
  font-family: "Songti SC", "STSong", serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.mnb .timeline-day-weekday {
  font-size: 12px;
  color: var(--ink-soft);
}
.mnb .timeline-day-count {
  font-size: 20px;
  font-weight: 800;
  color: var(--margin);
  margin-left: auto;
  font-family: "Songti SC", "STSong", serif;
  letter-spacing: 0.5px;
}
.mnb .timeline-day-count .count-unit {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-soft);
  margin-left: 4px;
}
.mnb .timeline-day-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
  margin-left: 20px;
}
.mnb .timeline-card-footer {
  font-size: 11.5px;
  color: var(--ink-soft);
  margin-top: 6px;
  display: flex;
  gap: 4px;
  align-items: center;
}
.mnb .card-extra-footer {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--grid);
}
.mnb .timeline-sentinel {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
.mnb .timeline-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}
.mnb .timeline-end {
  font-size: 12px;
  color: var(--pencil);
}

/* ===== 找相似题 ===== */
.mnb .similar-open-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1.5px solid var(--accent-2); background: #E8F5F2; color: #1F6F63;
  border-radius: 7px; padding: 6px 13px; font-size: 12.5px; font-weight: 700;
  cursor: pointer; white-space: nowrap; transition: all .12s;
  font-family: inherit;
}
.mnb .similar-open-btn:hover { background: var(--accent-2); color: #fff; }
.mnb .similar-open-btn:active { transform: translateY(1px); }

.mnb .similar-modal-overlay { z-index: 58; }
.mnb .similar-modal { max-width: 940px; }
.mnb .similar-desc b { color: var(--accent-2); }

.mnb .similar-source-row { }
.mnb .similar-source-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 440px;
  background: #FFF6E0; border: 1px solid var(--accent); color: #6B5314;
  border-radius: 999px; padding: 4px 13px; font-size: 12.5px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mnb .similar-small-btn {
  border: 1.5px solid var(--grid); background: var(--paper); color: var(--ink-soft);
  border-radius: 6px; padding: 4px 11px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all .12s;
}
.mnb .similar-small-btn:hover { border-color: var(--accent-2); color: var(--accent-2); }

.mnb .similar-options {
  display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin: 8px 0 2px;
}
.mnb .similar-check {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; user-select: none;
}
.mnb .similar-check input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: var(--accent-2); cursor: pointer;
}
.mnb .similar-check-hint { font-size: 11.5px; color: var(--pencil); font-weight: 400; }
.mnb .similar-topk {
  border: 1.5px solid var(--grid); border-radius: 6px; padding: 3px 6px;
  font-size: 12.5px; color: var(--ink); background: var(--paper);
  font-family: inherit; outline: none; cursor: pointer;
}
.mnb .similar-topk:focus { border-color: var(--accent-2); }
.mnb .similar-topk:disabled { opacity: .5; cursor: not-allowed; }

.mnb .similar-loading {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 26px 0; color: var(--ink-soft); font-size: 13px;
}

.mnb .similar-result { margin-top: 14px; border-top: 1px dashed var(--grid); padding-top: 14px; }
.mnb .similar-result-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;
}
.mnb .similar-mode-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 12px;
  border: 1.5px solid var(--grid); color: var(--ink-soft); background: var(--paper);
}
.mnb .similar-mode-badge.smart { border-color: var(--accent-2); color: #1F6F63; background: #E8F5F2; }
.mnb .similar-mode-badge.degraded { border-color: var(--margin); color: #a83232; background: #FDF0F0; }
.mnb .similar-result-count { font-size: 12px; color: var(--ink-soft); }
.mnb .similar-degraded-banner {
  background: #FDF3E3; border: 1.5px solid #E6C98A; color: #7A5A12;
  border-radius: 8px; padding: 9px 13px; font-size: 12.5px; line-height: 1.6; margin-bottom: 12px;
}

.mnb .similar-list { display: flex; flex-direction: column; gap: 10px; }
.mnb .similar-item {
  display: flex; gap: 12px; align-items: stretch;
  border: 1.5px solid var(--grid); border-radius: 10px; padding: 10px;
  background: var(--card); cursor: pointer; transition: all .13s;
}
.mnb .similar-item:hover {
  border-color: var(--accent-2); box-shadow: 0 4px 14px var(--shadow);
  transform: translateY(-1px);
}
.mnb .similar-item-thumb {
  width: 200px; min-width: 200px; height: 150px; border-radius: 7px; overflow: hidden;
  background: var(--grid); border: 1px solid var(--grid);
  display: flex; align-items: center; justify-content: center;
}
.mnb .similar-item-thumb img {
  width: 100%; height: 100%; object-fit: contain; display: block;
  border: none; border-radius: 4px; margin: 0; padding: 2px; box-sizing: border-box;
}
.mnb .similar-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.mnb .similar-item-title {
  font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;
  color: var(--ink);
}
.mnb .similar-item-title .similar-rank {
  font-size: 11px; color: var(--pencil);
  font-family: ui-monospace, "SF Mono", Consolas, monospace; font-weight: 600;
}
.mnb .similar-item-title .similar-score {
  margin-left: auto; font-size: 11.5px; color: var(--ink-soft); font-weight: 600; white-space: nowrap;
}
.mnb .similar-item-tags { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.mnb .similar-subject-chip {
  font-size: 10.5px; font-weight: 700; background: var(--ink); color: var(--paper);
  border-radius: 999px; padding: 2px 8px;
}
.mnb .similar-tag-chip {
  font-size: 10.5px; font-family: ui-monospace, "SF Mono", Consolas, monospace;
  background: #FFF6E0; border: 1px solid var(--accent); color: #6B5314;
  border-radius: 999px; padding: 2px 7px;
}
.mnb .similar-item-summary {
  font-size: 12.5px; color: #1b3f7a; line-height: 1.6;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical; opacity: .92;
}
.mnb .similar-item-reason {
  font-size: 12px; color: var(--ink-soft); background: #F3F7FC; border: 1px solid var(--grid);
  border-radius: 7px; padding: 5px 9px; line-height: 1.5;
}
.mnb .similar-item-side {
  display: flex; align-items: center; justify-content: center;
  padding-left: 4px; border-left: 1px dashed var(--grid);
}
.mnb .similar-kind {
  font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 4px 11px; white-space: nowrap;
  border: 1.5px solid currentColor;
}
.mnb .similar-kind.same { color: #1f8a55; background: #E9F7EF; }
.mnb .similar-kind.variant { color: #a97f12; background: #FBF3DC; }
.mnb .similar-kind.similar { color: #3b6cc4; background: #EAF1FC; }
.mnb .similar-kind.weak { color: #7b8494; background: #F1F2F5; }
@media (max-width: 700px) {
  .mnb .similar-item { flex-wrap: wrap; }
  .mnb .similar-item-thumb { width: 100%; height: 200px; min-width: 0; }
  .mnb .similar-item-side { border-left: none; padding-left: 0; justify-content: flex-start; }
}

/* ============ 知识库（sida-agent） ============ */
.mnb input[type="number"], .mnb input[type="password"], .mnb select {
  border-bottom: 1.5px solid var(--grid);
}
.mnb .kb-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 16px;
}
.mnb .kb-subtabs { display: flex; gap: 6px; }
.mnb .kb-subtab {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
  border: 1.5px solid var(--grid); background: var(--paper); color: var(--ink-soft);
  font-size: 13.5px; font-weight: 700; font-family: inherit;
}
.mnb .kb-subtab.active { border-color: var(--ink); background: var(--ink); color: #fff; }
.mnb .kb-subtab:hover:not(.active) { border-color: var(--ink-soft); }

.mnb .kb-banner {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 999px;
  border: 1.5px solid var(--grid);
}
.mnb .kb-banner.ok { color: #1f8a55; background: #E9F7EF; border-color: #bfe4cd; }
.mnb .kb-banner.error { color: var(--margin); background: #FBECEC; border-color: #e6bcbc; }
.mnb .kb-banner.info { color: var(--ink-soft); background: #F1F2F5; }
.mnb .kb-banner-retry {
  margin-left: 6px; border: none; background: none; color: inherit; cursor: pointer;
  font-weight: 700; text-decoration: underline; font-family: inherit; font-size: 12.5px;
}

.mnb .kb-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px;
}
.mnb .kb-toolbar-title { font-size: 14px; font-weight: 700; color: var(--ink); }
.mnb .kb-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 13px; border-radius: 8px; cursor: pointer;
  border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink);
  font-size: 13px; font-weight: 700; font-family: inherit;
}
.mnb .kb-btn:hover:not(:disabled) { background: var(--ink); color: #fff; }
.mnb .kb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mnb .kb-btn.primary { border-color: var(--accent-2); background: var(--accent-2); color: #fff; }
.mnb .kb-btn.primary:hover:not(:disabled) { filter: brightness(0.94); background: var(--accent-2); color: #fff; }
.mnb .kb-btn.stop { border-color: var(--margin); color: var(--margin); }
.mnb .kb-btn.stop:hover:not(:disabled) { background: var(--margin); color: #fff; }
.mnb .kb-link-btn {
  border: none; background: none; color: var(--ink-soft); cursor: pointer;
  font-size: 12.5px; font-weight: 600; font-family: inherit; padding: 2px 0;
}
.mnb .kb-link-btn:hover { color: var(--ink); }

/* 教材清单 */
.mnb .kb-books-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 4px; }
.mnb .kb-book-card {
  border: 1.5px solid var(--grid); border-radius: 10px; padding: 14px 16px; background: var(--card);
}
.mnb .kb-book-name { font-size: 14.5px; font-weight: 700; color: var(--ink); margin-bottom: 6px; word-break: break-all; }
.mnb .kb-book-id { font-size: 11.5px; color: var(--ink-soft); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 对话 */
.mnb .kb-chat-layout { display: flex; gap: 16px; align-items: stretch; height: calc(100vh - 240px); min-height: 520px; }
.mnb .kb-sessions { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px dashed var(--grid); padding-right: 16px; }
.mnb .kb-session-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.mnb .kb-session-item {
  padding: 9px 10px; border-radius: 8px; cursor: pointer; border: 1.5px solid transparent;
}
.mnb .kb-session-item:hover { background: var(--paper); }
.mnb .kb-session-item.active { border-color: var(--ink); background: var(--paper); }
.mnb .kb-session-title { font-size: 13px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mnb .kb-session-meta { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
.mnb .kb-chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.mnb .kb-messages { flex: 1; overflow-y: auto; padding: 4px 2px 12px; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.mnb .kb-turn {
  position: relative; display: flex; flex-direction: column; gap: 14px;
  padding-top: 22px; border-top: 2px dashed var(--grid);
}
.mnb .kb-turn:first-child { padding-top: 0; border-top: none; }
.mnb .kb-turn-label {
  position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
  background: #EAF4F1; border: 1.5px solid var(--accent-2); border-radius: 999px;
  padding: 1px 14px; font-size: 11.5px; font-weight: 800; color: #237a6c;
  letter-spacing: 1px; white-space: nowrap;
}
.mnb .kb-msg { display: flex; flex-direction: column; }
.mnb .kb-msg-role { font-size: 11.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 4px; }
.mnb .kb-msg.user .kb-msg-role { color: var(--accent-2); }
.mnb .kb-msg-user { font-size: 14px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; }
.mnb .kb-msg.assistant { align-self: stretch; }
.mnb .kb-msg.assistant .kb-md { font-size: 14px; line-height: 1.7; color: var(--ink); }
.mnb .kb-thinking { margin-bottom: 6px; font-size: 12px; color: var(--ink-soft); }
.mnb .kb-thinking summary { cursor: pointer; font-weight: 600; }
.mnb .kb-thinking > div { margin-top: 4px; padding: 6px 8px; background: var(--paper); border-radius: 6px; white-space: pre-wrap; max-height: 180px; overflow-y: auto; }
.mnb .kb-streaming-hint { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
.mnb .kb-msg-meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 6px; }
.mnb .kb-composer { display: flex; gap: 10px; align-items: flex-end; border-top: 1px dashed var(--grid); padding-top: 12px; margin-top: 8px; flex-shrink: 0; }
.mnb .kb-input {
  flex: 1; min-height: 60px;
  border: 2px solid var(--ink); border-bottom-width: 2px; border-radius: 10px;
  background: #fff; padding: 10px 12px; resize: vertical;
  box-shadow: 0 2px 8px var(--shadow);
}
.mnb .kb-input:focus { border-color: var(--accent-2); box-shadow: 0 0 0 3px rgba(76, 154, 142, 0.15); }
.mnb .kb-input::placeholder { color: #a8b0bd; }

/* Markdown 内容 */
.mnb .kb-md > *:first-child { margin-top: 0; }
.mnb .kb-md > *:last-child { margin-bottom: 0; }
.mnb .kb-md p { margin: 0 0 8px; }
.mnb .kb-md h1, .mnb .kb-md h2, .mnb .kb-md h3 { margin: 12px 0 6px; font-size: 15px; }
.mnb .kb-md ul, .mnb .kb-md ol { margin: 0 0 8px; padding-left: 22px; }
.mnb .kb-md li { margin: 2px 0; }
.mnb .kb-md code { background: var(--paper); padding: 1px 5px; border-radius: 4px; font-size: 12.5px; font-family: monospace; }
.mnb .kb-md pre { background: var(--paper); padding: 10px 12px; border-radius: 8px; overflow-x: auto; margin: 0 0 8px; }
.mnb .kb-md pre code { background: none; padding: 0; }
.mnb .kb-md blockquote { border-left: 3px solid var(--grid); margin: 0 0 8px; padding: 2px 12px; color: var(--ink-soft); }
.mnb .kb-md table { border-collapse: collapse; margin: 0 0 8px; font-size: 13px; }
.mnb .kb-md th, .mnb .kb-md td { border: 1px solid var(--grid); padding: 5px 9px; }
.mnb .kb-md a { color: var(--accent-2); }
.mnb .kb-md img { max-width: 100%; border-radius: 6px; }

/* 关联教材原图：缩略图一行（横向滚动），点击放大 + 左右翻页 */
.mnb .kb-textbook-images { margin-top: 10px; }
.mnb .kb-textbook-images-head {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px;
}
.mnb .kb-thumb-strip {
  display: flex; flex-direction: row; flex-wrap: nowrap; gap: 8px;
  overflow-x: auto; padding-bottom: 6px;
}
.mnb .kb-thumb {
  flex: 0 0 auto; width: 96px; padding: 0; border: 1.5px solid var(--grid);
  border-radius: 8px; background: var(--card); cursor: zoom-in; overflow: hidden;
  font-family: inherit; text-align: center;
}
.mnb .kb-thumb:hover { border-color: var(--accent-2); box-shadow: 0 2px 8px var(--shadow); }
.mnb .kb-thumb img {
  display: block; width: 96px; height: 120px; object-fit: cover; object-position: top;
}
.mnb .kb-thumb-label {
  display: block; font-size: 11px; color: var(--ink-soft); padding: 3px 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 导入 */
.mnb .kb-build-layout { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.mnb .kb-build-form { flex: 1; min-width: 320px; }
.mnb .kb-build-progress { flex: 1; min-width: 320px; border-left: 1px dashed var(--grid); padding-left: 20px; }
.mnb .kb-estimate { margin-top: 14px; border: 1.5px solid var(--grid); border-radius: 10px; padding: 12px 14px; background: var(--paper); }
.mnb .kb-estimate-title { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 8px; }
.mnb .kb-estimate-grid { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13px; color: var(--ink); }
.mnb .kb-estimate-grid b { color: var(--margin); }
.mnb .kb-estimate-total { width: 100%; margin-top: 4px; }
.mnb .kb-hint { font-size: 12px; color: #a97f12; margin-top: 8px; }
.mnb .kb-notice { font-size: 12.5px; color: var(--accent-2); margin-top: 10px; font-weight: 600; }
.mnb .kb-status-line { font-size: 13px; margin-bottom: 10px; }
.mnb .kb-status-badge {
  display: inline-block; font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 2px 10px;
  border: 1.5px solid currentColor; text-transform: uppercase;
}
.mnb .kb-status-badge.running { color: #3b6cc4; background: #EAF1FC; }
.mnb .kb-status-badge.queued { color: #7b8494; background: #F1F2F5; }
.mnb .kb-status-badge.done { color: #1f8a55; background: #E9F7EF; }
.mnb .kb-status-badge.failed { color: var(--margin); background: #FBECEC; }
.mnb .kb-status-badge.cancelled { color: #a97f12; background: #FBF3DC; }
.mnb .kb-progress { margin-bottom: 12px; }
.mnb .kb-progress-head { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-soft); margin-bottom: 4px; }
.mnb .kb-progress-track { height: 8px; border-radius: 999px; background: var(--grid); overflow: hidden; }
.mnb .kb-progress-fill { height: 100%; background: var(--accent-2); border-radius: 999px; transition: width 0.3s ease; }
.mnb .kb-progress-fill.active { background: linear-gradient(90deg, var(--accent-2), #6fb8ac); }
.mnb .kb-log { margin-top: 12px; max-height: 260px; overflow-y: auto; background: #2b2b2b; border-radius: 8px; padding: 10px 12px; }
.mnb .kb-log-line { font-family: monospace; font-size: 11.5px; color: #d7d7d7; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.mnb .kb-tasks-history { margin-top: 8px; }
.mnb .kb-task-row {
  display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 7px; cursor: pointer; font-size: 12.5px;
}
.mnb .kb-task-row:hover { background: var(--paper); }
.mnb .kb-task-id { font-family: monospace; color: var(--ink-soft); flex-shrink: 0; }
.mnb .kb-task-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.mnb .kb-task-time { color: var(--ink-soft); flex-shrink: 0; }
@media (max-width: 720px) {
  .mnb .kb-chat-layout { flex-direction: column; height: auto; min-height: 0; }
  .mnb .kb-messages { max-height: 60vh; }
  .mnb .kb-sessions { width: 100%; border-right: none; padding-right: 0; border-bottom: 1px dashed var(--grid); padding-bottom: 12px; max-height: 200px; }
  .mnb .kb-build-progress { border-left: none; padding-left: 0; border-top: 1px dashed var(--grid); padding-top: 16px; }
}
`;

// ============== TAG PILL (with inline editing) ==============

function TagPill({ tag, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  function commit() {
    const v = value.trim();
    if (v && v !== tag) onEdit(tag, v);
    else setValue(tag);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="tag-pill">
        <input
          ref={inputRef}
          className="tag-edit-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setValue(tag); setEditing(false); }
          }}
          onBlur={commit}
        />
        <button onClick={commit} title="确认"><Check size={11} /></button>
      </span>
    );
  }

  return (
    <span className="tag-pill editable" onDoubleClick={() => setEditing(true)}>
      {tag}
      <button onClick={() => setEditing(true)} title="编辑"><Edit3 size={10} /></button>
      <button onClick={() => onDelete(tag)} title="删除"><X size={11} /></button>
    </span>
  );
}

// 五星难度评分组件
// ============== DATE VIEW HELPERS ==============

function getDateKey(dateStr, viewType) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  if (viewType === 'day') {
    return { key: `${y}-${m}-${dd}`, label: `${y}-${m}-${dd}` };
  }
  if (viewType === 'month') {
    return { key: `${y}-${m}`, label: `${y}-${m}` };
  }
  if (viewType === 'week') {
    const day = d.getDay(); // 0=Sun, 1=Mon
    const diff = day === 0 ? 6 : day - 1; // days back to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const wy = monday.getFullYear();
    const wm = String(monday.getMonth() + 1).padStart(2, '0');
    const wmd = String(monday.getDate()).padStart(2, '0');
    const wsd = String(sunday.getDate()).padStart(2, '0');

    let label;
    if (monday.getMonth() === sunday.getMonth()) {
      label = `${wy}-${wm}-${wmd}-${wsd}`;
    } else {
      const wsm = String(sunday.getMonth() + 1).padStart(2, '0');
      label = `${wy}-${wm}-${wmd} 至 ${wsm}-${wsd}`;
    }
    return { key: `${wy}-${wm}-${wmd}`, label };
  }
  return null;
}

// ============== STAR RATING ==============

function StarRating({ value, onChange, readonly = false, size = 18 }) {
  const [hover, setHover] = useState(0);
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= (hover || value || 0);
    stars.push(
      <span
        key={i}
        className={`star-rating-star${filled ? ' filled' : ''}${!readonly ? ' clickable' : ''}`}
        style={{ fontSize: size, cursor: readonly ? 'default' : 'pointer' }}
        onMouseEnter={() => !readonly && setHover(i)}
        onMouseLeave={() => !readonly && setHover(0)}
        onClick={() => !readonly && onChange && onChange(i)}
      >
        ★
      </span>
    );
  }
  return <span className="star-rating">{stars}</span>;
}

// ============== PROBLEM CARD ==============

// 掌握程度：红/黄/绿三色灯，仅凭灯色即可判断掌握情况
const MASTERY_META = {
  mastered: { label: '已掌握', color: '#2E9E5B' }, // 绿灯
  practice: { label: '勤复习', color: '#D9A013' }, // 黄灯
  unfamiliar: { label: '待攻克', color: '#D64545' }, // 红灯（默认）
};

// 找相似题的匹配类型（与后端 similar.py 的 match_kind 一致）
const SIMILAR_KIND_META = {
  same: { label: '同题', icon: '🟢', color: '#1f8a55', desc: '与输入题目相同或几乎相同' },
  variant: { label: '变体', icon: '🟡', color: '#a97f12', desc: '与输入题目结构相同，数据或字母等略有变化' },
  similar: { label: '类似', icon: '🔵', color: '#3b6cc4', desc: '考查相似知识点与题型' },
  weak: { label: '弱相关', icon: '⚪', color: '#7b8494', desc: '相关性较弱，仅供参考' },
};

function MasteryLight({ mastery, size = 12 }) {
  const meta = MASTERY_META[mastery] || MASTERY_META.unfamiliar;
  return (
    <span className="mastery-light"
      style={{ width: size, height: size, background: meta.color }}
      title={meta.label} />
  );
}

function ProblemCard({ problem, imageUrl, onClick, showOverdue, reminder, reminderLoading, extraFooter }) {
  const isOverdue = showOverdue && problem.is_focus_overdue;
  return (
    <div className={'card' + (isOverdue ? ' card-overdue' : '') + (showOverdue ? ' card-focus-context' : '')} onClick={onClick}>
      {problem.is_focus_practice === 1 && (
        <div className="card-focus-badge">重点练</div>
      )}
      <div className="card-thumb">
        <img src={imageUrl} alt={problem.title} loading="lazy" />
      </div>
      <div className="card-body">
        <p className="card-title">{problem.title || '未命名题目'}</p>
        <div className="card-tags">
          {(problem.tags || []).slice(0, 4).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="card-meta">
          <span className="card-mastery">
            <MasteryLight mastery={problem.mastery} size={13} />
            <span>{(MASTERY_META[problem.mastery] || MASTERY_META.unfamiliar).label}</span>
          </span>
          <StarRating value={problem.difficulty} readonly size={14} />
          {(problem.practice_count > 0) && (
            <span className="card-practice">练习 {problem.practice_count} 次</span>
          )}
        </div>
        {isOverdue && (
          <div className="card-overdue-info">
            ⏰ {problem.inactive_days_text || '0 天'}未练习
          </div>
        )}
        {showOverdue && reminder && (
          <div className="card-reminder">
            💬 {reminder}
          </div>
        )}
        {showOverdue && reminderLoading && !reminder && (
          <div className="card-reminder loading">
            <Loader2 size={11} className="spin" /> 生成鼓励语…
          </div>
        )}
        {extraFooter && <div className="card-extra-footer">{extraFooter}</div>}
      </div>
    </div>
  );
}

// ============== ZOOMABLE IMAGE PREVIEW ==============
// 窗口随图片整体缩放：滚轮/按钮改变图片显示尺寸，预览窗口同步变大变小，
// 超出屏幕时容器内部出现滚动条；双击切换 适应窗口/100%。

function ZoomableImagePreview({ src, alt, onClose, images, index = 0, onNavigate }) {
  // 翻页支持：传入 images（src 数组）+ index + onNavigate 时，可用左右箭头/键盘切换多张图片
  const navList = Array.isArray(images) && images.length > 0 ? images : [src];
  const safeIndex = Math.min(Math.max(index, 0), navList.length - 1);
  const currentSrc = navList[safeIndex];
  const canNav = navList.length > 1 && typeof onNavigate === 'function';
  const hasPrev = canNav && safeIndex > 0;
  const hasNext = canNav && safeIndex < navList.length - 1;

  const scrollRef = useRef(null);
  const dialogRef = useRef(null);
  const prevFocusRef = useRef(null);
  const [nat, setNat] = useState(null);   // { w, h } 自然尺寸
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const natRef = useRef(null);
  natRef.current = nat;

  // 拖拽移动预览窗口
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  function onDragStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    const d = dragRef.current;
    if (!d) return;
    let x = d.origX + (e.clientX - d.startX);
    let y = d.origY + (e.clientY - d.startY);
    // 边界限制：窗口整体不超出视口（基于当前窗口尺寸夹紧）
    const el = dialogRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.width < vw) {
        const half = (vw - r.width) / 2;
        x = Math.max(-half, Math.min(half, x));
      } else {
        x = 0;
      }
      if (r.height < vh) {
        const half = (vh - r.height) / 2;
        y = Math.max(-half, Math.min(half, y));
      } else {
        y = 0;
      }
    }
    setOffset({ x, y });
  }

  function onDragEnd() {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 10;
  const ZOOM_STEP = 1.25;

  // 图片加载完成：计算适应屏幕的初始缩放
  function handleImgLoad(e) {
    if (natRef.current) return;
    const w = e.target.naturalWidth || 1;
    const h = e.target.naturalHeight || 1;
    setNat({ w, h });
    const fitScale = computeFitScale(w, h);
    setScale(fitScale);
  }

  function computeFitScale(w, h) {
    // 基于滚动容器的实际可视尺寸计算，确保适应窗口时不出现滚动条/溢出
    const el = scrollRef.current;
    const maxW = (el ? el.clientWidth : window.innerWidth * 0.92) - 24;
    const maxH = (el ? el.clientHeight : window.innerHeight * 0.92) - 24;
    return Math.min(maxW / w, maxH / h, 1);
  }

  // 打开时记录焦点、关闭后恢复
  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    dialogRef.current?.focus?.();
    return () => { prevFocusRef.current?.focus?.(); };
  }, []);

  // Esc 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 切换图片时重置缩放/位移（layout effect 保证在新图片 load 事件之前执行）
  useLayoutEffect(() => {
    setNat(null);
    setScale(1);
    scaleRef.current = 1;
    setOffset({ x: 0, y: 0 });
  }, [currentSrc]);

  // 键盘左右方向键翻页
  useEffect(() => {
    if (!canNav) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); onNavigate(safeIndex - 1); }
      if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); onNavigate(safeIndex + 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canNav, hasPrev, hasNext, safeIndex, onNavigate]);

  // 滚轮缩放：保持光标下的图像点不动（调整滚动位置补偿）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const n = natRef.current;
      if (!n) return;
      const oldScale = scaleRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldScale * factor));
      if (newScale === oldScale) return;
      // 光标相对容器的位置 → 图片坐标
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const ix = (el.scrollLeft + px) / oldScale;  // 图片上的点（自然像素）
      const iy = (el.scrollTop + py) / oldScale;
      scaleRef.current = newScale;
      setScale(newScale);
      // 缩放后调整滚动条，让该点仍在光标下
      requestAnimationFrame(() => {
        el.scrollLeft = ix * newScale - px;
        el.scrollTop = iy * newScale - py;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [nat]);

  function zoomCentered(target) {
    const el = scrollRef.current;
    const n = natRef.current;
    if (!el || !n) return;
    const oldScale = scaleRef.current;
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target));
    if (newScale === oldScale) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    const ix = (el.scrollLeft + cx) / oldScale;
    const iy = (el.scrollTop + cy) / oldScale;
    setScale(newScale);
    requestAnimationFrame(() => {
      el.scrollLeft = ix * newScale - cx;
      el.scrollTop = iy * newScale - cy;
    });
  }

  function zoomIn() { zoomCentered(scaleRef.current * ZOOM_STEP); }
  function zoomOut() { zoomCentered(scaleRef.current / ZOOM_STEP); }
  function showActual() { zoomCentered(1); }
  function resetFit() {
    const n = natRef.current;
    if (!n) return;
    setScale(computeFitScale(n.w, n.h));
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
    });
  }

  function handleDoubleClick() {
    const n = natRef.current;
    if (!n) return;
    const fit = computeFitScale(n.w, n.h);
    if (Math.abs(scaleRef.current - fit) < 0.01) {
      showActual();
    } else {
      resetFit();
    }
  }

  const zoomPercent = Math.round(scale * 100);
  const fitScale = nat ? computeFitScale(nat.w, nat.h) : 1;
  const nearFit = Math.abs(scale - fitScale) < 0.01;

  return (
    <div className="image-preview-overlay" onClick={onClose}>
      <div className="image-preview-modal zoomable" ref={dialogRef} tabIndex={-1}
        role="dialog" aria-modal="true" aria-label={alt || '图片预览'}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <button className="modal-close" onClick={onClose} title="关闭 (Esc)"><X size={16} /></button>
        <div className="zoom-preview-handle" onMouseDown={onDragStart}
          title="按住拖动移动预览窗口">
          <span className="zoom-preview-handle-title">{alt || '图片预览'}</span>
          <span className="zoom-preview-handle-hint">按住拖动移动</span>
        </div>
        <div
          ref={scrollRef}
          className="zoom-preview-scroll"
          onDoubleClick={handleDoubleClick}
          title="滚轮缩放 · 双击切换 适应窗口/原始大小"
        >
          <img
            key={currentSrc}
            src={currentSrc}
            alt={alt || '图片预览'}
            draggable={false}
            onLoad={handleImgLoad}
            style={nat ? { width: nat.w * scale, height: nat.h * scale } : { visibility: 'hidden', maxWidth: '92vw', maxHeight: '80vh' }}
          />
        </div>
        <div className="zoom-preview-toolbar">
          <button className="zoom-tool-btn" onClick={zoomOut}
            disabled={!nat || scale <= ZOOM_MIN} title="缩小">
            <ZoomOut size={15} />
          </button>
          <span className="zoom-tool-label" onClick={resetFit} title="点击恢复适应窗口">
            {zoomPercent}%
          </span>
          <button className="zoom-tool-btn" onClick={zoomIn}
            disabled={!nat || scale >= ZOOM_MAX} title="放大">
            <ZoomIn size={15} />
          </button>
          <span className="zoom-tool-sep" />
          <button className="zoom-tool-btn" onClick={showActual}
            disabled={!nat || Math.abs(scale - 1) < 0.01} title="原始大小 100%">
            <span style={{ fontSize: 11, fontWeight: 700 }}>1:1</span>
          </button>
          <button className="zoom-tool-btn" onClick={resetFit}
            disabled={!nat || nearFit} title="适应窗口">
            <Maximize size={14} />
          </button>
          {canNav && (
            <>
              <span className="zoom-tool-sep" />
              <span className="zoom-tool-label" style={{ minWidth: 'auto' }} title="图片序号">{safeIndex + 1} / {navList.length}</span>
            </>
          )}
        </div>
      </div>
      {hasPrev && (
        <button className="zoom-preview-nav left" onClick={(e) => { e.stopPropagation(); onNavigate(safeIndex - 1); }}
          title="上一张 ←">
          <ChevronLeft size={22} />
        </button>
      )}
      {hasNext && (
        <button className="zoom-preview-nav right" onClick={(e) => { e.stopPropagation(); onNavigate(safeIndex + 1); }}
          title="下一张 →">
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}

// ============== 知识库 tab（sida-agent 集成） ==============

const KB_SUBJECTS = [
  { value: 'physics', label: '物理' },
  { value: 'chemistry', label: '化学' },
  { value: 'math', label: '数学' },
];

// Markdown + LaTeX 公式渲染（sida-agent 回答含 $...$ / $$...$$ 与来源标注）
function KbMarkdown({ text }) {
  return (
    <div className="kb-md">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text || ''}
      </ReactMarkdown>
    </div>
  );
}

function KbServiceBanner({ health, healthLoading, onRetry }) {
  if (healthLoading) {
    return <div className="kb-banner info"><Loader2 size={14} className="spin" /> 正在连接知识库服务…</div>;
  }
  if (health && health.error) {
    return (
      <div className="kb-banner error">
        <AlertCircle size={14} /> {health.error}
        <button className="kb-banner-retry" onClick={onRetry}>重试</button>
      </div>
    );
  }
  if (health) {
    return (
      <div className="kb-banner ok">
        <Link2 size={14} /> 已连接 · 图谱 {health.graph_nodes} 节点 / 向量 {health.vector_count} 条
      </div>
    );
  }
  return null;
}

// ---- 子视图①：教材清单 ----
function KbBooks({ health, healthLoading, onRetry }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const data = await AgentAPI.books();
      setBooks(data.books || []);
    } catch (e) {
      setError(e.message || '加载失败'); setBooks([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (health && !health.error) load(); }, [health]);

  return (
    <div>
      <div className="kb-toolbar">
        <span className="kb-toolbar-title">入库教材（{books.length}）</span>
        <button className="kb-btn" onClick={() => { onRetry && onRetry(); load(); }} disabled={loading || healthLoading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} 刷新
        </button>
      </div>
      {error && <div className="save-msg error" style={{ marginTop: 8 }}>{error}</div>}
      {!error && !loading && books.length === 0 && (
        <div className="empty"><BookOpen size={36} /><p>知识库中暂无教材</p>
          <p style={{ fontSize: 13 }}>到「导入」子页把教材 PDF 灌入知识库</p></div>
      )}
      <div className="kb-books-grid">
        {books.map((b) => (
          <div key={b.pdf_id} className="kb-book-card">
            <div className="kb-book-name"><BookOpen size={15} style={{ verticalAlign: -2, marginRight: 5 }} />{b.name}</div>
            <div className="kb-book-id" title={b.pdf_id}>pdf_id: {b.pdf_id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 把知识库回答末尾的「【教材原图】」区块拆出来：正文 + 图片缩略图列表。
// sida-agent 的答案 Markdown 以「---」+「## 【教材原图】」+ 若干 **教材第 N 页** /
// ![..](url) 结尾（见其 storage/image_store.render_image_section）；URL 经后端改写为
// 指向 sida-agent /pdf_images 静态挂载的绝对地址，浏览器可直接加载。
const KB_IMAGE_SECTION_RE = /\n-{3,}\s*\n+#{1,6}\s*【教材原图】/;
function splitKbAnswer(text) {
  if (!text) return { body: text || '', images: [] };
  const m = KB_IMAGE_SECTION_RE.exec(text);
  if (!m) return { body: text, images: [] };
  const body = text.slice(0, m.index).replace(/\n-{3,}\s*$/, '').trimEnd();
  const section = text.slice(m.index);
  const images = [];
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let g;
  while ((g = imgRe.exec(section))) {
    const alt = (g[1] || '').trim();
    images.push({ url: g[2], label: alt || `图 ${images.length + 1}` });
  }
  return { body, images };
}

// 单条消息（用户提问 / 知识库回答）的渲染；供轮次分组使用
function KbMsgNode({ m }) {
  // 关联教材原图：点缩略图放大，左右方向键 / 箭头翻页（-1 = 预览关闭）
  const [previewIdx, setPreviewIdx] = useState(-1);
  const isAssistant = m.role === 'assistant';
  const split = isAssistant ? splitKbAnswer(m.content) : { body: m.content, images: [] };
  const images = split.images;
  return (
    <div className={'kb-msg ' + m.role}>
      <div className="kb-msg-role">{m.role === 'user' ? '我' : '知识库'}</div>
      {isAssistant && m.thinking ? (
        <details className="kb-thinking"><summary>思考过程</summary><div>{m.thinking}</div></details>
      ) : null}
      {isAssistant
        ? <KbMarkdown text={split.body} />
        : <div className="kb-msg-user">{m.content}</div>}
      {m._streaming && !m.content && <span className="kb-streaming-hint"><Loader2 size={12} className="spin" /> 生成中…</span>}
      {isAssistant && images.length > 0 && (
        <div className="kb-textbook-images">
          <div className="kb-textbook-images-head">
            <Images size={13} /> 关联教材原图（{images.length}）· 点击放大，← / → 翻页
          </div>
          <div className="kb-thumb-strip">
            {images.map((im, i) => (
              <button key={im.url + '#' + i} type="button" className="kb-thumb" title={im.label}
                onClick={() => setPreviewIdx(i)}>
                <img src={im.url} alt={im.label} loading="lazy" />
                <span className="kb-thumb-label">{im.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {m.meta && (m.meta.subject || m.meta.concept) && (
        <div className="kb-msg-meta">学科：{m.meta.subject || '—'}{m.meta.concept ? ` · 概念：${m.meta.concept}` : ''}</div>
      )}
      {isAssistant && previewIdx >= 0 && images[previewIdx] && (
        <ZoomableImagePreview
          src={images[previewIdx].url}
          alt={images[previewIdx].label || '教材原图'}
          images={images.map((im) => im.url)}
          index={previewIdx}
          onNavigate={(i) => setPreviewIdx(Math.max(0, Math.min(images.length - 1, i)))}
          onClose={() => setPreviewIdx(-1)}
        />
      )}
    </div>
  );
}

// ---- 子视图②：多轮对话（SSE 流式） ----
function KbChat({ health, healthLoading }) {
  const serviceDown = health && health.error;
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const [messages, setMessages] = useState([]);   // {role:'user'|'assistant', content, thinking}
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const data = await AgentAPI.listSessions();
      setSessions(data.sessions || []);
    } catch (e) { /* 服务未就绪时静默 */ }
    finally { setSessionsLoading(false); }
  }
  useEffect(() => { if (!serviceDown) loadSessions(); }, [serviceDown]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  async function openSession(id) {
    if (streaming) return;
    setCurrentId(id); setError('');
    if (!id) { setMessages([]); return; }
    try {
      const data = await AgentAPI.getSession(id);
      setMessages((data.messages || []).map((m) => ({
        role: m.role === 'human' ? 'user' : 'assistant', content: m.content
      })));
    } catch (e) { setMessages([]); setError(e.message || '读取会话失败'); }
  }

  async function newSession() {
    if (streaming) return;
    try {
      const data = await AgentAPI.createSession();
      const id = data.thread_id;
      setSessions((s) => [{ thread_id: id, first_question: '（新会话）', turns: 0, updated_at: '' }, ...s]);
      setCurrentId(id); setMessages([]); setError('');
    } catch (e) { setError(e.message || '新建会话失败'); }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError('');
    // 懒创建会话
    let sid = currentId;
    if (!sid) {
      try { const d = await AgentAPI.createSession(); sid = d.thread_id; setCurrentId(sid); }
      catch (e) { setError(e.message || '无法创建会话'); return; }
    }
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', thinking: '', _streaming: true }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = ''; let think = '';
    try {
      const resp = await fetch(`/api/agent/chat/sessions/${encodeURIComponent(sid)}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, stream: true }), signal: ctrl.signal
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${t.slice(0, 200)}`);
      }
      await readSSEStream(resp, (evt) => {
        if (evt.type === 'token') { acc += evt.text || ''; patchLast({ content: acc }); }
        else if (evt.type === 'reasoning') { think += evt.text || ''; patchLast({ thinking: think }); }
        else if (evt.type === 'result') {
          const r = evt.data || {};
          if (r.reply) acc = r.reply;
          patchLast({ content: acc, _streaming: false, meta: { subject: r.target_subject, concept: r.target_concept, answer_path: r.answer_path } });
        }
        else if (evt.type === 'error') { setError(evt.detail || '流式返回错误'); patchLast({ _streaming: false }); }
      }, ctrl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || '对话请求失败');
    } finally {
      patchLast({ _streaming: false });
      setStreaming(false); abortRef.current = null;
      loadSessions();
    }
    function patchLast(patch) {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = prev.slice();
        next[next.length - 1] = { ...next[next.length - 1], ...patch };
        return next;
      });
    }
  }

  function stop() { if (abortRef.current) abortRef.current.abort(); }

  if (serviceDown) {
    return <div className="empty"><AlertCircle size={36} /><p>知识库服务未连接</p>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{health.error}</p></div>;
  }

  return (
    <div className="kb-chat-layout">
      <div className="kb-sessions">
        <div className="kb-toolbar">
          <span className="kb-toolbar-title">会话</span>
          <button className="kb-btn" onClick={newSession} disabled={streaming}><Plus size={14} /> 新建</button>
        </div>
        {sessionsLoading && <div style={{ padding: 10, color: 'var(--ink-soft)', fontSize: 13 }}><Loader2 size={14} className="spin" /> 加载中…</div>}
        <div className="kb-session-list">
          {sessions.map((s) => (
            <div key={s.thread_id} className={'kb-session-item' + (s.thread_id === currentId ? ' active' : '')}
              onClick={() => openSession(s.thread_id)} title={s.thread_id}>
              <div className="kb-session-title">{s.first_question || s.thread_id}</div>
              <div className="kb-session-meta">{s.turns || 0} 轮 · {formatTime(s.updated_at)}</div>
            </div>
          ))}
          {!sessionsLoading && sessions.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--ink-soft)' }}>暂无会话，点「新建」开始</div>
          )}
        </div>
      </div>

      <div className="kb-chat-main">
        <div className="kb-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty" style={{ padding: '40px 20px' }}><MessageSquare size={34} />
              <p>选择或新建一个会话，向知识库提问</p>
              <p style={{ fontSize: 13 }}>答案可溯源到教材页码，支持公式与教材原图</p></div>
          )}
          {(() => {
            // 按「用户提问 + 知识库回答」分轮，轮与轮之间用分隔线明显隔开
            const turns = [];
            messages.forEach((m) => {
              if (m.role === 'user') turns.push({ user: m, assistant: null });
              else if (turns.length && !turns[turns.length - 1].assistant) turns[turns.length - 1].assistant = m;
              else turns.push({ user: null, assistant: m });
            });
            return turns.map((t, ti) => (
              <div key={ti} className="kb-turn">
                {turns.length > 1 && <div className="kb-turn-label">第 {ti + 1} 轮</div>}
                {t.user && <KbMsgNode m={t.user} />}
                {t.assistant && <KbMsgNode m={t.assistant} />}
              </div>
            ));
          })()}
        </div>
        {error && <div className="save-msg error" style={{ margin: '0 12px 8px' }}>{error}</div>}
        <div className="kb-composer">
          <textarea className="kb-input" value={input} rows={3}
            placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          {streaming
            ? <button className="kb-btn stop" onClick={stop}><Square size={14} /> 停止</button>
            : <button className="kb-btn primary" onClick={send} disabled={!input.trim()}><Send size={14} /> 发送</button>}
        </div>
      </div>
    </div>
  );
}

// ---- 子视图③：导入（build 异步任务 + SSE 进度） ----
function KbBuild({ health, healthLoading }) {
  const serviceDown = health && health.error;
  const [pdf, setPdf] = useState('');
  const [book, setBook] = useState('');
  const [startPage, setStartPage] = useState('1');
  const [endPage, setEndPage] = useState('12');
  const [subject, setSubject] = useState('physics');
  const [maxNewCalls, setMaxNewCalls] = useState('');
  const [maxChunks, setMaxChunks] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [taskId, setTaskId] = useState('');
  const [taskStatus, setTaskStatus] = useState('');   // queued/running/done/failed
  const [prog, setProg] = useState({ visionDone: 0, visionTotal: 0, extractDone: 0, extractTotal: 0, stage: '', logs: [] });
  const abortRef = useRef(null);
  const [tasks, setTasks] = useState([]);

  const buildPayload = (confirm) => {
    const p = {
      pdf: pdf.trim(),
      startPage: parseInt(startPage, 10) || 1,
      endPage: parseInt(endPage, 10) || 1,
      subject,
    };
    if (book.trim()) p.book = book.trim();
    if (maxNewCalls.trim()) p.maxNewCalls = parseInt(maxNewCalls, 10);
    if (maxChunks.trim()) p.maxChunks = parseInt(maxChunks, 10);
    if (confirm !== undefined) p.confirm = confirm;
    return p;
  };

  async function doEstimate() {
    if (!pdf.trim()) { setError('请先填写教材 PDF 路径'); return; }
    setEstimating(true); setError(''); setEstimate(null);
    try { setEstimate(await AgentAPI.buildEstimate(buildPayload())); }
    catch (e) { setError(e.message || '预估失败'); }
    finally { setEstimating(false); }
  }

  async function loadTasks() {
    try { const d = await AgentAPI.buildTasks(); setTasks((d.tasks || []).slice().reverse()); }
    catch (e) { /* ignore */ }
  }
  useEffect(() => { if (!serviceDown) loadTasks(); }, [serviceDown]);

  async function doSubmit() {
    if (!pdf.trim()) { setError('请先填写教材 PDF 路径'); return; }
    setSubmitting(true); setError(''); setNotice('');
    const res = await agentBuildSubmitRaw(buildPayload(true));
    setSubmitting(false);
    if (res.ok) {
      const t = res.body;
      setNotice(`建库任务已提交：${t.task_id}（${t.status}）`);
      subscribe(t.task_id);
      loadTasks();
    } else if (res.status === 409) {
      const detail = (res.body && res.body.detail) || {};
      if (detail.active_task_id) {
        setNotice('已有建库任务在执行，已切换到该任务的进度：' + detail.active_task_id);
        subscribe(detail.active_task_id);
      } else {
        setError(detail.message || '提交被拒绝（409）：' + JSON.stringify(detail));
      }
    } else {
      const detail = (res.body && res.body.detail);
      setError(typeof detail === 'string' ? detail : (detail && detail.message) || `提交失败 HTTP ${res.status}`);
    }
  }

  function logLine(evt) {
    const bits = [];
    if (evt.stage === 'vision') {
      if (evt.event === 'start') bits.push(`视觉提取开始：${evt.pdf_name || ''} 第 ${evt.start_page}-${evt.end_page} 页（共 ${evt.total_pages} 页）`);
      else if (evt.event === 'page_done') { bits.push(`视觉提取 ${evt.done}/${evt.total_pages} 页${evt.cached ? '（缓存）' : ''}`); setProg((p) => ({ ...p, visionDone: evt.done, visionTotal: evt.total_pages, stage: 'vision' })); }
      else if (evt.event === 'capped') bits.push(`视觉提取达上限停止（max_new_calls=${evt.max_new_calls}）`);
      else if (evt.event === 'vision_done') bits.push(`视觉提取完成：${evt.processed_pages} 页，新调用 ${evt.new_vision_calls} 次`);
    } else if (evt.stage === 'extract') {
      if (evt.event === 'plan') { bits.push(`切分为 ${evt.total_chunks} 个子块`); setProg((p) => ({ ...p, extractTotal: evt.total_chunks })); }
      else if (evt.event === 'chunk_start') bits.push(`子块 ${evt.chunk}/${evt.total_chunks} 开始${evt.cached ? '（缓存命中）' : ''}：${evt.label || ''}`);
      else if (evt.event === 'chunk_done') { bits.push(`子块 ${evt.chunk}/${evt.total_chunks} 完成：写入 ${evt.docs} 切片，图节点 ${evt.nodes}`); setProg((p) => ({ ...p, extractDone: evt.chunk, extractTotal: evt.total_chunks, stage: 'extract' })); }
      else if (evt.event === 'build_done') bits.push(`抽取入库完成：新抽取 ${evt.new_chunks} 子块，向量 ${evt.docs} 条，图节点 ${evt.nodes}`);
    } else if (evt.stage === 'task') {
      if (evt.event === 'summary') bits.push('任务汇总完成');
    }
    return bits;
  }

  async function subscribe(id) {
    setTaskId(id); setTaskStatus('running');
    setProg({ visionDone: 0, visionTotal: 0, extractDone: 0, extractTotal: 0, stage: '', logs: [] });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const resp = await fetch(AgentAPI.buildEventsUrl(id, 0), { signal: ctrl.signal });
      if (!resp.ok) { const t = await resp.text().catch(() => ''); setError(`进度订阅失败 HTTP ${resp.status} ${t.slice(0, 200)}`); return; }
      await readSSEStream(resp, (evt) => {
        if (evt.type === 'progress') {
          const lines = logLine(evt);
          if (lines.length) setProg((p) => ({ ...p, logs: [...p.logs, ...lines].slice(-200) }));
        } else if (evt.type === 'task_status') {
          setTaskStatus(evt.status);
          if (evt.error) setError('建库失败：' + evt.error);
          if (evt.result) {
            const r = evt.result;
            setProg((p) => ({ ...p, logs: [...p.logs, `✅ 完成：${r.pages} 页 / 图节点 ${r.nodes} / 视觉调用 ${r.vision_calls} / 推理调用 ${r.reasoning_calls}`].slice(-200) }));
          }
          loadTasks();
        } else if (evt.type === 'error') { setError(evt.detail || '进度流错误'); }
      }, ctrl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || '进度订阅中断');
    }
  }

  function unsubscribe() { if (abortRef.current) abortRef.current.abort(); }

  const visionPct = prog.visionTotal ? Math.round(prog.visionDone / prog.visionTotal * 100) : 0;
  const extractPct = prog.extractTotal ? Math.round(prog.extractDone / prog.extractTotal * 100) : 0;
  const running = taskStatus === 'running' || taskStatus === 'queued';

  if (serviceDown) {
    return <div className="empty"><AlertCircle size={36} /><p>知识库服务未连接</p>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{health.error}</p></div>;
  }

  return (
    <div className="kb-build-layout">
      <div className="kb-build-form">
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="field-label">教材 PDF 路径</label>
          <input type="text" value={pdf} onChange={(e) => setPdf(e.target.value)} placeholder="例如：D:\教材\物理9S.pdf" />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            <label className="field-label">教材显示名（可选）</label>
            <input type="text" value={book} onChange={(e) => setBook(e.target.value)} placeholder="缺省取文件名" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 90 }}>
            <label className="field-label">起始页</label>
            <input type="number" min={1} value={startPage} onChange={(e) => setStartPage(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 90 }}>
            <label className="field-label">结束页</label>
            <input type="number" min={1} value={endPage} onChange={(e) => setEndPage(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 100 }}>
            <label className="field-label">学科</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--grid)', borderRadius: 8, background: '#fff', fontFamily: 'inherit', fontSize: 14 }}>
              {KB_SUBJECTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <button className="kb-link-btn" onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? '▾' : '▸'} 高级选项（控成本）</button>
          {showAdvanced && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label className="field-label">本批视觉新调用上限</label>
                <input type="number" min={0} value={maxNewCalls} onChange={(e) => setMaxNewCalls(e.target.value)} placeholder="留空=不限" />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label className="field-label">本次处理新子块上限</label>
                <input type="number" min={0} value={maxChunks} onChange={(e) => setMaxChunks(e.target.value)} placeholder="留空=不限" />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="kb-btn" onClick={doEstimate} disabled={estimating || submitting}>
            {estimating ? <Loader2 size={14} className="spin" /> : <Activity size={14} />} 规模预估
          </button>
          <button className="kb-btn primary" onClick={doSubmit} disabled={submitting || estimating}>
            {submitting ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 确认导入
          </button>
        </div>
        {estimate && (
          <div className="kb-estimate">
            <div className="kb-estimate-title">规模预估（0 模型调用）</div>
            <div className="kb-estimate-grid">
              <span>页区间 <b>{estimate.range_pages}</b></span>
              <span>已缓存页 <b>{estimate.cached_pages}</b></span>
              <span>新增视觉调用 <b>{estimate.new_vision_calls}</b></span>
              <span>新子块 <b>{estimate.new_chunks}</b>（缓存 {estimate.cached_chunks}）</span>
              <span className="kb-estimate-total">预估新增模型调用 <b>{estimate.new_calls_total}</b> 次</span>
            </div>
            {estimate.new_calls_total > 0 && <div className="kb-hint">⚠️「确认导入」将产生约 {estimate.new_calls_total} 次模型调用（会消耗 API 额度）。</div>}
          </div>
        )}
        {notice && <div className="kb-notice">{notice}</div>}
        {error && <div className="save-msg error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="kb-build-progress">
        <div className="kb-toolbar">
          <span className="kb-toolbar-title">导入进度{taskId ? ` · ${taskId}` : ''}</span>
          {running && <button className="kb-btn" onClick={unsubscribe}><Square size={14} /> 断开订阅</button>}
        </div>
        {!taskId && <div style={{ fontSize: 13, color: 'var(--ink-soft)', padding: '8px 0' }}>提交导入后在这里显示逐页 / 逐子块进度。</div>}
        {taskId && (
          <div>
            <div className="kb-status-line">状态：<span className={'kb-status-badge ' + taskStatus}>{taskStatus}</span></div>
            <KbProgressBar label="视觉提取" done={prog.visionDone} total={prog.visionTotal} pct={visionPct} active={prog.stage === 'vision' && running} />
            <KbProgressBar label="抽取入库" done={prog.extractDone} total={prog.extractTotal} pct={extractPct} active={prog.stage === 'extract' && running} />
            {prog.logs.length > 0 && (
              <div className="kb-log">
                {prog.logs.map((l, i) => <div key={i} className="kb-log-line">{l}</div>)}
              </div>
            )}
          </div>
        )}
        {tasks.length > 0 && (
          <div className="kb-tasks-history">
            <div className="kb-toolbar-title" style={{ margin: '14px 0 6px' }}>任务历史</div>
            {tasks.map((t) => (
              <div key={t.task_id} className="kb-task-row" onClick={() => subscribe(t.task_id)} title="点击查看进度">
                <span className={'kb-status-badge ' + t.status}>{t.status}</span>
                <span className="kb-task-id">{t.task_id}</span>
                <span className="kb-task-name">{(t.params && (t.params.book || (t.params.pdf || '').split(/[\\/]/).pop())) || ''}</span>
                <span className="kb-task-time">{formatTime(t.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KbProgressBar({ label, done, total, pct, active }) {
  return (
    <div className="kb-progress">
      <div className="kb-progress-head">
        <span>{label}</span>
        <span>{total ? `${done}/${total}` : (active ? '准备中…' : '—')}</span>
      </div>
      <div className="kb-progress-track">
        <div className={'kb-progress-fill' + (active ? ' active' : '')} style={{ width: (total ? pct : 0) + '%' }} />
      </div>
    </div>
  );
}

// ---- 知识库 tab 容器 ----
function KnowledgeBaseTab() {
  const [sub, setSub] = useState('chat');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function checkHealth() {
    setHealthLoading(true);
    try { setHealth(await AgentAPI.health()); }
    catch (e) { setHealth({ error: e.message || '无法连接知识库服务' }); }
    finally { setHealthLoading(false); }
  }
  useEffect(() => { checkHealth(); }, []);

  const subs = [
    { key: 'books', label: '教材', icon: <BookOpen size={14} /> },
    { key: 'chat', label: '对话', icon: <MessageSquare size={14} /> },
    { key: 'build', label: '导入', icon: <Upload size={14} /> },
  ];

  return (
    <div className="panel">
      <div className="kb-head">
        <div className="kb-subtabs">
          {subs.map((s) => (
            <button key={s.key} className={'kb-subtab' + (sub === s.key ? ' active' : '')} onClick={() => setSub(s.key)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <KbServiceBanner health={health} healthLoading={healthLoading} onRetry={checkHealth} />
      </div>
      {sub === 'books' && <KbBooks health={health} healthLoading={healthLoading} onRetry={checkHealth} />}
      {sub === 'chat' && <KbChat health={health} healthLoading={healthLoading} />}
      {sub === 'build' && <KbBuild health={health} healthLoading={healthLoading} />}
    </div>
  );
}

// ============== MAIN APP ==============

export default function App() {
  const [tab, setTab] = useState('scan');

  // --- Config state ---
  const [imageDir, setImageDir] = useState('');
  const [dirInput, setDirInput] = useState('');
  const [dirSaving, setDirSaving] = useState(false);
  const [dirMsg, setDirMsg] = useState('');
  const [focusTimeoutHours, setFocusTimeoutHours] = useState(48);
  const [focusTimeoutInput, setFocusTimeoutInput] = useState('48');

  // --- sida-agent 知识库服务配置 ---
  const [sidaHostInput, setSidaHostInput] = useState('127.0.0.1');
  const [sidaPortInput, setSidaPortInput] = useState('6173');
  const [sidaSaving, setSidaSaving] = useState(false);
  const [sidaTesting, setSidaTesting] = useState(false);
  const [sidaMsg, setSidaMsg] = useState('');

  // --- Scan state ---
  const [scanData, setScanData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  // --- Analysis state (for unindexed image) ---
  const [analyzingFile, setAnalyzingFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // --- Scan preview & delete ---
  const [scanPreviewImage, setScanPreviewImage] = useState(null);
  const [scanDeleteTarget, setScanDeleteTarget] = useState(null);
  const [scanDeleting, setScanDeleting] = useState(false);
  const scanClickTimerRef = useRef(null);
  // AI 分析请求的取消控制器：「取消」按钮通过它真正中止 fetch，避免旧请求竞态写回 draft
  const analyzeAbortRef = useRef(null);

  // --- Library state ---
  const [allIndexed, setAllIndexed] = useState([]);
  const [totalIndexedCount, setTotalIndexedCount] = useState(0);
  const [libLoaded, setLibLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateViewType, setDateViewType] = useState('week');
  const [activeSubject, setActiveSubject] = useState('数学');
  const [subjects, setSubjects] = useState([]);
  const pendingSubjectRef = useRef(null);

  // --- Mastery filter ---
  const [masteryFilter, setMasteryFilter] = useState('');

  // --- Focus practice state ---
  const [focusItems, setFocusItems] = useState([]);
  const [focusCount, setFocusCount] = useState(0);
  const [focusLoaded, setFocusLoaded] = useState(false);
  const [focusError, setFocusError] = useState('');
  const [focusTimeoutCfg, setFocusTimeoutCfg] = useState(48);
  const [focusOverdueCount, setFocusOverdueCount] = useState(0);
  const [focusReminders, setFocusReminders] = useState({});
  const [focusRemindersLoading, setFocusRemindersLoading] = useState(false);
  const [focusMaxPerSubject, setFocusMaxPerSubject] = useState(10);
  const [focusSubjects, setFocusSubjects] = useState([]);

  // --- AI Token 统计（配置&统计 tab）---
  const [tokenStats, setTokenStats] = useState(null);
  const [tokenStatsLoading, setTokenStatsLoading] = useState(false);
  const [tokenStatsError, setTokenStatsError] = useState('');
  const [tokenScope, setTokenScope] = useState('student'); // student | all

  // --- 多学生（账户）---
  const [students, setStudents] = useState([]);
  const [currentStudentId, setCurrentStudentId] = useState(() => {
    try { return Number(localStorage.getItem('mnb_student_id')) || null; } catch (e) { return null; }
  });
  const [newStudentName, setNewStudentName] = useState('');
  const [studentMsg, setStudentMsg] = useState('');
  const [studentBusy, setStudentBusy] = useState(false);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // --- Timeline state ---
  const [timelineDays, setTimelineDays] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineHasMore, setTimelineHasMore] = useState(true);
  const [timelineOffset, setTimelineOffset] = useState(0);
  const [timelineLoaded, setTimelineLoaded] = useState(false);

  // --- Detail modal ---
  const [detail, setDetail] = useState(null);
  const [detailTagInput, setDetailTagInput] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailDirty, setDetailDirty] = useState(false);
  // 详情页 AI 重新分析
  const [detailAnalyzing, setDetailAnalyzing] = useState(false);
  const [detailAnalyzeMsg, setDetailAnalyzeMsg] = useState(null);
  // 详情页 AI 重新分析的自定义提示（用户可指定解题方向/知识范围）
  const [detailUserPrompt, setDetailUserPrompt] = useState('');
  const [detailPromptOpen, setDetailPromptOpen] = useState(false);
  const titleSavingRef = useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [detailContent, setDetailContent] = useState('');
  const detailContentRef = useRef('');
  const [detailMastery, setDetailMastery] = useState('');
  const [detailDifficulty, setDetailDifficulty] = useState(3);
  const [detailPracticeCount, setDetailPracticeCount] = useState(0);
  const [solutionText, setSolutionText] = useState('');
  const solutionTextRef = useRef('');
  const [solutionImages, setSolutionImages] = useState([]);
  const solutionImagesRef = useRef([]);
  const solutionFileInputRef = useRef(null);
  const solutionTextareaRef = useRef(null);
  // 记录详情页来源（library/focus/timeline/similar），决定保存时是否写时间线
  const detailSourceRef = useRef('library');
  // 详情页来源 Tab（library/focus/timeline/similar）——决定详情弹窗里上下题翻页所用的列表
  const [detailSourceTab, setDetailSourceTab] = useState('library');
  // AI 重新分析竞态处理：
  // - detailAnalyzeSeqRef：自增请求序号，用于区分同一题目上的最新请求
  // - activeDetailPathRef：当前详情弹窗打开的题目 file_path，用于判断结果属于哪道题
  const detailAnalyzeSeqRef = useRef(0);
  const activeDetailPathRef = useRef(null);
  // 后台自动保存（题目已关闭/切换时，AI 结果仍写回原题）的轻量提示
  const [autoSaveToast, setAutoSaveToast] = useState(null);
  const autoSaveToastTimerRef = useRef(null);

  const [previewSolutionImage, setPreviewSolutionImage] = useState(null);

  // --- Delete confirmation ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState('index'); // 'index' | 'purge'
  const [deleting, setDeleting] = useState(false);

  // --- 找相似题（Similar finder modal）---
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarText, setSimilarText] = useState('');
  // 从详情页打开时为该题的 file_path（用题干+知识点查找并排除自身）；从库工具栏打开为 null（手动粘贴文本）
  const [similarSourceFile, setSimilarSourceFile] = useState(null);
  const [similarSmart, setSimilarSmart] = useState(false); // 是否用 AI 智能精排
  const [similarTopK, setSimilarTopK] = useState(5);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [similarError, setSimilarError] = useState(null);
  // { mode, query_text, results }；results 同时用于详情弹窗的相似结果翻页
  const [similarResult, setSimilarResult] = useState(null);

  // --- Load configs for the current student ---
  function loadConfig() {
    API.getConfig().then((c) => {
      setImageDir(c.image_dir || '');
      setDirInput(c.image_dir || '');
      const v = Number(c.focus_timeout_hours);
      if (v > 0) { setFocusTimeoutHours(v); setFocusTimeoutInput(String(v)); }
      const m = Number(c.focus_max_per_subject);
      if (m > 0) setFocusMaxPerSubject(m);
      if (c.sida_agent_host) setSidaHostInput(c.sida_agent_host);
      if (c.sida_agent_port) setSidaPortInput(String(c.sida_agent_port));
    }).catch(() => { });
  }

  // --- Load students on mount, then load current student's config ---
  useEffect(() => {
    API.getStudents().then((data) => {
      const list = data.students || [];
      setStudents(list);
      const saved = Number(localStorage.getItem('mnb_student_id')) || null;
      const valid = list.find((s) => s.id === saved);
      const active = valid || list.find((s) => s.id === data.current_id) || list[0];
      if (active) {
        setCurrentStudentId(active.id);
        setStudentId(active.id);
      }
      loadConfig();
    }).catch(() => { loadConfig(); });
  }, []);

  // --- 切换学生：重置所有按学生隔离的 state 并重新加载 ---
  function switchStudent(id) {
    if (id === currentStudentId) return;
    setStudentId(id);
    setCurrentStudentId(id);
    // 重置列表/缓存类 state，触发对应 tab 重新加载
    setScanData(null);
    setAllIndexed([]);
    setTotalIndexedCount(0);
    setLibLoaded(false);
    setSubjects([]);
    setFocusItems([]);
    setFocusCount(0);
    setFocusLoaded(false);
    setFocusOverdueCount(0);
    setFocusReminders({});
    setTimelineDays([]);
    setTimelineLoaded(false);
    setTimelineOffset(0);
    setTimelineHasMore(true);
    setTokenStats(null);
    setDetail(null);
    loadConfig();
    // 若当前停留在依赖数据的 tab，立即重新拉取
    if (tab === 'library') loadLibrary({ subject: null });
    if (tab === 'focus') loadFocusItems();
    if (tab === 'timeline') loadTimeline(0);
    if (tab === 'config') loadTokenStats();
  }

  async function addStudent() {
    const name = newStudentName.trim();
    if (!name) { setStudentMsg('请输入学生名'); return; }
    setStudentBusy(true); setStudentMsg('');
    try {
      const created = await API.createStudent(name);
      const data = await API.getStudents();
      setStudents(data.students || []);
      setNewStudentName('');
      setStudentMsg(`已创建「${created.name}」`);
      switchStudent(created.id);
    } catch (e) {
      setStudentMsg(`创建失败：${e.message}`);
    } finally {
      setStudentBusy(false);
    }
  }

  async function removeStudent(id) {
    setStudentBusy(true);
    try {
      await API.deleteStudent(id);
      const data = await API.getStudents();
      setStudents(data.students || []);
      setDeleteStudentTarget(null);
      if (id === currentStudentId) {
        const next = (data.students || [])[0];
        if (next) switchStudent(next.id);
      }
    } catch (e) {
      setStudentMsg(`删除失败：${e.message}`);
    } finally {
      setStudentBusy(false);
    }
  }

  async function renameStudent(id) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await API.renameStudent(id, name);
      const data = await API.getStudents();
      setStudents(data.students || []);
    } catch (e) {
      setStudentMsg(`重命名失败：${e.message}`);
    }
  }

  // Auto-correct activeSubject when subjects load (default to 数学，fallback to first)
  useEffect(() => {
    if (subjects.length === 0) return;
    if (!subjects.some(s => s.name === activeSubject)) {
      const hasMath = subjects.some(s => s.name === '数学');
      setActiveSubject(hasMath ? '数学' : subjects[0].name);
    }
  }, [subjects]);

  // --- Load library when tab changes ---
  useEffect(() => {
    if (tab === 'library' && !libLoaded) {
      // 若扫描页设置了 pending subject，则跳转到对应学科页
      if (pendingSubjectRef.current) {
        setActiveSubject(pendingSubjectRef.current);
        pendingSubjectRef.current = null;
      }
      loadLibrary({ subject: activeSubject });
    }
  }, [tab]);

  // --- Load focus practice when tab changes ---
  useEffect(() => {
    if (tab === 'focus' && !focusLoaded) {
      loadFocusItems();
    }
  }, [tab]);

  // --- Load token stats when config tab changes（每次进入都刷新，能看到最新消耗）---
  useEffect(() => {
    if (tab === 'config') {
      loadTokenStats();
    }
  }, [tab]);

  async function loadTokenStats(scope) {
    const useScope = scope || tokenScope;
    setTokenStatsLoading(true);
    setTokenStatsError('');
    try {
      const data = await API.getTokenStats(useScope);
      setTokenStats(data);
    } catch (e) {
      setTokenStatsError(`统计加载失败：${e.message}`);
    } finally {
      setTokenStatsLoading(false);
    }
  }

  const debounceRef = useRef(null);

  async function loadLibrary(filterParams = {}) {
    try {
      const data = await API.getAllImages(filterParams);
      if (Array.isArray(data)) {
        setAllIndexed(data);
        setTotalIndexedCount(data.length);
      } else {
        setAllIndexed(data.items || []);
        // tab 上显示所有科目总数量，列表数量用 total_count 表示筛选后的数量
        setTotalIndexedCount(data.global_count ?? data.total_count ?? 0);
        if (data.subjects) setSubjects(data.subjects);
      }
    } catch (e) {
      console.error('load library failed', e);
    } finally {
      setLibLoaded(true);
    }
  }

  async function loadFocusItems() {
    try {
      const data = await API.getFocusImages();
      setFocusItems(data.items || []);
      setFocusCount(data.count ?? 0);
      setFocusTimeoutCfg(data.timeout_hours ?? 48);
      setFocusOverdueCount(data.overdue_count ?? 0);
      setFocusMaxPerSubject(data.max_count ?? 10);
      if (data.subjects) setFocusSubjects(data.subjects);
      setFocusError('');
      // 为所有重点练题目异步加载鼓励语
      if ((data.items ?? []).length > 0) {
        loadReminders(data.items);
      }
    } catch (e) {
      console.error('load focus practice failed', e);
      setFocusError('加载重点练失败');
    } finally {
      setFocusLoaded(true);
    }
  }

  async function loadReminders(items) {
    setFocusRemindersLoading(true);
    try {
      const result = await API.getFocusReminders(items);
      setFocusReminders(result.reminders || {});
    } catch (e) {
      console.error('load reminders failed', e);
      setFocusReminders({});
    } finally {
      setFocusRemindersLoading(false);
    }
  }

  async function toggleFocusPractice(filePath, enabled) {
    if (!filePath) return;
    try {
      const result = await API.toggleFocusPractice(filePath, enabled);
      // 刷新重点练列表
      const focusData = await API.getFocusImages();
      setFocusItems(focusData.items || []);
      setFocusCount(focusData.count ?? 0);
      setFocusMaxPerSubject(focusData.max_count ?? 10);
      setFocusOverdueCount(focusData.overdue_count ?? 0);
      if (focusData.subjects) setFocusSubjects(focusData.subjects);
      // 清除旧提醒，重新加载
      setFocusReminders({});
      if ((focusData.items ?? []).length > 0) {
        loadReminders(focusData.items);
      }
      // 同步更新错题库中该题的 is_focus_practice 状态
      setAllIndexed((prev) =>
        prev.map((p) =>
          p.file_path === filePath
            ? { ...p, is_focus_practice: enabled ? 1 : 0 }
            : p
        )
      );
      // 更新详情状态
      setDetail((prev) =>
        prev && prev.file_path === filePath
          ? { ...prev, is_focus_practice: enabled ? 1 : 0 }
          : prev
      );
      setFocusError('');
      return result;
    } catch (e) {
      console.error('toggle focus practice failed', e);
      const msg = e.message || '操作失败';
      setFocusError(msg);
      throw e;
    }
  }

  // --- Timeline ---
  // 用 ref 做 loading 门控，避免 React StrictMode 双重 effect 导致死锁
  const timelineGateRef = useRef(false);

  async function loadTimeline(offset) {
    if (timelineGateRef.current) return;         // 门控：已有请求在飞
    timelineGateRef.current = true;
    setTimelineLoading(true);
    try {
      const data = await API.getTimeline(offset);
      if (offset === 0) {
        setTimelineDays(data.days || []);
      } else {
        setTimelineDays((prev) => [...prev, ...(data.days || [])]);
      }
      setTimelineHasMore(data.has_more ?? false);
      setTimelineOffset(offset + (data.days || []).length);
    } catch (e) {
      console.error('load timeline failed', e);
    } finally {
      timelineGateRef.current = false;
      setTimelineLoading(false);
      setTimelineLoaded(true);
    }
  }

  // 切换到时间线 tab 时加载第一页
  useEffect(() => {
    if (tab !== 'timeline') return;
    setTimelineDays([]);
    setTimelineHasMore(true);
    setTimelineOffset(0);
    setTimelineLoaded(false);
    loadTimeline(0);
  }, [tab]);

  // 无限滚动：IntersectionObserver 监听 sentinel
  const timelineSentinelRef = useRef(null);
  useEffect(() => {
    if (tab !== 'timeline') return;
    const sentinel = timelineSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && timelineHasMore && !timelineLoading && timelineLoaded) {
        loadTimeline(timelineOffset);
      }
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, timelineHasMore, timelineLoading, timelineLoaded, timelineOffset]);

  // 搜索条件变化时带防抖重新请求后端
  useEffect(() => {
    if (tab !== 'library' || !libLoaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // 前端校验：开始日期大于结束日期时不发请求
      if (dateFilterEnabled && startDate && endDate && startDate > endDate) return;
      loadLibrary({
        query,
        subject: activeSubject,
        dateEnabled: dateFilterEnabled,
        startDate: dateFilterEnabled ? startDate : '',
        endDate: dateFilterEnabled ? endDate : '',
        mastery: masteryFilter,
      });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, dateFilterEnabled, startDate, endDate, activeSubject, masteryFilter]);

  // Esc 关闭解答图片预览
  useEffect(() => {
    if (!previewSolutionImage) return;
    const handler = (e) => { if (e.key === 'Escape') setPreviewSolutionImage(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewSolutionImage]);

  // Esc 关闭扫描页图片预览
  useEffect(() => {
    if (!scanPreviewImage) return;
    const handler = (e) => { if (e.key === 'Escape') setScanPreviewImage(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scanPreviewImage]);

  // --- Config actions ---
  async function saveImageDir() {
    setDirSaving(true);
    setDirMsg('');
    try {
      const payload = { image_dir: dirInput.trim() };
      // 同时保存重点练超时阈值
      const timeoutVal = parseInt(focusTimeoutInput, 10);
      if (!isNaN(timeoutVal) && timeoutVal >= 1 && timeoutVal <= 720) {
        payload.focus_timeout_hours = timeoutVal;
      }
      // 同时保存每学科重点练上限
      const maxPerSubjectVal = Number(focusMaxPerSubject);
      if (!isNaN(maxPerSubjectVal) && maxPerSubjectVal >= 1 && maxPerSubjectVal <= 50) {
        payload.focus_max_per_subject = maxPerSubjectVal;
      }
      const result = await API.saveConfig(payload);
      setImageDir(dirInput.trim());
      if (result.focus_timeout_hours) {
        setFocusTimeoutHours(Number(result.focus_timeout_hours));
      }
      if (result.focus_max_per_subject) {
        setFocusMaxPerSubject(Number(result.focus_max_per_subject));
      }
      setDirMsg('配置已保存');
    } catch (e) {
      setDirMsg(e.message || '保存失败');
    } finally {
      setDirSaving(false);
    }
  }

  // 保存 sida-agent 服务地址（全局配置，对所有学生生效），保存后立即测连
  async function saveSidaConfig() {
    setSidaSaving(true); setSidaMsg('');
    try {
      await API.saveConfig({
        sida_agent_host: sidaHostInput.trim() || '127.0.0.1',
        sida_agent_port: sidaPortInput.trim(),
      });
      setSidaSaving(false);
      await testSidaConnection();
    } catch (e) {
      setSidaMsg('保存失败：' + (e.message || e));
      setSidaSaving(false);
    }
  }

  // 测试与 sida-agent 的连通性（经本后端代理）
  async function testSidaConnection() {
    setSidaTesting(true); setSidaMsg('');
    try {
      const h = await AgentAPI.health();
      setSidaMsg(`✅ 连接成功 · 图谱 ${h.graph_nodes} 节点 / 向量 ${h.vector_count} 条`);
    } catch (e) {
      setSidaMsg('无法连接：' + (e.message || e));
    } finally {
      setSidaTesting(false);
    }
  }

  // --- Scan ---
  async function doScan() {
    if (!imageDir) return;
    console.log('[扫描] 开始扫描目录：', imageDir);
    setScanning(true);
    setScanError(null);
    setAnalyzingFile(null);
    setDraft(null);
    try {
      const data = await API.scan();
      console.log('[扫描] 结果：共', data.total, '张，已索引', data.indexed_count, '待索引', data.unindexed_count);
      // 兼容旧格式：若无 by_subject，从 flat lists 构造
      if (!data.by_subject) {
        data.by_subject = { '未分类': { indexed: data.indexed || [], unindexed: data.unindexed || [] } };
      }
      // 使用后端返回的 subject_order，否则按 key 排序
      if (!data.subject_order) {
        data.subject_order = Object.keys(data.by_subject);
      }
      setScanData(data);
    } catch (e) {
      console.error('[扫描] 失败：', e.message, e);
      setScanError(e.message || '扫描失败');
    } finally {
      setScanning(false);
    }
  }

  // --- Scan card click (distinguish single vs double) ---
  function handleScanCardClick(filePath) {
    if (scanClickTimerRef.current) {
      // 双击 → 大图预览
      clearTimeout(scanClickTimerRef.current);
      scanClickTimerRef.current = null;
      setScanPreviewImage(filePath);
    } else {
      // 单击 → 延迟判断，280ms 内没有再点击则触发 AI 分析
      scanClickTimerRef.current = setTimeout(() => {
        scanClickTimerRef.current = null;
        startAnalyze(filePath);
      }, 280);
    }
  }

  // --- Delete unindexed image from scan ---
  async function deleteScanImage() {
    if (!scanDeleteTarget) return;
    setScanDeleting(true);
    try {
      await API.purgeImage(scanDeleteTarget);
      // 重新扫描目录
      const data = await API.scan();
      if (!data.by_subject) {
        data.by_subject = { '未分类': { indexed: data.indexed || [], unindexed: data.unindexed || [] } };
      }
      if (!data.subject_order) {
        data.subject_order = Object.keys(data.by_subject);
      }
      setScanData(data);
      setScanDeleteTarget(null);
    } catch (e) {
      console.error('删除扫描图片失败', e);
    } finally {
      setScanDeleting(false);
    }
  }

  // --- Analysis (calls server-side AI) ---
  async function startAnalyze(filePath) {
    console.group('[Analysis] start:', filePath);
    // 若上一个分析仍在飞，先取消它，避免两次分析竞态覆盖 draft
    if (analyzeAbortRef.current) analyzeAbortRef.current.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    setAnalyzingFile(filePath);
    setDraft(null);
    setAnalysisError(null);
    setSaveMsg('');
    setAnalyzing(true);
    try {
      console.log('[Analysis] calling server /api/analyze');
      const resp = await fetch('/api/analyze', withStudentHeader({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
        signal: controller.signal
      }));

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.detail || `HTTP ${resp.status}`;
        console.error('[Analysis] server error:', errMsg);
        throw new Error(errMsg);
      }

      const result = await resp.json();
      console.log('[Analysis] server result:', result);
      // AI 判断的难度（1-5 星），无效则回退默认 3 星
      const d = Number(result.difficulty);
      const aiDifficulty = Number.isInteger(d) && d >= 1 && d <= 5 ? d : 3;
      setDraft({
        title: '',
        summary: result.summary || '',
        content: result.content || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
        difficulty: aiDifficulty
      });
      console.groupEnd();
    } catch (e) {
      console.groupEnd();
      // 主动取消（点了「取消」或切换到其它图片）：静默退出，不写 error/draft
      if (e.name === 'AbortError') {
        console.log('[Analysis] 请求已取消');
        return;
      }
      console.error('[Analysis] exception:', e.message, e);
      setAnalysisError(e.message || 'AI analysis failed');
      setDraft({ title: '', summary: '', content: '', tags: [], difficulty: 3 });
    } finally {
      if (analyzeAbortRef.current === controller) analyzeAbortRef.current = null;
      setAnalyzing(false);
    }
  }

  // 取消当前分析：abort 在飞的 fetch，并清空扫描页的分析状态
  function cancelAnalyze() {
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
      analyzeAbortRef.current = null;
    }
    setAnalyzingFile(null);
    setDraft(null);
    setAnalysisError(null);
    setSaveMsg('');
    setAnalyzing(false);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || !draft) return;
    if (!draft.tags.includes(t)) setDraft({ ...draft, tags: [...draft.tags, t] });
    setTagInput('');
  }

  function removeTag(t) {
    if (!draft) return;
    setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) });
  }

  function editTag(oldTag, newTag) {
    if (!draft) return;
    const newTags = draft.tags.map((t) => (t === oldTag ? newTag : t));
    setDraft({ ...draft, tags: newTags });
  }

  async function saveIndex() {
    if (!analyzingFile || !draft) return;
    console.log('[保存] 开始保存索引：', analyzingFile, draft);
    setSaving(true);
    setSaveMsg('');
    try {
      await API.indexImage(analyzingFile, draft.title || '未命名题目', draft.summary || '', draft.content || '', draft.tags || [], '', 'unfamiliar', 0, null, draft.difficulty || 3);
      console.log('[保存] 索引保存成功，重新扫描目录');
      setSaveMsg('已保存索引');
      // 记住当前分析的图片所属学科，以便后续跳转
      const data = await API.scan();
      // 从新扫描结果中推断当前图片的学科
      if (data.by_subject) {
        for (const [subj, group] of Object.entries(data.by_subject)) {
          if ((group.indexed || []).some((img) => img.file_path === analyzingFile)) {
            pendingSubjectRef.current = subj;
            break;
          }
        }
      }
      setScanData(data);
      setLibLoaded(false);
      setTimeout(() => {
        setAnalyzingFile(null);
        setDraft(null);
        setSaveMsg('');
      }, 600);
    } catch (e) {
      console.error('[保存] 失败：', e.message, e);
      setSaveMsg('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  // --- Library ---
  const allTags = useMemo(() => {
    const map = new Map();
    allIndexed.forEach((p) => (p.tags || []).forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allIndexed]);

  const filtered = useMemo(() => {
    return allIndexed.filter((p) => {
      if (selectedTags.length && !selectedTags.every((t) => (p.tags || []).includes(t))) return false;
      return true;
    });
  }, [allIndexed, selectedTags]);

  // --- Date view grouping ---
  const groupedFiltered = useMemo(() => {
    const groups = new Map();
    for (const p of filtered) {
      const result = getDateKey(p.created_at, dateViewType);
      const groupKey = result ? result.key : '__unknown__';
      const groupLabel = result ? result.label : '未知日期';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { key: groupKey, label: groupLabel, items: [] });
      }
      groups.get(groupKey).items.push(p);
    }
    const sorted = Array.from(groups.values());
    sorted.sort((a, b) => {
      if (a.key === '__unknown__') return 1;
      if (b.key === '__unknown__') return -1;
      return b.key.localeCompare(a.key);
    });
    return sorted;
  }, [filtered, dateViewType]);

  const flattenedGrouped = useMemo(() => {
    return groupedFiltered.flatMap(g => g.items);
  }, [groupedFiltered]);

  // --- Detail pagination derived state (source depends on current tab) ---
  const detailPaginationSource = useMemo(() => {
    if (detailSourceTab === 'similar') {
      return (similarResult && Array.isArray(similarResult.results)) ? similarResult.results : [];
    }
    if (tab === 'focus') return focusItems;
    if (tab === 'timeline') return timelineDays.flatMap(d => d.items);
    return flattenedGrouped;
  }, [tab, focusItems, flattenedGrouped, timelineDays, detailSourceTab, similarResult]);

  const detailIndex = useMemo(() => {
    if (!detail) return -1;
    return detailPaginationSource.findIndex((p) => p.file_path === detail.file_path);
  }, [detail, detailPaginationSource]);

  const hasPrev = detailIndex > 0;
  const hasNext = detailIndex >= 0 && detailIndex < detailPaginationSource.length - 1;
  const prevProblem = hasPrev ? detailPaginationSource[detailIndex - 1] : null;
  const nextProblem = hasNext ? detailPaginationSource[detailIndex + 1] : null;
  const detailPositionText = detailIndex >= 0
    ? (detailSourceTab === 'similar'
      ? `相似结果 ${detailIndex + 1} / ${detailPaginationSource.length} 条`
      : `第 ${detailIndex + 1} / ${detailPaginationSource.length} 题`)
    : '';

  // 图片预览翻页列表：原题图片 + 全部解答图片，支持左右箭头逐张浏览
  const previewNavPaths = useMemo(() => {
    if (!previewSolutionImage) return [];
    const list = detail ? [detail.file_path, ...solutionImages.map(getSolutionFullPath)] : [];
    return list.includes(previewSolutionImage) ? list : [previewSolutionImage];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSolutionImage, detail, solutionImages]);

  // Auto-close detail if current problem no longer in filtered
  // （similar 弹窗打开期间不自动关闭详情，避免正在进行的相似查找打断详情浏览）
  useEffect(() => {
    if (detail && detailIndex === -1 && !similarOpen) {
      activeDetailPathRef.current = null;
      detailAnalyzeSeqRef.current += 1;
      setDetail(null);
      setPreviewSolutionImage(null);
    }
  }, [detailIndex, similarOpen]);

  // Keyboard navigation for detail modal (ArrowLeft/ArrowRight)
  useEffect(() => {
    if (!detail || previewSolutionImage || showDeleteConfirm) return;
    const handler = (e) => {
      if (similarOpen) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevProblem(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToNextProblem(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detail, previewSolutionImage, showDeleteConfirm, hasPrev, hasNext, detailDirty, similarOpen]);

  function switchSubject(subj) {
    setActiveSubject(subj);
    setSelectedTags([]);
  }

  function getSubjectLabel() {
    return `${activeSubject}错题库`;
  }

  function toggleTag(t) {
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function clearAllFilters() {
    setQuery('');
    setSelectedTags([]);
    setDateFilterEnabled(false);
    setStartDate('');
    setEndDate('');
    setMasteryFilter('');
    // dateViewType 是展示偏好，不清除
  }

  function switchToFocus() {
    setTab('focus');
  }

  // --- Detail modal ---
  function openDetail(p, source = 'library') {
    detailSourceRef.current = source;
    setDetailSourceTab(source);
    // 记录当前打开的题目，并让之前尚未返回的 AI 分析结果作废（防止串题）
    activeDetailPathRef.current = p.file_path;
    detailAnalyzeSeqRef.current += 1;
    const sol = (typeof p.solution === 'string' ? JSON.parse(p.solution || '{}') : (p.solution || {}));
    setDetail(p);
    setDetailTagInput('');
    setDetailError(null);
    setDetailDirty(false);
    setDetailAnalyzing(false);
    setDetailAnalyzeMsg(null);
    setDetailUserPrompt('');
    setDetailPromptOpen(false);
    setEditingTitle(false);
    setEditTitleValue(p.title || '');
    setDetailContent(p.content || '');
    detailContentRef.current = p.content || '';
    setDetailMastery(p.mastery || 'unfamiliar');
    setDetailDifficulty(typeof p.difficulty === 'number' ? p.difficulty : 3);
    setDetailPracticeCount(p.practice_count || 0);
    setSolutionText(sol.text || '');
    solutionTextRef.current = sol.text || '';
    setSolutionImages(Array.isArray(sol.images) ? sol.images : []);
    solutionImagesRef.current = Array.isArray(sol.images) ? sol.images : [];
  }

  async function deleteFromIndex(filePath) {
    try {
      await API.deleteImage(filePath);
      setAllIndexed((prev) => prev.filter((p) => p.file_path !== filePath));
      setFocusItems((prev) => prev.filter((p) => p.file_path !== filePath));
      setTimelineDays((prev) =>
        prev
          .map((day) => ({
            ...day,
            items: day.items.filter((p) => p.file_path !== filePath),
          }))
          .filter((day) => day.items.length > 0)
      );
    } catch (e) {
      console.error('delete failed', e);
    }
    navigateAfterDelete(filePath);
  }

  async function purgeImage(filePath) {
    setDeleting(true);
    try {
      await API.purgeImage(filePath);
      setAllIndexed((prev) => prev.filter((p) => p.file_path !== filePath));
      setFocusItems((prev) => prev.filter((p) => p.file_path !== filePath));
      setTimelineDays((prev) =>
        prev
          .map((day) => ({
            ...day,
            items: day.items.filter((p) => p.file_path !== filePath),
          }))
          .filter((day) => day.items.length > 0)
      );
      navigateAfterDelete(filePath);
    } catch (e) {
      console.error('purge failed', e);
      setDetailError('彻底删除失败：' + (e.message || '未知错误'));
    } finally {
      setDeleting(false);
    }
  }

  function openDeleteConfirm() {
    setDetailError(null);
    setShowDeleteConfirm(true);
  }

  function closeDetailModal() {
    if (detailSaving) return;
    if (detailDirty) {
      const shouldDiscard = window.confirm('当前有未保存修改，确认关闭并放弃这些修改吗？');
      if (!shouldDiscard) {
        setDetailError('你取消了关闭，当前修改仍未保存');
        return;
      }
    }
    setDetailError(null);
    // 关闭详情：让尚未返回的 AI 分析结果作废，避免串到下一道打开的题目
    activeDetailPathRef.current = null;
    detailAnalyzeSeqRef.current += 1;
    setDetail(null);
    setPreviewSolutionImage(null);
    // 从相似列表点开的详情：关闭后回到相似列表（结果仍在），而不是直接回错题库页
    if (detailSourceRef.current === 'similar' && similarResult && !similarBusy) {
      setSimilarOpen(true);
    }
  }

  // --- 找相似题 ---
  // sourceFile：从详情页打开时传入该题的 file_path（自动用题干+知识点查找、排除自身）；
  // 从库工具栏打开时传 null（手动粘贴题目文字）
  function openSimilarFinder(sourceFile) {
    let seed = '';
    // 库工具栏打开时，若搜索框已有 ≥2 字的文字，自动预填到输入框
    if (!sourceFile && query && query.trim().length >= 2) {
      seed = query;
    }
    setSimilarSourceFile(sourceFile);
    setSimilarText(seed);
    setSimilarSmart(false);
    setSimilarTopK(5);
    setSimilarBusy(false);
    setSimilarError(null);
    setSimilarResult(null);
    setSimilarOpen(true);
  }

  function openSimilarFromDetail() {
    if (!detail) return;
    if (detailDirty) {
      setDetailError('当前有未保存修改，请先点击"保存修改"');
      return;
    }
    openSimilarFinder(detail.file_path);
  }

  async function runSimilarSearch() {
    setSimilarError(null);
    const smart = !!similarSmart;
    const topK = Number(similarTopK) || 5;
    let payload;
    if (similarSourceFile) {
      payload = { file_path: similarSourceFile, smart, top_k: topK };
    } else {
      const text = similarText.trim();
      if (text.length < 2) {
        setSimilarError('请输入至少 2 个字的题目内容或片段');
        return;
      }
      payload = { text, smart, top_k: topK };
    }
    setSimilarBusy(true);
    setSimilarResult(null);
    try {
      const resp = await API.findSimilar(payload);
      setSimilarResult(resp);
    } catch (e) {
      console.error('[findSimilar] 失败', e);
      setSimilarError(e.message || '查找失败，请稍后重试');
    } finally {
      setSimilarBusy(false);
    }
  }

  // 点击相似结果卡片：关闭弹窗并用「相似结果列表」作为翻页源打开详情
  function openSimilarResult(r) {
    setSimilarOpen(false);
    openDetail(r, 'similar');
  }

  function closeSimilarFinder() {
    if (similarBusy) return;
    setSimilarOpen(false);
    setSimilarResult(null);
  }

  function goToPrevProblem() {
    if (!detail) return;
    if (detailDirty) { setDetailError('当前有未保存修改，请先点击"保存修改"'); return; }
    if (!hasPrev) return;
    openDetail(prevProblem, detailSourceRef.current);
  }

  function goToNextProblem() {
    if (!detail) return;
    if (detailDirty) { setDetailError('当前有未保存修改，请先点击"保存修改"'); return; }
    if (!hasNext) return;
    openDetail(nextProblem, detailSourceRef.current);
  }

  function navigateAfterDelete(removedFilePath) {
    if (!detail || detail.file_path !== removedFilePath) return;
    setShowDeleteConfirm(false);
    // Prefer next, fallback to prev, else close
    if (hasNext) {
      openDetail(nextProblem, detailSourceRef.current);
    } else if (hasPrev) {
      openDetail(prevProblem, detailSourceRef.current);
    } else {
      activeDetailPathRef.current = null;
      detailAnalyzeSeqRef.current += 1;
      setDetail(null);
      setPreviewSolutionImage(null);
    }
  }

  function applyDetailDraft(updates) {
    if (!detail) return;
    setDetail((prev) => ({ ...prev, ...updates }));
    setDetailDirty(true);
  }

  async function saveDetail() {
    if (!detail) return;
    setDetailError(null);
    setDetailSaving(true);
    try {
      const title = editTitleValue.trim() || '未命名题目';
      const content = detailContentRef.current;
      const notes = detail.notes || ''; // 备注编辑框已移除，保存时保持原值
      const solution = JSON.stringify({
        text: solutionTextRef.current,
        images: solutionImagesRef.current,
      });
      // 编辑并保存即视为一次练习：练习时间更新为当前时间，未练习时长立即重置
      const now = new Date();
      const practicedAt =
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
      await API.updateImage(
        detail.file_path,
        title,
        detail.summary,
        content,
        detail.tags || [],
        notes,
        detailMastery,
        detailPracticeCount,
        practicedAt,
        solution,
        detailDifficulty,
        detailSourceRef.current,
      );
      const updated = {
        ...detail,
        title,
        content,
        notes,
        mastery: detailMastery,
        difficulty: detailDifficulty,
        practice_count: detailPracticeCount,
        last_practiced_at: practicedAt,
        solution,
        // 立即刷新重点练的未练习时长显示
        inactive_hours: 0,
        inactive_days_text: '0 天',
        is_focus_overdue: false,
      };
      setDetail(updated);
      setAllIndexed((prev) => prev.map((p) => (p.file_path === detail.file_path ? updated : p)));
      setFocusItems((prev) => prev.map((p) => (p.file_path === detail.file_path ? { ...p, ...updated } : p)));
      setTimelineDays((prev) => prev.map((day) => ({
        ...day,
        items: day.items.map((p) =>
          p.file_path === detail.file_path ? { ...p, ...updated } : p
        ),
      })));
      setDetailDirty(false);
      setDetailAnalyzeMsg(null);
    } catch (e) {
      console.error('update failed', e);
      setDetailError('保存失败 ' + (e.message || '未知错误'));
    } finally {
      setDetailSaving(false);
    }
  }

  // 轻量提示：后台自动保存 AI 结果后，短暂提示用户
  function showAutoSaveToast(text) {
    setAutoSaveToast(text);
    if (autoSaveToastTimerRef.current) clearTimeout(autoSaveToastTimerRef.current);
    autoSaveToastTimerRef.current = setTimeout(() => setAutoSaveToast(null), 5000);
  }

  // 卸载时清理自动保存提示的定时器
  useEffect(() => {
    return () => { if (autoSaveToastTimerRef.current) clearTimeout(autoSaveToastTimerRef.current); };
  }, []);

  // 合并标签：保留已有，追加 AI 新识别（不覆盖、不重复）
  function mergeTags(existingTags, incomingTags) {
    const base = Array.isArray(existingTags) ? existingTags : [];
    const incoming = Array.isArray(incomingTags) ? incomingTags : [];
    const seen = new Set(base);
    return [...base, ...incoming.filter((t) => !seen.has(t))];
  }

  // --- AI 重新分析（详情弹窗） ---
  async function reanalyzeDetail() {
    if (!detail || detailAnalyzing) return;
    const prompt = (detailUserPrompt || '').trim();
    // 上一次 AI 生成的解题思路（若有），让 AI 在既有思路基础上修正/深化
    const prevSummary = (detail.summary || '').trim();
    // 记录本次请求对应的题目与请求序号。
    // 结果返回后：
    //  - 若仍是当前打开的这道题（前台）→ 填充到编辑草稿，等用户点「保存修改」；
    //  - 若用户已关闭/切到别的题（后台）→ 自动把结果写回「原题 A」的数据库记录并刷新列表。
    const analyzedPath = detail.file_path;
    // 快照：后台自动保存时需要保留的原题字段（这些不随 AI 结果变化）
    const snapshot = {
      title: (detail.title || '').trim() || '未命名题目',
      notes: detail.notes || '',
      mastery: detailMastery || detail.mastery || 'unfamiliar',
      practice_count: detailPracticeCount ?? detail.practice_count ?? 0,
      last_practiced_at: detail.last_practiced_at || null,
      solution: JSON.stringify({
        text: solutionTextRef.current,
        images: solutionImagesRef.current,
      }),
      existingTags: detail.tags || [],
      existingSummary: prevSummary,
      existingContent: (detailContentRef.current || detail.content || ''),
      existingDifficulty: typeof detail.difficulty === 'number' ? detail.difficulty : 3,
    };
    const seq = ++detailAnalyzeSeqRef.current;
    setDetailAnalyzing(true);
    setDetailAnalyzeMsg(null);
    setDetailError(null);
    // 结果是否仍属于「当前打开的同一道题」——决定走前台草稿填充还是后台自动保存
    const isForeground = () =>
      seq === detailAnalyzeSeqRef.current && activeDetailPathRef.current === analyzedPath;
    try {
      const resp = await fetch('/api/analyze', withStudentHeader({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 若「AI 提取题目内容」编辑框已有内容，直接复用，不再从图片提取
        // user_prompt：用户自定义的解题方向/知识范围提示（可选）
        // previous_summary：上一次 AI 解题思路（可选），作为重新分析的参考基础
        body: JSON.stringify({
          file_path: analyzedPath,
          content: (detailContentRef.current || '').trim() || undefined,
          user_prompt: prompt || undefined,
          previous_summary: prevSummary || undefined
        })
      }));
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }
      const result = await resp.json();

      // 计算 AI 结果在各字段上的最终值（前台/后台共用）
      const newContent = result.content || '';
      const mergedTags = mergeTags(snapshot.existingTags, result.tags);
      const newSummary = result.summary || snapshot.existingSummary;
      const d = Number(result.difficulty);
      const newDifficulty = (Number.isInteger(d) && d >= 1 && d <= 5)
        ? d : snapshot.existingDifficulty;

      // ===== 后台：题目已关闭/切换 → 自动写回原题 A，不丢弃 =====
      if (!isForeground()) {
        try {
          await API.updateImage(
            analyzedPath,
            snapshot.title,
            newSummary,
            newContent || snapshot.existingContent,
            mergedTags,
            snapshot.notes,
            snapshot.mastery,
            snapshot.practice_count,
            snapshot.last_practiced_at,
            snapshot.solution,
            newDifficulty,
            'skip', // AI 自动回填不算用户练习，跳过时间线记录
          );
          // 同步刷新各列表中的该题，保证下次打开/切页看到最新结果
          const patch = {
            summary: newSummary,
            content: newContent || snapshot.existingContent,
            tags: mergedTags,
            difficulty: newDifficulty,
          };
          setAllIndexed((prev) => prev.map((p) => (p.file_path === analyzedPath ? { ...p, ...patch } : p)));
          setFocusItems((prev) => prev.map((p) => (p.file_path === analyzedPath ? { ...p, ...patch } : p)));
          setTimelineDays((prev) => prev.map((day) => ({
            ...day,
            items: day.items.map((p) => (p.file_path === analyzedPath ? { ...p, ...patch } : p)),
          })));
          // 若该题在等待期间又被重新打开（序号已变化），同步刷新弹窗草稿，避免展示旧数据
          setDetail((prev) => (prev && prev.file_path === analyzedPath ? { ...prev, ...patch } : prev));
          if (activeDetailPathRef.current === analyzedPath) {
            const finalContent = newContent || snapshot.existingContent;
            setDetailContent(finalContent);
            detailContentRef.current = finalContent;
          }
          showAutoSaveToast('✅ AI 分析已完成，结果已自动保存到对应错题');
        } catch (e) {
          console.error('[ReAnalyze] background save failed:', e);
          showAutoSaveToast('⚠️ AI 分析完成，但自动保存失败，请重新打开该题再试');
        }
        return;
      }

      // ===== 前台：题目仍是当前打开的这道题 → 填充草稿，等用户保存 =====
      // 题目内容（content）：更新到「题目内容」编辑框中
      if (newContent) {
        setDetailContent(newContent);
        detailContentRef.current = newContent;
      }
      // 合并标签：保留已有标签，仅把 AI 新识别出的标签追加进去（不覆盖、不重复）
      setDetail((prev) => {
        // 双重校验：prev 必须是发起分析的那道题，否则不动
        if (!prev || prev.file_path !== analyzedPath) return prev;
        const updates = {
          // 以 prev 的最新标签为基底合并，避免并发请求下覆盖掉刚写入的结果
          tags: mergeTags(prev.tags, result.tags),
          // 解题思路（summary）直接覆盖更新
          summary: newSummary,
          // 题目内容更新为 AI 提取的完整内容
          content: newContent || prev.content,
          difficulty: newDifficulty,
        };
        return { ...prev, ...updates };
      });
      setDetailDirty(true);
      const added = (Array.isArray(result.tags) ? result.tags : [])
        .filter((t) => !(snapshot.existingTags.includes(t)));
      const promptSuffix = prompt ? '（已按你的提示方向重新分析）' : '';
      setDetailAnalyzeMsg((added.length > 0
        ? `AI 重新分析完成：新增 ${added.length} 个标签，解题思路与题目内容已更新。`
        : 'AI 重新分析完成：解题思路与题目内容已更新，无新增标签。') + `请点击「保存修改」生效${promptSuffix}。`);
    } catch (e) {
      console.error('[ReAnalyze] failed:', e);
      // 题目已关闭/切换时，错误也走后台提示；前台则显示在弹窗内
      if (isForeground()) {
        setDetailError('AI 重新分析失败：' + (e.message || '未知错误'));
      } else {
        showAutoSaveToast('⚠️ AI 重新分析失败：' + (e.message || '未知错误'));
      }
    } finally {
      // 仅当本次仍是最新请求时才清除「分析中」状态，避免误清新题目的 spinner
      if (seq === detailAnalyzeSeqRef.current) setDetailAnalyzing(false);
    }
  }

  function updateDetailTags(newTags) {
    applyDetailDraft({ tags: newTags });
  }

  async function saveDetailTitle() {
    if (titleSavingRef.current) return;
    titleSavingRef.current = true;
    try {
      const v = editTitleValue.trim();
      if (v) {
        setEditingTitle(false);
        setEditTitleValue(v);
        applyDetailDraft({ title: v });
      } else {
        setEditTitleValue(detail.title || '');
        setEditingTitle(false);
      }
    } finally {
      titleSavingRef.current = false;
    }
  }

  function saveDetailContent() {
    applyDetailDraft({ content: detailContentRef.current });
  }

  function getSolutionFullPath(filename) {
    if (!detail || !filename) return '';
    const normalized = detail.file_path.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    if (idx === -1) return filename;
    return `${detail.file_path.slice(0, idx + 1)}${filename}`;
  }

  function saveSolution(text, images) {
    applyDetailDraft({ solution: JSON.stringify({ text, images }) });
  }

  function saveSolutionText() {
    saveSolution(solutionTextRef.current, solutionImagesRef.current);
  }

  async function uploadSolutionImage(base64Data, ext = 'png') {
    if (!detail) return;
    try {
      const resp = await fetch('/api/solution-image', withStudentHeader({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: detail.file_path, image_data: base64Data, ext })
      }));
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      const newImages = [...solutionImagesRef.current, result.filename];
      setSolutionImages(newImages);
      solutionImagesRef.current = newImages;
      saveSolution(solutionTextRef.current, newImages);
    } catch (e) {
      console.error('upload solution image failed', e);
      setDetailError('解答图片上传失败 ' + (e.message || '未知错误'));
    }
  }

  async function deleteSolutionImage(filename) {
    try {
      const filePath = getSolutionFullPath(filename);
      const resp = await fetch(`/api/solution-image?path=${encodeURIComponent(filePath)}`, withStudentHeader({ method: 'DELETE' }));
      if (!resp.ok && resp.status !== 404) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      const newImages = solutionImagesRef.current.filter((f) => f !== filename);
      setSolutionImages(newImages);
      solutionImagesRef.current = newImages;
      saveSolution(solutionTextRef.current, newImages);
      // 如果删除的正是当前预览的图片，关闭预览
      if (previewSolutionImage && getSolutionFullPath(filename) === previewSolutionImage) {
        setPreviewSolutionImage(null);
      }
    } catch (e) {
      console.error('delete solution image failed', e);
      setDetailError('解答图片删除失败 ' + (e.message || '未知错误'));
    }
  }

  function handleSolutionPaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => uploadSolutionImage(reader.result, file.type.split('/')[1] || 'png');
    reader.readAsDataURL(file);
  }

  function handleSolutionFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => uploadSolutionImage(reader.result, file.type.split('/')[1] || 'png');
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function saveDetailMastery(val) {
    setDetailMastery(val);
    applyDetailDraft({ mastery: val });
  }

  function incrementPractice() {
    const newCount = detailPracticeCount + 1;
    const now = new Date();
    const local = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');
    setDetailPracticeCount(newCount);
    applyDetailDraft({ practice_count: newCount, last_practiced_at: local });
  }

  function addDetailTag() {
    const t = detailTagInput.trim();
    if (!t || !detail) return;
    if (!(detail.tags || []).includes(t)) updateDetailTags([...(detail.tags || []), t]);
    setDetailTagInput('');
  }

  function removeDetailTag(t) {
    if (!detail) return;
    updateDetailTags((detail.tags || []).filter((x) => x !== t));
  }

  function editDetailTag(oldTag, newTag) {
    if (!detail) return;
    const newTags = (detail.tags || []).map((t) => (t === oldTag ? newTag : t));
    updateDetailTags(newTags);
  }

  // --- Render ---
  return (
    <div className="mnb">
      <style>{CSS}</style>
      <div className="holes">
        <div className="hole" /><div className="hole" /><div className="hole" /><div className="hole" />
      </div>
      <div className="margin-rule" />
      <div className="shell">
        <div className="header">
          <div>
            <h1>错题<span className="hl">本</span></h1>
            <div className="subtitle">目录扫描 · AI 打标签 · 按考点查题</div>
          </div>
          {students.length > 0 && (
            <StudentSwitcher students={students} currentStudentId={currentStudentId}
              onSwitch={switchStudent} onManage={() => setTab('config')} />
          )}
          <div className="tabs">
            <button className={'tab-btn' + (tab === 'scan' ? ' active' : '')} onClick={() => setTab('scan')}
              title={analyzing ? 'AI 分析进行中，结果将保留在扫描页，可放心切换其它页面' : undefined}>
              <FolderOpen size={14} style={{ marginRight: 4, verticalAlign: -2 }} />扫描
              {analyzing && <span className="tab-analyzing-dot" title="AI 分析中" />}
            </button>
            <button className={'tab-btn' + (tab === 'library' ? ' active' : '')} onClick={() => setTab('library')}
              title={analyzing ? 'AI 分析进行中，结果将保留在扫描页，去错题库编辑不会中断分析' : undefined}>
              <BookOpen size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              错题库 {totalIndexedCount > 0 ? `(${totalIndexedCount})` : ''}
            </button>
            <button className={'tab-btn' + (tab === 'focus' ? ' active' : '')} onClick={() => switchToFocus()}
              title={analyzing ? 'AI 分析进行中，结果将保留在扫描页，切换页面不会中断分析' : undefined}>
              <Target size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              重点练{/* 重点练数量只在当前 tab 显示，但计数在加载后可获取 */}
            </button>
            <button className={'tab-btn' + (tab === 'timeline' ? ' active' : '')} onClick={() => setTab('timeline')}
              title={analyzing ? 'AI 分析进行中，结果将保留在扫描页，切换页面不会中断分析' : undefined}>
              <History size={14} style={{ marginRight: 4, verticalAlign: -2 }} />时间线
            </button>
            <button className={'tab-btn' + (tab === 'knowledge' ? ' active' : '')} onClick={() => setTab('knowledge')}
              title="sida-agent 知识库：教材 / 对话 / 导入">
              <Sparkles size={14} style={{ marginRight: 4, verticalAlign: -2 }} />知识库
            </button>
            <button className={'tab-btn' + (tab === 'config' ? ' active' : '')} onClick={() => setTab('config')}
              title={analyzing ? 'AI 分析进行中，结果将保留在扫描页，切换页面不会中断分析' : undefined}>
              <Settings size={14} style={{ marginRight: 4, verticalAlign: -2 }} />配置&统计
            </button>
          </div>
        </div>

        {/* ============ CONFIG TAB ============ */}
        {tab === 'config' && (
          <div className="panel">
            {/* ============ 学生管理 ============ */}
            <div className="config-box">
              <h2 className="config-title">学生管理</h2>
              <p className="config-hint">
                每个学生拥有独立的错题库、重点练与图片目录，数据完全隔离。切换学生在顶部右上角进行。
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <input type="text" value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addStudent(); }}
                  placeholder="新学生姓名" style={{ flex: 1, minWidth: 160, maxWidth: 240 }} />
                <button className="save-btn" style={{ marginTop: 0, padding: '6px 14px', fontSize: 13 }}
                  onClick={addStudent} disabled={studentBusy || !newStudentName.trim()}>
                  <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />添加学生
                </button>
              </div>
              {studentMsg && <div className={'save-msg' + (studentMsg.includes('失败') ? ' error' : '')} style={{ marginTop: 0, marginBottom: 10 }}>{studentMsg}</div>}
              <div className="student-list">
                {students.map((s) => (
                  <div key={s.id} className={'student-row' + (s.id === currentStudentId ? ' current' : '')}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingId === s.id ? (
                        <input type="text" value={renameValue} autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => renameStudent(s.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameStudent(s.id); if (e.key === 'Escape') setRenamingId(null); }}
                          style={{ fontSize: 14, fontWeight: 700, width: '100%', maxWidth: 200 }} />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: s.id === currentStudentId ? 700 : 400 }}>
                          {s.name}
                          {s.id === currentStudentId && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 6 }}>当前</span>}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {s.id !== currentStudentId && (
                        <button className="mini-btn" title="切换到该学生" onClick={() => switchStudent(s.id)}>切换</button>
                      )}
                      <button className="mini-btn" title="重命名"
                        onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}>
                        <Edit3 size={13} />
                      </button>
                      <button className="mini-btn danger" title="删除该学生（含其全部错题数据）"
                        disabled={students.length <= 1 || studentBusy}
                        onClick={() => setDeleteStudentTarget(s)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {deleteStudentTarget && (
                <div className="confirm-bar">
                  确认删除「{deleteStudentTarget.name}」？该学生的错题库、重点练与 AI 统计将一并删除，且不可恢复。
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button className="mini-btn" onClick={() => setDeleteStudentTarget(null)}>取消</button>
                    <button className="mini-btn danger" disabled={studentBusy}
                      onClick={() => removeStudent(deleteStudentTarget.id)}>确认删除</button>
                  </div>
                </div>
              )}
            </div>

            <div className="config-box" style={{ marginTop: 20 }}>
              <h2 className="config-title">基础配置</h2>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label">图片目录路径</label>
                <input type="text" value={dirInput}
                  onChange={(e) => setDirInput(e.target.value)}
                  placeholder="例如：C:\Users\me\Pictures\错题" />
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, display: 'block' }}>
                  程序将扫描该目录下所有图片（jpg / png / gif / webp / bmp）
                </span>
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <label className="field-label">重点练超时阈值（小时）</label>
                  <input type="number" value={focusTimeoutInput}
                    min={1} max={720}
                    onChange={(e) => setFocusTimeoutInput(e.target.value)}
                    placeholder="默认 48（即 2 天）" />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, display: 'block' }}>
                    当前：{focusTimeoutHours} 小时 ≈ {Math.round(focusTimeoutHours / 24 * 10) / 10} 天，超时未练将触发督促提醒
                  </span>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <label className="field-label">重点练每学科上限</label>
                  <input type="number" value={focusMaxPerSubject}
                    min={1} max={50}
                    onChange={(e) => setFocusMaxPerSubject(Number(e.target.value) || 10)}
                    placeholder="默认 10" />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, display: 'block' }}>
                    当前：{focusMaxPerSubject} 道/学科
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <button className="save-btn" style={{ marginTop: 0 }} onClick={saveImageDir} disabled={dirSaving}>
                  {dirSaving ? '保存中…' : '保存配置'}
                </button>
                {dirMsg && <div className={'save-msg' + (dirMsg.includes('失败') ? ' error' : '')} style={{ marginTop: 0 }}>{dirMsg}</div>}
              </div>
              {dirMsg && dirMsg.includes('成功') && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                  💡 提示：设置每学科重点练上限后，需切换一次「重点练」标签页即可生效。
                </div>
              )}
            </div>

            {/* ============ 知识库服务（sida-agent）配置 ============ */}
            <div className="config-box" style={{ marginTop: 20 }}>
              <h2 className="config-title">知识库服务（sida-agent）</h2>
              <p className="config-hint" style={{ marginTop: 0 }}>
                错题本「知识库」页通过本服务对接 sida-agent 的 HTTP API（README 3.4）。请确保 sida-agent 已启动：
                <code style={{ marginLeft: 4 }}>uv run python main.py --stage serve --host 127.0.0.1 --port 6173</code>
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}>
                  <label className="field-label">服务地址（Host）</label>
                  <input type="text" value={sidaHostInput}
                    onChange={(e) => setSidaHostInput(e.target.value)}
                    placeholder="例如：127.0.0.1 或 http://192.168.1.10" />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                  <label className="field-label">端口（Port）</label>
                  <input type="number" value={sidaPortInput}
                    onChange={(e) => setSidaPortInput(e.target.value)}
                    placeholder="默认 6173" />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="save-btn" style={{ marginTop: 0 }} onClick={saveSidaConfig} disabled={sidaSaving}>
                  {sidaSaving ? '保存中…' : '保存配置'}
                </button>
                <button className="kb-btn" onClick={testSidaConnection} disabled={sidaTesting} style={{ height: 34 }}>
                  {sidaTesting ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />} 测试连接
                </button>
                {sidaMsg && <div className={'save-msg' + (sidaMsg.includes('失败') || sidaMsg.includes('无法') ? ' error' : '')} style={{ marginTop: 0 }}>{sidaMsg}</div>}
              </div>
            </div>

            {/* ============ AI TOKEN 统计 ============ */}
            <div className="config-box" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 className="config-title" style={{ margin: 0 }}>AI Token 统计</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="scope-toggle">
                    <button className={'scope-btn' + (tokenScope === 'student' ? ' active' : '')}
                      onClick={() => { setTokenScope('student'); loadTokenStats('student'); }}>当前学生</button>
                    <button className={'scope-btn' + (tokenScope === 'all' ? ' active' : '')}
                      onClick={() => { setTokenScope('all'); loadTokenStats('all'); }}>全家合计</button>
                  </div>
                  <button className="save-btn" style={{ marginTop: 0, padding: '4px 10px', fontSize: 12 }}
                    onClick={() => loadTokenStats()} disabled={tokenStatsLoading}>
                    {tokenStatsLoading ? '刷新中…' : '刷新'}
                  </button>
                </div>
              </div>
              <p className="config-hint">
                按「图片题目提取」与「解题分析」两类分别统计 token 消耗。历史总量永久累计；每日明细仅保留当前月（{tokenStats?.month || '—'}）。缓存命中来自 API 返回的 cached_tokens（Ollama 端点不上报，恒为 0）。
              </p>

              {tokenStatsError && (
                <div className="save-msg error" style={{ marginTop: 8 }}>{tokenStatsError}</div>
              )}

              {tokenStats && (
                <div style={{ marginTop: 12 }}>
                  {/* 顶部合计 */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <TokenStatCard label={tokenScope === 'all' ? '全家历史总消耗' : '历史总消耗'} value={tokenStats.grand.history.total}
                      sub={`${(tokenStats.grand.history.calls || 0).toLocaleString()} 次调用 · 输入 ${fmtTokens(tokenStats.grand.history.prompt)} / 输出 ${fmtTokens(tokenStats.grand.history.completion)} · 缓存命中 ${fmtTokens(tokenStats.grand.history.cached)}`} />
                    <TokenStatCard label={`${tokenScope === 'all' ? '全家' : ''}本月合计（${tokenStats.month}）`} value={tokenStats.grand.month.total}
                      sub={`${(tokenStats.grand.month.calls || 0).toLocaleString()} 次调用 · 输入 ${fmtTokens(tokenStats.grand.month.prompt)} / 输出 ${fmtTokens(tokenStats.grand.month.completion)} · 缓存命中 ${fmtTokens(tokenStats.grand.month.cached)}`} />
                  </div>

                  {/* 各学生分项（仅全家合计） */}
                  {tokenScope === 'all' && tokenStats.students && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>各学生消耗</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {tokenStats.students.map((st) => (
                          <TokenStatCard key={st.id} label={st.name}
                            value={st.grand?.history?.total || 0}
                            valueColor={st.id === currentStudentId ? 'var(--accent-2)' : undefined}
                            sub={`本月 ${fmtTokens(st.grand?.month?.total || 0)} · 历史 ${(st.grand?.history?.calls || 0).toLocaleString()} 次调用`} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 分类卡片 */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    {TOKEN_CATEGORIES.map((cat) => {
                      const h = tokenStats.categories[cat.key]?.history || {};
                      const m = tokenStats.categories[cat.key]?.month || {};
                      const hitRate = h.prompt ? Math.round((h.cached || 0) / h.prompt * 100) : 0;
                      return (
                        <TokenStatCard key={cat.key}
                          label={cat.label}
                          value={h.total || 0}
                          valueColor={cat.color}
                          sub={`本月 ${fmtTokens(m.total || 0)} · 本月 ${(m.calls || 0).toLocaleString()} 次 · 历史缓存命中 ${fmtTokens(h.cached || 0)}（${hitRate}%）`} />
                      );
                    })}
                  </div>

                  {/* 当月每日消耗柱状图（仅单学生视图） */}
                  {tokenScope === 'student' && (
                    <React.Fragment>
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>
                        本月每日消耗
                      </div>
                      <TokenDailyChart daily={tokenStats.daily} />
                    </React.Fragment>
                  )}
                </div>
              )}

              {!tokenStats && !tokenStatsLoading && !tokenStatsError && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>暂无统计数据</div>
              )}
            </div>
          </div>
        )}

        {/* ============ SCAN TAB ============ */}
        {tab === 'scan' && (
          <div className="panel">
            <div className="scan-header">
              {imageDir ? (
                <span className="scan-dir">{imageDir}</span>
              ) : (
                <span style={{ color: 'var(--margin)', fontSize: 13 }}>请先在"配置"页面设置图片目录</span>
              )}
              <button className="refresh-btn" onClick={doScan} disabled={scanning || !imageDir || analyzing}
                title={analyzing ? 'AI 分析进行中，刷新扫描会丢弃当前分析结果，请等待完成或先取消' : undefined}>
                {scanning ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                {analyzing && !scanning ? '分析中，暂不可刷新' : scanning ? '扫描中…' : '刷新扫描'}
              </button>
              {scanData && (
                <span className="scan-stats">
                  待索引 {scanData.unindexed_count} 张
                </span>
              )}
            </div>
            {scanError && <div className="error-msg"><AlertCircle size={13} /> {scanError}</div>}

            {/* Analyzing overlay */}
            {analyzingFile && (
              <div className="analyze-overlay">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 640px', minWidth: 320 }}>
                    <img className="analyze-img" src={API.imageUrl(analyzingFile)} alt="分析中"
                      onClick={() => setScanPreviewImage(analyzingFile)}
                      title="点击查看大图（可滚轮缩放）" />
                    {!draft && (
                      <button className="analyze-btn" onClick={() => startAnalyze(analyzingFile)} disabled={analyzing}>
                        {analyzing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                        {analyzing ? 'AI 分析中…' : 'AI 分析知识点'}
                      </button>
                    )}
                    {!draft && analyzing && (
                      <button className="analyze-btn"
                        style={{ background: 'var(--paper)', color: 'var(--ink)', marginTop: 8 }}
                        onClick={cancelAnalyze}>
                        取消分析
                      </button>
                    )}
                    {analysisError && <div className="error-msg"><AlertCircle size={13} /> {analysisError}</div>}
                    {draft && (
                      <button className="analyze-btn"
                        style={{ background: 'var(--paper)', color: 'var(--ink)', marginTop: 8 }}
                        onClick={() => startAnalyze(analyzingFile)} disabled={analyzing}>
                        {analyzing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}重新分析
                      </button>
                    )}
                  </div>
                  {draft && (
                    <div style={{ flex: '1 1 280px' }}>
                      <div className="field">
                        <label className="field-label">题目标题</label>
                        <input type="text" value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          placeholder="例如：相似三角形与中位线综合题" />
                      </div>
                      <div className="field">
                        <label className="field-label">题目复述</label>
                        <textarea rows={4} value={draft.summary}
                          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                          placeholder="题目的文字描述，方便以后搜索" />
                      </div>
                      <div className="field">
                        <label className="field-label">AI 提取题目内容</label>
                        <textarea rows={6} value={draft.content}
                          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                          placeholder="AI 从图片中提取的题目内容，可手动修正" />
                      </div>
                      <div className="field">
                        <label className="field-label">难度评分</label>
                        <StarRating value={draft.difficulty} onChange={(v) => setDraft({ ...draft, difficulty: v })} />
                      </div>
                      <div className="field">
                        <label className="field-label">知识点标签（双击编辑，点击 × 删除）</label>
                        <div className="tag-list-vertical">
                          {draft.tags.map((t) => (
                            <div key={t} className="tag-row">
                              <TagPill tag={t} onDelete={removeTag} onEdit={editTag} />
                            </div>
                          ))}
                          {draft.tags.length === 0 && (
                            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>还没有标签</span>
                          )}
                        </div>
                        <div className="tag-add-row">
                          <input type="text" placeholder="添加知识点，回车确认" value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                          <button onClick={addTag}><Plus size={14} /></button>
                        </div>
                      </div>
                      <button className="save-btn" onClick={saveIndex} disabled={saving}>
                        {saving ? '保存中…' : '保存索引'}
                      </button>
                      <button className="save-btn secondary" style={{ marginLeft: 8 }}
                        onClick={cancelAnalyze}>
                        {analyzing ? '取消分析' : '取消'}
                      </button>
                      {saveMsg && <div className="save-msg">{saveMsg}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty / No scan */}
            {!scanData && !scanning && !analyzingFile && imageDir && (
              <div className="empty"><RefreshCw size={36} /><p>点击"刷新扫描"查看目录中的图片</p></div>
            )}
            {!imageDir && (
              <div className="empty"><FolderOpen size={36} /><p>请先在"配置"页面设置图片存放目录</p></div>
            )}

            {/* 仅显示未索引题目 */}
            {scanData && !analyzingFile && (scanData.subject_order || Object.keys(scanData.by_subject || {})).map((subject) => {
              const group = scanData.by_subject[subject]; if (!group) return null;
              // 该学科下无未索引题目时跳过
              if (!group.unindexed || group.unindexed.length === 0) return null;
              return (
                <div key={subject} style={{ marginBottom: 24 }}>
                  <div className="section-title">{subject || '未分类'} <span className="badge" style={{ marginLeft: 8, fontSize: 11 }}>{(group.unindexed || []).length} 张</span></div>
                  <div className="scan-grid">
                    {group.unindexed.map((img) => (
                      <div key={img.file_path} className="scan-card unindexed"
                        onClick={() => handleScanCardClick(img.file_path)}
                        title="单击开始 AI 分析，双击查看原图">
                        <button className="scan-card-delete-btn"
                          onClick={(e) => { e.stopPropagation(); setScanDeleteTarget(img.file_path); }}
                          title="删除图片">
                          <X size={13} />
                        </button>
                        <div className="thumb">
                          <img src={API.imageUrl(img.file_path)} alt={img.file_name} loading="lazy" />
                        </div>
                        <div className="info">
                          <span className="status new">● 待索引</span>
                          <div style={{ fontSize: 10.5, marginTop: 2 }}>{img.file_name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* 扫描页删除确认弹窗 */}
            {scanDeleteTarget && (
              <div className="modal-overlay" onClick={() => { if (!scanDeleting) setScanDeleteTarget(null); }}>
                <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                  <button className="modal-close" onClick={() => { if (!scanDeleting) setScanDeleteTarget(null); }}>
                    <X size={16} />
                  </button>
                  <h2 style={{ fontSize: 17, marginBottom: 8 }}>确认删除</h2>
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 16 }}>
                    将<strong style={{ color: 'var(--margin)' }}>彻底删除</strong>该图片文件，包括：
                  </p>
                  <ul style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.8, marginBottom: 16, paddingLeft: 20 }}>
                    <li>原题图片 <code style={{ fontSize: 11, background: 'var(--paper)', padding: '1px 6px', borderRadius: 3 }}>{scanDeleteTarget.split(/[\\/]/).pop()}</code></li>
                    <li>该题关联的解答图片等资源</li>
                  </ul>
                  <p style={{ fontSize: 12, color: 'var(--margin)', fontWeight: 600, marginBottom: 16 }}>
                    ⚠️ 此操作不可恢复
                  </p>
                  <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <button className="save-btn secondary" style={{ marginTop: 0 }}
                      onClick={() => { if (!scanDeleting) setScanDeleteTarget(null); }}
                      disabled={scanDeleting}>
                      取消
                    </button>
                    <button className="save-btn" style={{ marginTop: 0, background: 'var(--margin)', borderColor: 'var(--margin)' }}
                      onClick={deleteScanImage} disabled={scanDeleting}>
                      {scanDeleting ? '删除中…' : '彻底删除'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 扫描页大图预览 */}
            {scanPreviewImage && (
              <ZoomableImagePreview
                src={API.imageUrl(scanPreviewImage)}
                alt="原题预览"
                onClose={() => setScanPreviewImage(null)}
              />
            )}
          </div>
        )}

        {/* ============ LIBRARY TAB ============ */}
        {tab === 'library' && (() => {
          return (
            <div className="panel library-panel">
              {!libLoaded ? (
                <div className="empty"><Loader2 size={28} className="spin" /><p>加载中…</p></div>
              ) : subjects.length === 0 ? (
                /* 空状态：整个错题库没有任何已索引的错题 */
                <div className="empty"><BookOpen size={40} /><p>还没有索引任何错题，去"扫描"页面导入吧</p></div>
              ) : (
                <>
                  {/* ---- 学科标题 + 统计 + 学科分类按钮：同一行显示 ---- */}
                  <div className="subject-page-header">
                    <div className="subject-title-block">
                      <h2 className="subject-page-title">{getSubjectLabel()}</h2>
                      <span className="subject-page-stats">
                        共 {allIndexed.length} 题
                        {filtered.length !== allIndexed.length && (
                          <span className="subject-filtered-hint">，当前筛出 {filtered.length} 题</span>
                        )}
                      </span>
                    </div>
                    {/* 学科主标签行 */}
                    <div className="subject-tab-bar">
                      {subjects.map((s) => (
                        <button key={s.name}
                          className={'filter-pill' + (activeSubject === s.name ? ' active' : '')}
                          onClick={() => switchSubject(s.name)}>
                          {s.name}<span className="count-badge">{s.total_count}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 左右布局：左侧知识点侧栏 + 右侧主区 */}
                  <div className="library-layout">
                    {/* 左侧知识点侧栏 */}
                    <div className="tag-sidebar">
                      <div className="tag-sidebar-header">
                        <span className="tag-sidebar-title">知识点</span>
                        {selectedTags.length > 0 && (
                          <button className="tag-sidebar-clear" onClick={() => setSelectedTags([])}>
                            清除 ×
                          </button>
                        )}
                      </div>
                      <div className="tag-sidebar-list">
                        {allTags.length > 0 ? (
                          allTags.map(([t, count]) => (
                            <button key={t}
                              className={'sidebar-tag' + (selectedTags.includes(t) ? ' active' : '')}
                              onClick={() => toggleTag(t)}>
                              <span className="sidebar-tag-name">{t}</span>
                              <span className="sidebar-tag-count">{count}</span>
                            </button>
                          ))
                        ) : (
                          <div className="tag-sidebar-empty">暂无知识点标签</div>
                        )}
                      </div>
                    </div>

                    {/* 右侧主区 */}
                    <div className="library-main">
                      {/* 搜索和筛选工具栏 */}
                      <div className="library-toolbar">
                        <div className="search-box">
                          <Search size={15} color="#57648A" />
                          <input type="text" placeholder="搜索标题、内容或标签" value={query}
                            onChange={(e) => setQuery(e.target.value)} />
                        </div>
                        <button className="similar-open-btn" onClick={() => openSimilarFinder(null)}
                          title="拿一道题来，在错题库中查找相同 / 变体 / 类似的题目（本地快筛，可勾选 AI 智能判断）">
                          🔍 找相似题
                        </button>
                        <label className="date-filter-check">
                          <input type="checkbox" checked={dateFilterEnabled}
                            onChange={(e) => setDateFilterEnabled(e.target.checked)} />
                          按添加时间筛选
                        </label>
                        <input type="date" className="date-input" value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={!dateFilterEnabled} title="开始日期" />
                        <span className="date-sep">—</span>
                        <input type="date" className="date-input" value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          disabled={!dateFilterEnabled} title="结束日期" />
                        <select className="mastery-select" value={masteryFilter}
                          onChange={(e) => setMasteryFilter(e.target.value)} title="按掌握程度筛选">
                          <option value="">全部掌握程度</option>
                          <option value="mastered">已掌握</option>
                          <option value="unfamiliar">待攻克</option>
                          <option value="practice">勤复习</option>
                        </select>
                        <select className="view-type-select" value={dateViewType}
                          onChange={(e) => setDateViewType(e.target.value)} title="日期视图类型">
                          <option value="week">📅 按周</option>
                          <option value="day">📅 按日</option>
                          <option value="month">📅 按月</option>
                        </select>
                        {(query || selectedTags.length > 0 || dateFilterEnabled || masteryFilter) && (
                          <button className="clear-filter-btn" onClick={clearAllFilters}>清空筛选</button>
                        )}
                        {dateFilterEnabled && startDate && endDate && startDate > endDate && (
                          <span className="date-error">开始日期不能大于结束日期</span>
                        )}
                      </div>

                      {/* 按日期视图分组的题目 */}
                      {allIndexed.length === 0 ? (
                        <div className="empty"><BookOpen size={36} /><p>该学科暂无已索引的错题</p></div>
                      ) : filtered.length === 0 ? (
                        <div className="empty"><Search size={32} /><p>没有匹配的题目，试试调整筛选条件</p></div>
                      ) : (
                        groupedFiltered.map((group) => (
                          <div key={group.key} className="date-section">
                            <div className="date-section-header">
                              <span className="date-section-label">{group.label}</span>
                              <span className="date-section-count">{group.items.length} 题</span>
                            </div>
                            <div className="grid">
                              {group.items.map((p) => (
                                <ProblemCard key={p.file_path} problem={p}
                                  imageUrl={API.imageUrl(p.file_path)}
                                  onClick={() => openDetail(p)} />
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ============ FOCUS PRACTICE TAB ============ */}
        {tab === 'focus' && (() => {
          return (
            <div className="panel">
              <div className="focus-page">
                <div className="focus-page-header">
                  <div>
                    <h2 className="focus-page-title">📌 重点练</h2>
                    <p className="focus-page-desc">
                      从错题库中标记需要重点练习的题目，集中攻克薄弱环节。
                      <br />每学科最多同时标记 <strong>{focusMaxPerSubject}</strong> 道题为重点练。
                      {focusTimeoutCfg > 0 && (
                        <span> 超 {focusTimeoutCfg} 小时（{Math.round(focusTimeoutCfg / 24 * 10) / 10} 天）未练即触发督促。</span>
                      )}
                    </p>
                  </div>
                  <div className="focus-count-badge">
                    <span className="focus-count-num">{focusCount}</span>
                    <span className="focus-count-unit">道</span>
                  </div>
                </div>

                {/* 督促提醒横幅已删除 */}

                {!focusLoaded ? (
                  <div className="empty"><Loader2 size={28} className="spin" /><p>加载中…</p></div>
                ) : focusError ? (
                  <div className="empty"><AlertCircle size={32} /><p>{focusError}</p></div>
                ) : focusItems.length === 0 ? (
                  <div className="empty"><BookOpen size={40} /><p>还没有重点练题目</p>
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>在错题库中打开任意错题，点击「设为重点练」即可加入</p>
                  </div>
                ) : (() => {
                  // 按学科分组
                  const groups = {};
                  focusItems.forEach(p => {
                    const subj = p.subject || '未分类';
                    if (!groups[subj]) groups[subj] = [];
                    groups[subj].push(p);
                  });
                  const subjectOrder = ['数学', '物理', '化学', '英语', '语文'];
                  const sortedKeys = Object.keys(groups).sort((a, b) => {
                    const ia = subjectOrder.indexOf(a);
                    const ib = subjectOrder.indexOf(b);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.localeCompare(b, 'zh');
                  });
                  return sortedKeys.map(subj => (
                    <div key={subj} className="focus-subject-section">
                      <div className="focus-subject-header">
                        <span className="focus-subject-label">{subj}</span>
                        <span className="focus-subject-count">{groups[subj].length} 题</span>
                      </div>
                      <div className="grid">
                        {groups[subj].map((p) => (
                          <ProblemCard key={p.file_path} problem={p}
                            imageUrl={API.imageUrl(p.file_path)}
                            onClick={() => openDetail(p, 'focus')}
                            showOverdue={true}
                            reminder={focusReminders[p.file_path]}
                            reminderLoading={focusRemindersLoading} />
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          );
        })()}

        {/* ============ TIMELINE TAB ============ */}
        {tab === 'timeline' && (
          <div className="panel">
            {!timelineLoaded ? (
              <div className="empty"><Loader2 size={28} className="spin" /><p>加载中…</p></div>
            ) : timelineDays.length === 0 ? (
              <div className="empty"><History size={40} /><p>时间线为空</p>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  编辑错题的解答后，编辑记录会按时间出现在这里
                </p>
              </div>
            ) : (
              <div className="timeline-page">
                {timelineDays.map((day) => (
                  <div key={day.date} className="timeline-day">
                    <div className="timeline-day-header">
                      <div className="timeline-day-dot" />
                      <span className="timeline-day-date">{day.date}</span>
                      <span className="timeline-day-weekday">{day.weekday}</span>
                      <span className="timeline-day-count">{day.count}<span className="count-unit">题</span></span>
                    </div>
                    <div className="timeline-day-items">
                      {day.items.map((p) => (
                        <ProblemCard key={p.file_path} problem={p}
                          imageUrl={API.imageUrl(p.file_path)}
                          onClick={() => openDetail(p, 'timeline')}
                          extraFooter={
                            <div className="timeline-card-footer">
                              <span>✏️ 编辑 {p.edit_count} 次</span>
                              {p.last_time_display && <span>· {p.last_time_display}</span>}
                            </div>
                          } />
                      ))}
                    </div>
                  </div>
                ))}
                {/* Sentinel for infinite scroll */}
                <div ref={timelineSentinelRef} className="timeline-sentinel">
                  {timelineLoading && (
                    <div className="timeline-loading"><Loader2 size={18} className="spin" /> 加载更多…</div>
                  )}
                  {!timelineHasMore && timelineDays.length > 0 && (
                    <div className="timeline-end">已加载全部时间线</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ KNOWLEDGE BASE TAB ============ */}
        {tab === 'knowledge' && <KnowledgeBaseTab />}
      </div>

      {/* ============ DETAIL MODAL ============ */}
      {detail && (
        <div className="modal-overlay" onClick={closeDetailModal}>
          <div className="modal-container">
            {/* 翻页箭头 - 放在 modal 外部，避免触发水平滚动条 */}
            <button className="detail-nav-btn left" onClick={(e) => { e.stopPropagation(); goToPrevProblem(); }} disabled={!hasPrev} title="上一题 ←">
              <ChevronLeft size={20} />
            </button>
            <button className="detail-nav-btn right" onClick={(e) => { e.stopPropagation(); goToNextProblem(); }} disabled={!hasNext} title="下一题 →">
              <ChevronRight size={20} />
            </button>

            <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-close" onClick={closeDetailModal}><X size={16} /></div>
              <img src={API.imageUrl(detail.file_path)} alt={detail.title}
                onDoubleClick={() => setPreviewSolutionImage(detail.file_path)}
                style={{ cursor: 'zoom-in' }}
                title="双击查看大图（滚轮缩放）" />

              {/* 位置信息 */}
              {detailPositionText && (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span className="detail-position">{detailPositionText}</span>
                </div>
              )}

              {/* 可编辑标题 */}
              {editingTitle ? (
                <div className="field" style={{ marginBottom: 10 }}>
                  <input type="text" value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveDetailTitle();
                      if (e.key === 'Escape') { setEditTitleValue(detail.title || ''); setEditingTitle(false); }
                    }}
                    onBlur={saveDetailTitle}
                    autoFocus
                    style={{ fontSize: 19, fontWeight: 700, fontFamily: '"Songti SC", "STSong", serif' }} />
                </div>
              ) : (
                <h2 onClick={() => { setEditingTitle(true); setEditTitleValue(detail.title || ''); }}
                  style={{ cursor: 'pointer' }} title="点击编辑标题">
                  {detail.title || '未命名题目'} <Edit3 size={13} style={{ opacity: 0.4, verticalAlign: 'middle' }} />
                </h2>
              )}

              {detail.summary ? (
                <div className="summary">
                  <span className="ai-badge">AI 思路</span>
                  {detail.summary}
                </div>
              ) : (
                <div className="summary" style={{ color: 'var(--pencil)', opacity: 0.8 }}>
                  暂无 AI 解题思路，可在下方点击「AI 重新分析」生成
                </div>
              )}

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label">AI 提取题目内容</label>
                <textarea rows={6} value={detailContent}
                  onChange={(e) => { setDetailContent(e.target.value); detailContentRef.current = e.target.value; }}
                  onBlur={saveDetailContent}
                  placeholder="AI 从图片中提取的题目内容，可手动修正" />
              </div>

              {/* 时间信息 */}
              <div className="timestamp-row">
                {detail.created_at && (
                  <span className="timestamp">📅 添加于 {formatTime(detail.created_at)}</span>
                )}
                {detail.last_practiced_at && (
                  <span className="timestamp">🕐 最近练习 {formatTime(detail.last_practiced_at)}</span>
                )}
              </div>

              {/* 标签列表 - 一行一个 */}
              <label className="field-label">知识点标签</label>
              <div className="tag-list-vertical">
                {(detail.tags || []).map((t) => (
                  <div key={t} className="tag-row">
                    <TagPill tag={t} onDelete={removeDetailTag} onEdit={editDetailTag} />
                  </div>
                ))}
                {(detail.tags || []).length === 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>还没有标签</span>
                )}
              </div>
              <div className="tag-add-row" style={{ marginBottom: 18 }}>
                <input type="text" placeholder="添加知识点，回车确认" value={detailTagInput}
                  onChange={(e) => setDetailTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDetailTag(); } }} />
                <button onClick={addDetailTag}><Plus size={14} /></button>
              </div>

              <div className="field solution-section">
                <label className="field-label">解答</label>
                <textarea
                  ref={solutionTextareaRef}
                  rows={5}
                  value={solutionText}
                  onChange={(e) => { setSolutionText(e.target.value); solutionTextRef.current = e.target.value; setDetailDirty(true); }}
                  onBlur={saveSolutionText}
                  onPaste={handleSolutionPaste}
                  placeholder="输入解题思路，或直接在这里粘贴截图…"
                />
                {solutionImages.length > 0 && (
                  <div className="solution-images">
                    {solutionImages.map((filename) => (
                      <div key={filename} className="solution-img-wrapper">
                        <img src={API.imageUrl(getSolutionFullPath(filename))} alt={filename}
                          onDoubleClick={() => setPreviewSolutionImage(getSolutionFullPath(filename))}
                          title="双击查看原图" />
                        <button className="solution-img-delete"
                          onClick={(e) => { e.stopPropagation(); deleteSolutionImage(filename); }}
                          title="删除解答图片">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input type="file" accept="image/*" ref={solutionFileInputRef}
                  onChange={handleSolutionFileSelect} style={{ display: 'none' }} />
                <button className="solution-add-btn"
                  onClick={() => solutionFileInputRef.current?.click()}>
                  <Plus size={13} /> 添加图片
                </button>
              </div>

              {/* 掌握程度 + 练习计数 */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label className="field-label">掌握程度</label>
                  <div className="mastery-group">
                    {['mastered', 'unfamiliar', 'practice'].map((val) => (
                      <label key={val} className={'mastery-option' + (detailMastery === val ? ' active' : '')}>
                        <input type="radio" name="mastery" value={val}
                          checked={detailMastery === val}
                          onChange={() => saveDetailMastery(val)} />
                        <span className="mastery-light"
                          style={{ width: 11, height: 11, background: MASTERY_META[val].color }} />
                        <span>{MASTERY_META[val].label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">难度评分</label>
                  <StarRating value={detailDifficulty} onChange={setDetailDifficulty} />
                </div>
                <div className="field" style={{ flex: '0 0 auto', marginBottom: 0, textAlign: 'center' }}>
                  <label className="field-label">练习次数</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="practice-count">{detailPracticeCount}</span>
                    <button className="practice-btn" onClick={incrementPractice} title="练习 +1">+1</button>
                  </div>
                </div>
              </div>

              {detailError && <div className="save-msg error" style={{ marginTop: -10, marginBottom: 12 }}>{detailError}</div>}
              {detailSaving && <div className="save-msg" style={{ marginTop: -10, marginBottom: 12 }}>保存中…</div>}
              {detailAnalyzeMsg && <div className="save-msg" style={{ marginTop: -10, marginBottom: 12 }}>{detailAnalyzeMsg}</div>}

              {/* AI 重新分析的自定义提示：让用户指定解题方向/知识范围 */}
              <div className="reanalyze-prompt">
                <button type="button" className={'reanalyze-prompt-toggle' + (detailPromptOpen ? ' open' : '')}
                  onClick={() => setDetailPromptOpen((v) => !v)}
                  title="填写后，AI 重新分析会优先按你指定的方向/知识范围解题">
                  <Target size={13} />
                  AI 分析方向提示（可选）
                  <ChevronDown size={13} className="reanalyze-prompt-chevron" />
                </button>
                {detailPromptOpen && (
                  <textarea rows={3} value={detailUserPrompt}
                    onChange={(e) => setDetailUserPrompt(e.target.value)}
                    placeholder="告诉 AI 你的解题方向或知识范围，例如：我还没学动能定理，请用受力分析和牛顿第二定律的方法讲解；或：请用初中方法解答…"
                    style={{ marginTop: 8 }} />
                )}
              </div>

              <div className="modal-actions">
                <button className="save-btn" style={{ marginTop: 0 }} onClick={saveDetail} disabled={detailSaving || !detailDirty}>
                  {detailSaving ? '保存中…' : '保存修改'}
                </button>
                <button className="save-btn secondary" style={{ marginTop: 0 }}
                  onClick={reanalyzeDetail} disabled={detailAnalyzing || detailSaving}
                  title="调用 AI 重新识别题目，标签将与已有标签合并，解题思路将被更新">
                  {detailAnalyzing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  {detailAnalyzing ? 'AI 分析中…' : 'AI 重新分析'}
                </button>
                <button className="save-btn secondary similar-detail-btn" style={{ marginTop: 0 }}
                  onClick={openSimilarFromDetail} disabled={detailSaving}
                  title="根据当前题目的题干和知识点，在错题库中查找相同 / 变体 / 类似的题（自动排除本题）">
                  🔍 找相似
                </button>
                <button className={'focus-btn' + (detail.is_focus_practice === 1 ? ' active' : '')}
                  style={{ marginTop: 0 }}
                  onClick={async () => {
                    const isFocus = detail.is_focus_practice === 1;
                    try {
                      await toggleFocusPractice(detail.file_path, !isFocus);
                    } catch (e) {
                      // 错误已由 toggleFocusPractice 设置到 focusError
                    }
                  }}
                  title={detail.is_focus_practice === 1 ? '取消重点练标识' : `将该题加入重点练（每学科最多 ${focusMaxPerSubject} 道）`}>
                  {detail.is_focus_practice === 1 ? '⭐ 取消重点练' : '⚡ 设为重点练'}
                </button>
                <button className="del-btn" onClick={openDeleteConfirm}>
                  <Trash2 size={14} /> 删除
                </button>
              </div>
              {focusError && <div className="save-msg error" style={{ marginTop: 8 }}>{focusError}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ============ 找相似题弹窗 ============ */}
      {similarOpen && (
        <div className="modal-overlay similar-modal-overlay" onClick={() => { if (!similarBusy) closeSimilarFinder(); }}>
          <div className="modal similar-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeSimilarFinder} disabled={similarBusy}>
              <X size={16} />
            </button>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>🔍 找相似题</h2>
            <p className="similar-desc" style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 12 }}>
              {similarSourceFile ? (
                <>拿当前这道题去错题库里找<b>相同 / 变体 / 类似</b>的题：自动使用它的题干文字和知识点标签，并排除它本身。</>
              ) : (
                <>拿一道题来，在错题库中查找<b>相同 / 变体 / 类似</b>的题：可以直接粘贴题目文字（例如拍照识别的题干）。</>
              )}
            </p>

            {similarSourceFile && (
              <div className="similar-source-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="similar-source-chip" title={detail?.file_path}>
                  📄 {detail?.title || detail?.file_path || '当前题目'}
                </span>
                <button type="button" className="similar-small-btn"
                  onClick={() => { if (!similarBusy) setSimilarSourceFile(null); }}
                  title="改为手动粘贴题目文字再查找">
                  改为手动输入文字
                </button>
              </div>
            )}

            {!similarSourceFile && (
              <div className="field" style={{ marginBottom: 8 }}>
                <label className="field-label">
                  题目文字
                  <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--pencil)', marginLeft: 6 }}>
                    （至少 2 个字，可只输入题目片段，越完整越准确）
                  </span>
                </label>
                <textarea rows={4} value={similarText}
                  onChange={(e) => setSimilarText(e.target.value)}
                  placeholder="粘贴题目文字，例如：甲乙两地相距 240 千米，一辆汽车从甲地开往乙地，每小时行 60 千米，几小时可以到达？" />
              </div>
            )}

            <div className="similar-options">
              <label className="similar-check" title="勾选后会把本地候选交给 AI 智能判断同题 / 变体 / 类似，并说明判断理由；AI 不可用时自动退回本地快筛结果">
                <input type="checkbox" checked={similarSmart}
                  onChange={(e) => setSimilarSmart(e.target.checked)} disabled={similarBusy} />
                <span>用 AI 智能判断</span>
                <span className="similar-check-hint">更准，但需要 AI 可用</span>
              </label>
              <label className="similar-check" style={{ gap: 4 }}>
                <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>显示</span>
                <select className="similar-topk" value={similarTopK}
                  onChange={(e) => setSimilarTopK(Number(e.target.value))} disabled={similarBusy}>
                  {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>条</span>
              </label>
            </div>

            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 10, justifyContent: 'flex-end' }}>
              <button className="save-btn" style={{ marginTop: 0 }}
                onClick={runSimilarSearch}
                disabled={similarBusy || (!similarSourceFile && similarText.trim().length < 2)}>
                {similarBusy ? <Loader2 size={14} className="spin" /> : '🔍'}
                {similarBusy ? '查找中…' : '查找相似题'}
              </button>
            </div>

            {similarError && <div className="save-msg error" style={{ marginTop: 4 }}>{similarError}</div>}

            {similarBusy && (
              <div className="similar-loading">
                <Loader2 size={18} className="spin" />
                {similarSmart ? '正在比对并调用 AI 精排，请稍候…' : '正在本地题库中比对文字与知识点…'}
              </div>
            )}

            {!similarBusy && similarResult && (
              <div className="similar-result">
                <div className="similar-result-head">
                  <span className={'similar-mode-badge ' + (similarResult.mode === 'smart' ? 'smart' : similarResult.mode === 'fast_degraded' ? 'degraded' : 'fast')}>
                    {similarResult.mode === 'smart' ? '✨ AI 智能精排' : similarResult.mode === 'fast_degraded' ? '⚠️ 已自动退回本地' : '⚡ 本地快筛'}
                  </span>
                  {similarResult.results.length > 0 && (
                    <span className="similar-result-count">
                      共 {similarResult.results.length} 条结果，相关度由高到低
                    </span>
                  )}
                </div>

                {similarResult.mode === 'fast_degraded' && (
                  <div className="similar-degraded-banner">
                    AI 智能判断当前不可用，已自动切换到本地快筛结果。你可以稍后重试，或在设置中检查 AI 配置。
                  </div>
                )}

                {similarResult.results.length === 0 ? (
                  <div className="empty" style={{ padding: '28px 12px' }}>
                    <Search size={30} />
                    <p>没有找到相似题目</p>
                    <p style={{ fontSize: 12, opacity: 0.75, maxWidth: 420, margin: '0 auto' }}>
                      试试：输入更完整的题干文字 / 勾选「用 AI 智能判断」以放宽为同类题型 / 增加显示条数
                    </p>
                  </div>
                ) : (
                  <div className="similar-list">
                    {similarResult.results.map((r, i) => {
                      const kind = r.match_kind && SIMILAR_KIND_META[r.match_kind] ? r.match_kind : 'weak';
                      const kindMeta = SIMILAR_KIND_META[kind];
                      return (
                        <div key={r.file_path} className="similar-item"
                          onClick={() => openSimilarResult(r)} title="点击打开该题详情（可左右翻页浏览全部结果）">
                          <div className="similar-item-thumb">
                            <img src={API.imageUrl(r.file_path)} alt={r.title} loading="lazy" />
                          </div>
                          <div className="similar-item-body">
                            <div className="similar-item-title">
                              {r.title || '未命名题目'}
                              <span className="similar-rank">#{i + 1}</span>
                              <span className="similar-score" title="与输入题目的综合相关度">相关度 {Math.round((r.score || 0) * 100)}%</span>
                            </div>
                            <div className="similar-item-tags">
                              <span className="similar-subject-chip">{r.subject || ''}</span>
                              {(r.tags || []).slice(0, 4).map((t) => (
                                <span key={t} className="similar-tag-chip">{t}</span>
                              ))}
                              {(r.practice_count > 0) && (
                                <span className="similar-tag-chip" style={{ background: '#F3F7FC', borderColor: 'var(--grid)', color: 'var(--ink-soft)' }}>
                                  练习 {r.practice_count} 次
                                </span>
                              )}
                            </div>
                            <div className="similar-item-summary">{r.summary || '（暂无解题思路摘要）'}</div>
                            {r.reason && (
                              <div className="similar-item-reason">💬 {r.reason}</div>
                            )}
                          </div>
                          <div className="similar-item-side">
                            <span className={'similar-kind ' + kind} title={kindMeta.desc}>
                              {kindMeta.icon} {kindMeta.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => { if (!deleting) setShowDeleteConfirm(false); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { if (!deleting) setShowDeleteConfirm(false); }}>
              <X size={16} />
            </button>
            <h2 style={{ fontSize: 17, marginBottom: 8 }}>确认删除</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: 16 }}>
              请选择删除方式：
            </p>

            <label className="delete-option" style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
              border: `1.5px solid ${deleteMode === 'index' ? 'var(--accent-2)' : 'var(--grid)'}`,
              borderRadius: 8, marginBottom: 10, cursor: deleting ? 'not-allowed' : 'pointer',
              background: deleteMode === 'index' ? '#E8F5F2' : 'var(--card)',
              transition: 'all .15s', opacity: deleting ? 0.6 : 1,
            }} onClick={() => { if (!deleting) setDeleteMode('index'); }}>
              <input type="radio" name="deleteMode" value="index"
                checked={deleteMode === 'index'}
                onChange={() => setDeleteMode('index')}
                disabled={deleting}
                style={{ marginTop: 2, accentColor: 'var(--accent-2)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>仅移除索引</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                  只删除错题库中的索引记录<br />
                  保留原题图片、解答图片和其他资源<br />
                  删除后可在扫描页再次看到并重新索引
                </div>
              </div>
            </label>

            <label className="delete-option" style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
              border: `1.5px solid ${deleteMode === 'purge' ? 'var(--margin)' : 'var(--grid)'}`,
              borderRadius: 8, marginBottom: 16, cursor: deleting ? 'not-allowed' : 'pointer',
              background: deleteMode === 'purge' ? '#FDF0F0' : 'var(--card)',
              transition: 'all .15s', opacity: deleting ? 0.6 : 1,
            }} onClick={() => { if (!deleting) setDeleteMode('purge'); }}>
              <input type="radio" name="deleteMode" value="purge"
                checked={deleteMode === 'purge'}
                onChange={() => setDeleteMode('purge')}
                disabled={deleting}
                style={{ marginTop: 2, accentColor: 'var(--margin)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--margin)' }}>彻底删除</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                  删除索引记录<br />
                  删除原题图片<br />
                  删除该题关联的解答图片等资源<br />
                  删除后不会再出现在扫描页<br />
                  <span style={{ color: 'var(--margin)', fontWeight: 600 }}>不可恢复</span>
                </div>
              </div>
            </label>

            <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
              <button className="save-btn secondary" style={{ marginTop: 0 }}
                onClick={() => { if (!deleting) setShowDeleteConfirm(false); }}
                disabled={deleting}>
                取消
              </button>
              {deleteMode === 'index' ? (
                <button className="save-btn" style={{ marginTop: 0, background: 'var(--accent-2)', borderColor: 'var(--accent-2)' }}
                  onClick={() => deleteFromIndex(detail.file_path)}
                  disabled={deleting}>
                  仅移除索引
                </button>
              ) : (
                <button className="save-btn" style={{ marginTop: 0, background: 'var(--margin)', borderColor: 'var(--margin)' }}
                  onClick={() => purgeImage(detail.file_path)}
                  disabled={deleting}>
                  {deleting ? '删除中…' : '彻底删除'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 解答图片预览（支持左右箭头翻页浏览原题与多张解答图片） */}
      {previewSolutionImage && (
        <ZoomableImagePreview
          src={API.imageUrl(previewSolutionImage)}
          alt={detail && previewSolutionImage === detail.file_path ? '原题图片预览' : '解答图片预览'}
          onClose={() => setPreviewSolutionImage(null)}
          images={previewNavPaths.map((p) => API.imageUrl(p))}
          index={Math.max(0, previewNavPaths.indexOf(previewSolutionImage))}
          onNavigate={(i) => { const p = previewNavPaths[i]; if (p) setPreviewSolutionImage(p); }}
        />
      )}

      {/* AI 结果后台自动保存的轻量提示（toast） */}
      {autoSaveToast && (
        <div
          onClick={() => setAutoSaveToast(null)}
          style={{
            position: 'fixed', right: 24, bottom: 24, zIndex: 10000,
            maxWidth: 360, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(17, 24, 39, 0.94)', color: '#fff',
            fontSize: 13, lineHeight: 1.6, boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
            cursor: 'pointer',
          }}>
          {autoSaveToast}
        </div>
      )}
    </div>
  );
}
