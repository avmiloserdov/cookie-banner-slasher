// Popup script - отображение статистики и отладочной информации

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupDebugToggle();
  setupCopyButton();
});

// Загрузка данных из chrome.storage
async function loadData() {
  try {
    const result = await chrome.storage.local.get([
      'currentPageStats',
      'globalStats',
      'currentPageLogs'
    ]);

    updateCurrentPage(result.currentPageStats);
    updateGlobalStats(result.globalStats);
    updateDebugLogs(result.currentPageLogs, false); // Показываем последние 10
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Обновление секции Current Page
function updateCurrentPage(pageStats) {
  if (!pageStats) {
    document.getElementById('pageUrl').textContent = 'No page data available';
    return;
  }

  // URL
  const url = new URL(pageStats.url);
  document.getElementById('pageUrl').textContent = url.hostname + url.pathname;

  // CMP Status
  const cmpStatusEl = document.getElementById('cmpStatus');
  if (pageStats.cmpDetected) {
    cmpStatusEl.innerHTML = `✓ ${pageStats.cmpDetected}`;
    cmpStatusEl.className = 'stat-value success';
  } else if (pageStats.status === 'no-cmp') {
    cmpStatusEl.innerHTML = `⚠️ CMP не определена`;
    cmpStatusEl.className = 'stat-value warning';
  } else if (pageStats.status === 'error') {
    cmpStatusEl.innerHTML = `❌ Error`;
    cmpStatusEl.className = 'stat-value error';
  } else {
    cmpStatusEl.textContent = '—';
    cmpStatusEl.className = 'stat-value';
  }

  // Elements Hidden
  document.getElementById('elementsHidden').textContent = pageStats.elementsHidden || 0;

  // Cookies
  const cookiesCount = pageStats.cookiesInjected?.length || 0;
  document.getElementById('cookiesCount').textContent = cookiesCount;

  // Cookie List
  const cookieListEl = document.getElementById('cookieList');
  if (cookiesCount > 0) {
    cookieListEl.style.display = 'block';
    cookieListEl.innerHTML = pageStats.cookiesInjected
      .map(cookie => `<div class="cookie-item">• ${cookie}</div>`)
      .join('');
  } else {
    cookieListEl.style.display = 'none';
  }
}

// Обновление Global Stats
function updateGlobalStats(globalStats) {
  if (!globalStats) {
    return;
  }

  // Rules count
  const rulesCount = globalStats.signaturesCount || 0;
  document.getElementById('rulesCount').textContent = rulesCount.toLocaleString();

  // Signatures version
  document.getElementById('signaturesVersion').textContent =
    globalStats.signaturesVersion || 'unknown';

  // Source
  const sourceMap = {
    'cache': 'GitHub (cached)',
    'github': 'GitHub',
    'local-file': 'Local file',
    'builtin': 'Built-in'
  };
  document.getElementById('signaturesSource').textContent =
    sourceMap[globalStats.signaturesSource] || globalStats.signaturesSource || '—';

  // Last update
  if (globalStats.lastUpdate) {
    const ago = formatTimeAgo(globalStats.lastUpdate);
    document.getElementById('lastUpdate').textContent = ago;
  } else {
    document.getElementById('lastUpdate').textContent = '—';
  }
}

// Обновление Debug Logs
function updateDebugLogs(logs, showAll = false) {
  const logsContainer = document.getElementById('logsContainer');

  if (!logs || logs.length === 0) {
    logsContainer.innerHTML = '<div style="text-align: center; color: #9aa0a6; padding: 16px;">No logs yet</div>';
    return;
  }

  // Показываем последние 10 или все 50
  const displayLogs = showAll ? logs.slice(-50) : logs.slice(-10);

  logsContainer.innerHTML = displayLogs
    .reverse()
    .map(log => {
      const time = new Date(log.time).toLocaleTimeString('ru-RU');
      return `
        <div class="log-entry">
          <span class="log-time">${time}</span>
          <span class="log-type ${log.type}">${log.type.toUpperCase()}</span>
          <span class="log-msg">${escapeHtml(log.msg)}</span>
        </div>
      `;
    })
    .join('');
}

// Setup Debug Toggle
function setupDebugToggle() {
  const debugToggle = document.getElementById('debugToggle');
  const debugContent = document.getElementById('debugContent');
  const debugChevron = document.getElementById('debugChevron');
  let isExpanded = false;

  debugToggle.addEventListener('click', async () => {
    isExpanded = !isExpanded;

    if (isExpanded) {
      debugContent.classList.add('expanded');
      debugChevron.classList.add('expanded');

      // Загружаем все 50 логов при раскрытии
      const result = await chrome.storage.local.get(['currentPageLogs']);
      updateDebugLogs(result.currentPageLogs, true);
    } else {
      debugContent.classList.remove('expanded');
      debugChevron.classList.remove('expanded');
    }
  });
}

// Setup Copy Button
function setupCopyButton() {
  const copyButton = document.getElementById('copyButton');

  copyButton.addEventListener('click', async () => {
    const report = await generateDebugReport();

    try {
      await navigator.clipboard.writeText(report);
      copyButton.textContent = '✓ Copied!';
      copyButton.classList.add('copied');

      setTimeout(() => {
        copyButton.textContent = 'Copy Debug Report';
        copyButton.classList.remove('copied');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      copyButton.textContent = '❌ Failed';
      setTimeout(() => {
        copyButton.textContent = 'Copy Debug Report';
      }, 2000);
    }
  });
}

// Generate Debug Report
async function generateDebugReport() {
  const result = await chrome.storage.local.get([
    'currentPageStats',
    'globalStats',
    'currentPageLogs'
  ]);

  const pageStats = result.currentPageStats || {};
  const globalStats = result.globalStats || {};
  const logs = result.currentPageLogs || [];

  const manifest = chrome.runtime.getManifest();

  let report = `Ghost Rejector Debug Report
===========================
Extension Version: ${manifest.version}
Date: ${new Date().toLocaleString('ru-RU')}

CURRENT PAGE
------------
URL: ${pageStats.url || 'N/A'}
CMP Detected: ${pageStats.cmpDetected || 'None'}
Elements Hidden: ${pageStats.elementsHidden || 0}
Cookies: ${pageStats.cookiesInjected?.join(', ') || 'None'}
Status: ${pageStats.status || 'unknown'}

GLOBAL STATS
------------
Signatures Count: ${globalStats.signaturesCount || 'N/A'}
Signatures Version: ${globalStats.signaturesVersion || 'N/A'}
Source: ${globalStats.signaturesSource || 'N/A'}
Last Update: ${globalStats.lastUpdate ? new Date(globalStats.lastUpdate).toLocaleString('ru-RU') : 'N/A'}

RECENT EVENTS
-------------
`;

  if (logs.length > 0) {
    logs.slice(-20).reverse().forEach(log => {
      const time = new Date(log.time).toLocaleTimeString('ru-RU');
      report += `${time} [${log.type.toUpperCase()}] ${log.msg}\n`;
    });
  } else {
    report += 'No logs available\n';
  }

  report += `
BROWSER INFO
------------
User Agent: ${navigator.userAgent}
`;

  return report;
}

// Utility: Format time ago
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
