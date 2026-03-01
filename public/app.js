(() => {
  'use strict';

  const THEME_KEY = 'notebook_theme';

  // ===================== API =====================
  const api = {
    async list() {
      const res = await fetch('/api/notes');
      return res.json();
    },
    async create(data) {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async update(id, data) {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async remove(id) {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    },
  };

  // ===================== State =====================
  let notes = [];
  let activeNoteId = null;
  let activeCategory = 'all';
  let searchQuery = '';
  let saveTimer = null;

  // ===================== DOM refs =====================
  const $ = (sel) => document.querySelector(sel);
  const sidebar = $('#sidebar');
  const noteList = $('#noteList');
  const searchInput = $('#searchInput');
  const emptyState = $('#emptyState');
  const editorContainer = $('#editorContainer');
  const editorTitle = $('#editorTitle');
  const editorBody = $('#editorBody');
  const categorySelect = $('#categorySelect');
  const saveStatus = $('#saveStatus');
  const wordCount = $('#wordCount');
  const updatedTime = $('#updatedTime');
  const deleteModal = $('#deleteModal');
  const themeToggle = $('#themeToggle');
  const mobileSidebarToggle = $('#mobileSidebarToggle');

  // ===================== Theme =====================
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(THEME_KEY, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_KEY, 'dark');
    }
  }

  // ===================== Helpers =====================
  const CATEGORY_LABELS = { sop: 'SOP', note: '笔记', todo: '待办' };

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小时前`;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y === now.getFullYear()) return `${m}-${day}`;
    return `${y}-${m}-${day}`;
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }

  function countChars(html) {
    return stripHtml(html).replace(/\s/g, '').length;
  }

  // ===================== Render Note List =====================
  function getFilteredNotes() {
    let filtered = notes;
    if (activeCategory !== 'all') {
      filtered = filtered.filter(n => n.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        stripHtml(n.body).toLowerCase().includes(q)
      );
    }
    return filtered;
  }

  function renderNoteList() {
    const filtered = getFilteredNotes();
    if (filtered.length === 0) {
      noteList.innerHTML = `
        <div style="padding:32px 16px;text-align:center;color:var(--text-tertiary);font-size:13px;">
          ${searchQuery ? '没有找到匹配的笔记' : '暂无笔记'}
        </div>`;
      return;
    }
    noteList.innerHTML = filtered.map(note => `
      <div class="note-item${note.id === activeNoteId ? ' active' : ''}" data-id="${note.id}">
        <div class="note-item-title">${escapeHtml(note.title) || '无标题'}</div>
        <div class="note-item-preview">${escapeHtml(stripHtml(note.body).slice(0, 80)) || '空笔记'}</div>
        <div class="note-item-meta">
          <span class="note-item-category">${CATEGORY_LABELS[note.category] || note.category}</span>
          <span>${formatDate(note.updatedAt)}</span>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================== Editor =====================
  function openNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    activeNoteId = id;
    emptyState.style.display = 'none';
    editorContainer.style.display = 'flex';
    editorTitle.value = note.title;
    editorBody.innerHTML = note.body;
    categorySelect.value = note.category;
    updateFooter(note);
    renderNoteList();

    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  }

  function updateFooter(note) {
    wordCount.textContent = `${countChars(note.body)} 字`;
    updatedTime.textContent = `最后编辑: ${formatDate(note.updatedAt)}`;
  }

  function showEmptyState() {
    activeNoteId = null;
    emptyState.style.display = '';
    editorContainer.style.display = 'none';
    renderNoteList();
  }

  function scheduleSave() {
    if (!activeNoteId) return;
    saveStatus.textContent = '保存中...';
    saveStatus.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const updated = await api.update(activeNoteId, {
          title: editorTitle.value,
          body: editorBody.innerHTML,
          category: categorySelect.value,
        });
        const idx = notes.findIndex(n => n.id === activeNoteId);
        if (idx !== -1) {
          notes[idx] = updated;
          notes.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        updateFooter(updated);
        renderNoteList();
        saveStatus.textContent = '已保存';
      } catch {
        saveStatus.textContent = '保存失败';
      }
      saveStatus.classList.remove('saving');
    }, 500);
  }

  // ===================== CRUD =====================
  async function createNote() {
    try {
      const note = await api.create({
        title: '',
        body: '',
        category: activeCategory === 'all' ? 'note' : activeCategory,
      });
      notes.unshift(note);
      openNote(note.id);
      editorTitle.focus();
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }

  async function deleteActiveNote() {
    if (!activeNoteId) return;
    try {
      await api.remove(activeNoteId);
      notes = notes.filter(n => n.id !== activeNoteId);
      showEmptyState();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  // ===================== Export =====================
  function exportAsMarkdown() {
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    const title = note.title || '无标题';
    const text = stripHtml(note.body);
    const content = `# ${title}\n\n${text}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===================== Toolbar =====================
  function execToolbar(action) {
    editorBody.focus();
    switch (action) {
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'underline':
        document.execCommand('underline');
        break;
      case 'heading':
        document.execCommand('formatBlock', false, '<h2>');
        break;
      case 'insertUnorderedList':
        document.execCommand('insertUnorderedList');
        break;
      case 'insertOrderedList':
        document.execCommand('insertOrderedList');
        break;
      case 'code':
        document.execCommand('formatBlock', false, '<pre>');
        break;
      case 'quote':
        document.execCommand('formatBlock', false, '<blockquote>');
        break;
      case 'insertHR':
        document.execCommand('insertHTML', false, '<hr>');
        break;
      case 'insertCheckbox': {
        const html = '<div><label><input type="checkbox"> </label></div>';
        document.execCommand('insertHTML', false, html);
        break;
      }
    }
    scheduleSave();
  }

  // ===================== Keyboard Shortcuts =====================
  function handleKeyboard(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      createNote();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      if (document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    }
  }

  // ===================== Init =====================
  async function init() {
    initTheme();

    // Fetch all notes from server
    try {
      notes = await api.list();
    } catch (err) {
      console.error('Failed to load notes:', err);
      notes = [];
    }

    renderNoteList();

    // New note
    $('#newNoteBtn').addEventListener('click', createNote);
    $('#emptyNewBtn').addEventListener('click', createNote);

    // Theme
    themeToggle.addEventListener('click', toggleTheme);

    // Click note
    noteList.addEventListener('click', (e) => {
      const item = e.target.closest('.note-item');
      if (item) openNote(item.dataset.id);
    });

    // Search
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderNoteList();
    });

    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCategory = tab.dataset.category;
        renderNoteList();
      });
    });

    // Editor events
    editorTitle.addEventListener('input', scheduleSave);
    editorBody.addEventListener('input', scheduleSave);
    categorySelect.addEventListener('change', scheduleSave);

    // Toolbar
    $('#editorToolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (btn) execToolbar(btn.dataset.action);
    });

    // Delete
    $('#deleteBtn').addEventListener('click', () => {
      deleteModal.style.display = '';
    });
    $('#cancelDelete').addEventListener('click', () => {
      deleteModal.style.display = 'none';
    });
    $('#confirmDelete').addEventListener('click', () => {
      deleteModal.style.display = 'none';
      deleteActiveNote();
    });

    // Export
    $('#exportBtn').addEventListener('click', exportAsMarkdown);

    // Mobile sidebar
    mobileSidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== mobileSidebarToggle) {
        sidebar.classList.remove('open');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Open first note if available
    if (notes.length > 0) {
      openNote(notes[0].id);
    }
  }

  init();
})();
