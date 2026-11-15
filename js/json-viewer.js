// API response viewer (FR-07): Formatted / Raw tabs, copy-to-clipboard,
// light JSON syntax highlighting, and scroll support.

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function highlightJson(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(JSON_TOKEN, (match, str, colon, keyword, number) => {
    if (str) {
      return colon
        ? `<span class="tok-key">${str}</span>${colon}`
        : `<span class="tok-str">${str}</span>`;
    }
    if (keyword) return `<span class="tok-bool">${keyword}</span>`;
    if (number) return `<span class="tok-num">${number}</span>`;
    return match;
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function createJsonViewer({ tablist, panel, code, statusEl, copyButton }) {
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const state = {
    view: 'formatted',
    kind: 'empty', // 'loading' | 'empty' | 'data'
    data: null,
    raw: null,
    cache: new Map(),
  };

  function activeText() {
    if (!state.data) return '';
    return state.view === 'raw' ? state.raw : JSON.stringify(state.data, null, 2);
  }

  function render() {
    if (state.kind !== 'data' || !state.data) {
      const label = state.kind === 'loading'
        ? 'Fetching response…'
        : 'No response yet — search a city and the live payload will appear here.';
      code.innerHTML = `<span class="json-placeholder">${escapeHtml(label)}</span>`;
      return;
    }
    let html = state.cache.get(state.view);
    if (!html) {
      html = highlightJson(activeText());
      state.cache.set(state.view, html);
    }
    code.innerHTML = html;
  }

  function syncTabs() {
    const activeTab = tabs.find((tab) => tab.dataset.view === state.view);
    tabs.forEach((tab) => {
      const selected = tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', activeTab ? activeTab.id : 'tab-formatted');
  }

  function setView(view) {
    if (!['formatted', 'raw'].includes(view) || view === state.view) return;
    state.view = view;
    syncTabs();
    render();
  }

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) setView(tab.dataset.view);
  });

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.findIndex((tab) => tab.dataset.view === state.view);
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    setView(next.dataset.view);
    next.focus();
  });

  async function copyCurrent() {
    const value = activeText();
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // fall through to the legacy path
    }
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  syncTabs();

  return {
    setLoading() {
      state.kind = 'loading';
      state.data = null;
      state.raw = null;
      state.cache.clear();
      statusEl.textContent = 'Fetching response…';
      copyButton.disabled = true;
      render();
    },
    setEmpty() {
      state.kind = 'empty';
      state.data = null;
      state.raw = null;
      state.cache.clear();
      statusEl.textContent = 'No response yet.';
      copyButton.disabled = true;
      render();
    },
    setData(data, raw) {
      state.kind = 'data';
      state.data = data;
      state.raw = raw;
      state.cache.clear();
      const bytes = new Blob([raw]).size;
      statusEl.textContent = `200 OK · WeatherAPI /v1/current.json · ${formatBytes(bytes)}`;
      copyButton.disabled = false;
      render();
    },
    copyCurrent,
    get view() {
      return state.view;
    },
  };
}
