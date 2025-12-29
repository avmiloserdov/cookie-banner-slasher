// Service worker для Ghost Rejector
// В Manifest V3 background скрипты работают как event-driven service workers

// Счетчик заблокированных запросов
let blockedCount = 0;

// Загружаем счетчик из хранилища при старте
chrome.storage.local.get(['blockedCount'], (result) => {
  blockedCount = result.blockedCount || 0;
  updateBadge();
});

// Обновляем badge на иконке расширения
function updateBadge() {
  const text = blockedCount > 0 ? blockedCount.toString() : 'ON';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }); // Зелёный цвет
}

// Слушаем сообщения от content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'cmpDetected') {
    // Content script обнаружил CMP систему
    console.log(`Ghost Rejector: Обнаружена CMP "${message.cmpName}" на ${sender.tab?.url}`);
  }

  if (message.type === 'cookieInjected') {
    // Content script успешно инъецировал cookie
    console.log(`Ghost Rejector: Cookie инъецирован для ${message.cmpName}`);
  }
});

// Можно добавить отслеживание блокировок через declarativeNetRequest
// Но в production режиме это API недоступно, поэтому просто показываем статус
updateBadge();
