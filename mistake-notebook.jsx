import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Search, Loader2, Sparkles, Trash2, BookOpen, AlertCircle, RefreshCw, FolderOpen, Settings, Edit3, Check, ChevronLeft, ChevronRight, Target, History, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============== API HELPERS ==============

async function apiFetch(url, options = {}) {
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
  imageUrl(filePath) {
    return `/api/image-file?path=${encodeURIComponent(filePath)}`;
  }
};

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
  display: flex; align-items: baseline; gap: 16px;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 2px solid var(--grid);
}
.mnb .subject-page-title {
  margin: 0; font-size: 20px; font-weight: 800; color: var(--ink);
}
.mnb .subject-page-stats {
  font-size: 13px; color: var(--ink-soft); font-weight: 500;
}
.mnb .subject-filtered-hint { color: var(--margin); font-weight: 600; }

/* Library */
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
.mnb .zoom-preview-scroll {
  overflow: auto;
  max-width: 92vw;
  /* 为底部工具栏预留空间，避免工具栏压在图片上 */
  max-height: calc(92vh - 70px);
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

/* Subject tab bar (library) */
.mnb .subject-tab-bar {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px;
  padding-bottom: 14px; border-bottom: 2px solid var(--grid);
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
.mnb .library-layout { display: flex; gap: 24px; align-items: flex-start; }

/* Tag sidebar */
.mnb .tag-sidebar {
  flex: 0 0 240px; max-height: calc(100vh - 260px);
  overflow-y: auto; position: sticky; top: 0;
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

/* Library main area */
.mnb .library-main { flex: 1; min-width: 0; }

/* mastery select */
.mnb .mastery-select {
  border: 1.5px solid var(--grid); border-radius: 6px;
  padding: 5px 8px; font-size: 12.5px; color: var(--ink);
  background: var(--paper); font-family: inherit; outline: none;
}
.mnb .mastery-select:focus { border-color: var(--accent-2); }

/* responsive: sidebar collapses on narrow screens */
@media (max-width: 860px) {
  .mnb .library-layout { flex-direction: column; }
  .mnb .tag-sidebar { flex: none; width: 100%; max-height: none; position: static; }
  .mnb .tag-sidebar-list { flex-direction: row; flex-wrap: wrap; gap: 6px; }
  .mnb .sidebar-tag { width: auto; }
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

function ZoomableImagePreview({ src, alt, onClose }) {
  const scrollRef = useRef(null);
  const dialogRef = useRef(null);
  const prevFocusRef = useRef(null);
  const [nat, setNat] = useState(null);   // { w, h } 自然尺寸
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const natRef = useRef(null);
  natRef.current = nat;

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
        onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="关闭 (Esc)"><X size={16} /></button>
        <div
          ref={scrollRef}
          className="zoom-preview-scroll"
          onDoubleClick={handleDoubleClick}
          title="滚轮缩放 · 双击切换 适应窗口/原始大小"
        >
          <img
            src={src}
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
        </div>
      </div>
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
  const [focusMaxPerSubject, setFocusMaxPerSubject] = useState(5);
  const [focusSubjects, setFocusSubjects] = useState([]);

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
  // 记录详情页来源（library/focus/timeline），决定保存时是否写时间线
  const detailSourceRef = useRef('library');

  const [previewSolutionImage, setPreviewSolutionImage] = useState(null);

  // --- Delete confirmation ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState('index'); // 'index' | 'purge'
  const [deleting, setDeleting] = useState(false);

  // --- Load configs on mount ---
  useEffect(() => {
    API.getConfig().then((c) => {
      if (c.image_dir) {
        setImageDir(c.image_dir);
        setDirInput(c.image_dir);
      }
      if (c.focus_timeout_hours) {
        const v = Number(c.focus_timeout_hours);
        if (v > 0) {
          setFocusTimeoutHours(v);
          setFocusTimeoutInput(String(v));
        }
      }
      if (c.focus_max_per_subject) {
        const v = Number(c.focus_max_per_subject);
        if (v > 0) {
          setFocusMaxPerSubject(v);
        }
      }
    }).catch(() => { });
  }, []);

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

  const debounceRef = useRef(null);

  async function loadLibrary(filterParams = {}) {
    try {
      const data = await API.getAllImages(filterParams);
      if (Array.isArray(data)) {
        setAllIndexed(data);
        setTotalIndexedCount(data.length);
      } else {
        setAllIndexed(data.items || []);
        setTotalIndexedCount(data.total_count ?? 0);
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
      setFocusMaxPerSubject(data.max_count ?? 5);
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
      setFocusMaxPerSubject(focusData.max_count ?? 5);
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
    setAnalyzingFile(filePath);
    setDraft(null);
    setAnalysisError(null);
    setSaveMsg('');
    setAnalyzing(true);
    try {
      console.log('[Analysis] calling server /api/analyze');
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath })
      });

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
      console.error('[Analysis] exception:', e.message, e);
      console.groupEnd();
      setAnalysisError(e.message || 'AI analysis failed');
      setDraft({ title: '', summary: '', content: '', tags: [], difficulty: 3 });
    } finally {
      setAnalyzing(false);
    }
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
    if (tab === 'focus') return focusItems;
    if (tab === 'timeline') return timelineDays.flatMap(d => d.items);
    return flattenedGrouped;
  }, [tab, focusItems, flattenedGrouped, timelineDays]);

  const detailIndex = useMemo(() => {
    if (!detail) return -1;
    return detailPaginationSource.findIndex((p) => p.file_path === detail.file_path);
  }, [detail, detailPaginationSource]);

  const hasPrev = detailIndex > 0;
  const hasNext = detailIndex >= 0 && detailIndex < detailPaginationSource.length - 1;
  const prevProblem = hasPrev ? detailPaginationSource[detailIndex - 1] : null;
  const nextProblem = hasNext ? detailPaginationSource[detailIndex + 1] : null;
  const detailPositionText = detailIndex >= 0 ? `第 ${detailIndex + 1} / ${detailPaginationSource.length} 题` : '';

  // Auto-close detail if current problem no longer in filtered
  useEffect(() => {
    if (detail && detailIndex === -1) {
      setDetail(null);
      setPreviewSolutionImage(null);
    }
  }, [detailIndex]);

  // Keyboard navigation for detail modal (ArrowLeft/ArrowRight)
  useEffect(() => {
    if (!detail || previewSolutionImage || showDeleteConfirm) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevProblem(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToNextProblem(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detail, previewSolutionImage, showDeleteConfirm, hasPrev, hasNext, detailDirty]);

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
    const sol = (typeof p.solution === 'string' ? JSON.parse(p.solution || '{}') : (p.solution || {}));
    setDetail(p);
    setDetailTagInput('');
    setDetailError(null);
    setDetailDirty(false);
    setDetailAnalyzing(false);
    setDetailAnalyzeMsg(null);
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
    setDetail(null);
    setPreviewSolutionImage(null);
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

  // --- AI 重新分析（详情弹窗） ---
  async function reanalyzeDetail() {
    if (!detail || detailAnalyzing) return;
    setDetailAnalyzing(true);
    setDetailAnalyzeMsg(null);
    setDetailError(null);
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 若「AI 提取题目内容」编辑框已有内容，直接复用，不再从图片提取
        body: JSON.stringify({
          file_path: detail.file_path,
          content: (detailContentRef.current || '').trim() || undefined
        })
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      // 题目内容（content）：更新到「题目内容」编辑框中
      const newContent = result.content || '';
      if (newContent) {
        setDetailContent(newContent);
        detailContentRef.current = newContent;
      }
      // 合并标签：保留已有标签，仅把 AI 新识别出的标签追加进去（不覆盖、不重复）
      setDetail((prev) => {
        const existingTags = prev.tags || [];
        const incomingTags = Array.isArray(result.tags) ? result.tags : [];
        const seen = new Set(existingTags);
        const newTags = incomingTags.filter((t) => !seen.has(t));
        const updates = {
          tags: [...existingTags, ...newTags],
          // 解题思路（summary）直接覆盖更新
          summary: result.summary || prev.summary,
          // 题目内容更新为 AI 提取的完整内容
          content: newContent || prev.content,
        };
        // AI 重新判断的难度（1-5 星），无效则保持原值
        const d = Number(result.difficulty);
        if (Number.isInteger(d) && d >= 1 && d <= 5) updates.difficulty = d;
        return { ...prev, ...updates };
      });
      setDetailDirty(true);
      const added = (Array.isArray(result.tags) ? result.tags : [])
        .filter((t) => !((detail.tags || []).includes(t)));
      setDetailAnalyzeMsg(added.length > 0
        ? `AI 重新分析完成：新增 ${added.length} 个标签，解题思路与题目内容已更新。请点击「保存修改」生效。`
        : 'AI 重新分析完成：解题思路与题目内容已更新，无新增标签。请点击「保存修改」生效。');
    } catch (e) {
      console.error('[ReAnalyze] failed:', e);
      setDetailError('AI 重新分析失败：' + (e.message || '未知错误'));
    } finally {
      setDetailAnalyzing(false);
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
      const resp = await fetch('/api/solution-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: detail.file_path, image_data: base64Data, ext })
      });
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
      const resp = await fetch(`/api/solution-image?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
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
          <div className="tabs">
            <button className={'tab-btn' + (tab === 'scan' ? ' active' : '')} onClick={() => setTab('scan')}>
              <FolderOpen size={14} style={{ marginRight: 4, verticalAlign: -2 }} />扫描
            </button>
            <button className={'tab-btn' + (tab === 'library' ? ' active' : '')} onClick={() => setTab('library')}>
              <BookOpen size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              错题库 {totalIndexedCount > 0 ? `(${totalIndexedCount})` : ''}
            </button>
            <button className={'tab-btn' + (tab === 'focus' ? ' active' : '')} onClick={() => switchToFocus()}>
              <Target size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              重点练{/* 重点练数量只在当前 tab 显示，但计数在加载后可获取 */}
            </button>
            <button className={'tab-btn' + (tab === 'timeline' ? ' active' : '')} onClick={() => setTab('timeline')}>
              <History size={14} style={{ marginRight: 4, verticalAlign: -2 }} />时间线
            </button>
            <button className={'tab-btn' + (tab === 'config' ? ' active' : '')} onClick={() => setTab('config')}>
              <Settings size={14} style={{ marginRight: 4, verticalAlign: -2 }} />配置
            </button>
          </div>
        </div>

        {/* ============ CONFIG TAB ============ */}
        {tab === 'config' && (
          <div className="panel">
            <div className="config-box">
              <h2 className="config-title">图片目录</h2>
              <p className="config-hint">
                设置存放错题图片的本地文件夹路径。程序将扫描该目录下的所有图片文件（支持 jpg / png / gif / webp / bmp）。
              </p>
              <div className="field">
                <label className="field-label">目录路径</label>
                <input type="text" value={dirInput}
                  onChange={(e) => setDirInput(e.target.value)}
                  placeholder="例如：C:\Users\me\Pictures\错题" />
              </div>
            </div>

            <div className="config-box" style={{ marginTop: 20 }}>
              <h2 className="config-title">重点练督促</h2>
              <p className="config-hint">
                设置重点练题目超时阈值。超过该时长未练习的题目将触发督促提醒，并用红色边框高亮。
              </p>
              <div className="field">
                <label className="field-label">超时阈值（小时）</label>
                <input type="number" value={focusTimeoutInput}
                  min={1} max={720}
                  onChange={(e) => setFocusTimeoutInput(e.target.value)}
                  placeholder="默认 48（即 2 天）" />
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, display: 'block' }}>
                  当前值：{focusTimeoutHours} 小时 = {Math.round(focusTimeoutHours / 24 * 10) / 10} 天
                </span>
              </div>
            </div>

            <div className="config-box" style={{ marginTop: 20 }}>
              <h2 className="config-title">重点练数量</h2>
              <p className="config-hint">
                设置每个学科最多可同时标记的重点练题目数。
              </p>
              <div className="field">
                <label className="field-label">每学科上限</label>
                <input type="number" value={focusMaxPerSubject}
                  min={1} max={50}
                  onChange={(e) => setFocusMaxPerSubject(Number(e.target.value) || 5)}
                  placeholder="默认 5" />
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, display: 'block' }}>
                  当前值：{focusMaxPerSubject} 道/学科
                </span>
              </div>
            </div>

            <div className="config-box" style={{ marginTop: 8 }}>
              <button className="save-btn" style={{ marginTop: 0 }} onClick={saveImageDir} disabled={dirSaving}>
                {dirSaving ? '保存中…' : '保存配置'}
              </button>
              {dirMsg && <div className={'save-msg' + (dirMsg.includes('失败') ? ' error' : '')}>{dirMsg}</div>}
            </div>

            {dirMsg && dirMsg.includes('成功') && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, paddingLeft: 4 }}>
                💡 提示：设置每学科重点练上限后，需切换一次「重点练」标签页即可生效。
              </div>
            )}
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
              <button className="refresh-btn" onClick={doScan} disabled={scanning || !imageDir}>
                {scanning ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                {scanning ? '扫描中…' : '刷新扫描'}
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
                        onClick={() => { setAnalyzingFile(null); setDraft(null); setAnalysisError(null); }}>
                        取消
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
            <div className="panel">
              {!libLoaded ? (
                <div className="empty"><Loader2 size={28} className="spin" /><p>加载中…</p></div>
              ) : subjects.length === 0 ? (
                /* 空状态：整个错题库没有任何已索引的错题 */
                <div className="empty"><BookOpen size={40} /><p>还没有索引任何错题，去"扫描"页面导入吧</p></div>
              ) : (
                <>
                  {/* ---- 学科标题 + 统计 ---- */}
                  <div className="subject-page-header">
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
      </div>

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

            <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                  title={detail.is_focus_practice === 1 ? '取消重点练标识' : '将该题加入重点练（最多 5 道）'}>
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

      {/* 解答图片预览 */}
      {previewSolutionImage && (
        <ZoomableImagePreview
          src={API.imageUrl(previewSolutionImage)}
          alt="解答图片预览"
          onClose={() => setPreviewSolutionImage(null)}
        />
      )}
    </div>
  );
}
