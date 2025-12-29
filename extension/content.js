// Content script - выполняется на каждой странице
// Задача: найти CMP систему, инъецировать cookie отказа, спрятать баннеры

// ============================================================================
// DEBUG LOGGING & PAGE STATS
// ============================================================================

const DEBUG_LOG_LIMIT = 50; // Храним последние 50 логов
let pageStats = {
  url: window.location.href,
  cmpDetected: null,
  elementsHidden: 0,
  cookiesInjected: [],
  status: 'initializing',
  timestamp: Date.now()
};

// Debug логирование с сохранением в storage
async function debugLog(type, message) {
  const logEntry = {
    time: Date.now(),
    type: type, // 'info' | 'detection' | 'injection' | 'hide' | 'error'
    msg: message,
    url: window.location.href
  };

  console.log(`Ghost Rejector: ${message}`);

  try {
    const result = await chrome.storage.local.get(['debugLogs']);
    let logs = result.debugLogs || [];
    logs.push(logEntry);

    // Ограничиваем размер
    if (logs.length > DEBUG_LOG_LIMIT) {
      logs = logs.slice(-DEBUG_LOG_LIMIT);
    }

    await chrome.storage.local.set({ debugLogs: logs });
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось сохранить лог:', error);
  }
}

// Сохранение статистики текущей страницы
async function savePageStats() {
  try {
    await chrome.storage.local.set({
      currentPageStats: pageStats
    });
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось сохранить статистику:', error);
  }
}

(async function() {
  'use strict';

  await debugLog('info', `Content script запущен на ${window.location.href}`);

  // Загружаем сигнатуры CMP систем
  const result = await loadSignatures();
  if (!result || !result.signatures) {
    await debugLog('error', 'Не удалось загрузить сигнатуры');
    pageStats.status = 'error';
    await savePageStats();
    return;
  }

  const { signatures, source, version } = result;
  await debugLog('info', `Загружено ${signatures.length} сигнатур из источника: ${source} (версия: ${version})`);

  // Сохраняем глобальную статистику
  await chrome.storage.local.set({
    globalStats: {
      signaturesCount: signatures.length,
      signaturesVersion: version,
      signaturesSource: source,
      lastUpdate: Date.now()
    }
  });

  // Ждем готовности DOM для надежной работы с cookies
  await waitForDOMReady();

  // Инъецируем cookies СРАЗУ, до детекции (превентивно)
  injectAllCookiesPreventively(signatures);

  // Агрессивное скрытие - запускаем сразу
  hideAllBanners(signatures);

  // Пытаемся детектировать CMP
  await detectAndInject(signatures);

  // Повторные проверки для асинхронно загружаемых CMP
  const timers = [];
  timers.push(setTimeout(async () => {
    await detectAndInject(signatures);
    hideAllBanners(signatures);
  }, 500));

  timers.push(setTimeout(async () => {
    await detectAndInject(signatures);
    hideAllBanners(signatures);
  }, 1000));

  timers.push(setTimeout(async () => {
    await detectAndInject(signatures);
    hideAllBanners(signatures);
  }, 2000));

  // Устанавливаем MutationObserver для отслеживания динамически добавляемых баннеров
  const observer = setupMutationObserver(signatures);

  // Устанавливаем navigator.globalPrivacyControl для совместимости
  setGlobalPrivacyControl();

  // Cleanup при выгрузке страницы
  window.addEventListener('beforeunload', () => {
    timers.forEach(timer => clearTimeout(timer));
    if (observer) {
      observer.disconnect();
    }
  });
})();


// Ожидание готовности DOM для надежной работы с cookies
// При run_at: "document_start" DOM может быть не готов
function waitForDOMReady() {
  return new Promise((resolve) => {
    // Если DOM уже готов (interactive или complete) - продолжаем сразу
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      resolve();
      return;
    }

    // Иначе ждем события DOMContentLoaded
    const onReady = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      resolve();
    };
    document.addEventListener('DOMContentLoaded', onReady);

    // Таймаут на случай если событие не придет
    setTimeout(() => {
      document.removeEventListener('DOMContentLoaded', onReady);
      resolve();
    }, 3000);
  });
}


// ============================================================================
// АВТООБНОВЛЕНИЕ СИГНАТУР ИЗ GITHUB
// ============================================================================

// Конфигурация источников сигнатур (задел под multiple sources)
const SIGNATURE_SOURCES = [
  {
    id: 'primary',
    url: 'https://raw.githubusercontent.com/avmiloserdov/cookie-banner-slasher/main/extension/rules/signatures.json',
    priority: 1
  }
  // Можно добавить дополнительные источники:
  // {
  //   id: 'consent-o-matic',
  //   url: 'https://....',
  //   priority: 2,
  //   transform: (data) => { /* convert to our format */ }
  // }
];

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа
const STORAGE_KEY_SIGNATURES = 'cachedSignatures';
const STORAGE_KEY_TIMESTAMP = 'signaturesTimestamp';
const STORAGE_KEY_VERSION = 'signaturesVersion';

// Загрузка signatures с автообновлением из GitHub
async function loadSignatures() {
  try {
    // Шаг 1: Проверяем кэш в chrome.storage
    const cached = await getCachedSignatures();
    if (cached && isCacheValid(cached.timestamp)) {
      console.log(`Ghost Rejector: Используем кэшированные сигнатуры (${cached.signatures.length} шт, версия: ${cached.version})`);
      return {
        signatures: cached.signatures,
        source: 'cache',
        version: cached.version || 'unknown'
      };
    }

    // Шаг 2: Загружаем из GitHub (primary source)
    console.log('Ghost Rejector: Загружаем свежие сигнатуры из GitHub...');
    const githubResult = await fetchSignaturesFromGitHub();
    if (githubResult) {
      // Кэшируем на будущее
      await cacheSignatures(githubResult.signatures, githubResult.version);
      return githubResult;
    }

    // Шаг 3: Fallback на локальный файл
    console.warn('Ghost Rejector: GitHub недоступен, пытаемся загрузить локальный файл');
    const localResult = await fetchSignaturesFromLocal();
    if (localResult) {
      return localResult;
    }

    // Шаг 4: Последний fallback - встроенные сигнатуры
    throw new Error('Все источники недоступны');

  } catch (error) {
    console.warn('Ghost Rejector: ⚠️ Используем встроенные сигнатуры:', error.message);
    return {
      signatures: getBuiltInSignatures(),
      source: 'builtin',
      version: '2025-01-01'
    };
  }
}

// Получение кэшированных сигнатур из chrome.storage
async function getCachedSignatures() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEY_SIGNATURES,
      STORAGE_KEY_TIMESTAMP,
      STORAGE_KEY_VERSION
    ]);

    if (result[STORAGE_KEY_SIGNATURES] && result[STORAGE_KEY_TIMESTAMP]) {
      return {
        signatures: result[STORAGE_KEY_SIGNATURES],
        timestamp: result[STORAGE_KEY_TIMESTAMP],
        version: result[STORAGE_KEY_VERSION]
      };
    }
    return null;
  } catch (error) {
    console.warn('Ghost Rejector: Ошибка чтения кэша:', error);
    return null;
  }
}

// Проверка валидности кэша (< 24 часов)
function isCacheValid(timestamp) {
  if (!timestamp) return false;
  const age = Date.now() - timestamp;
  return age < CACHE_DURATION;
}

// Загрузка сигнатур из GitHub
async function fetchSignaturesFromGitHub() {
  try {
    const source = SIGNATURE_SOURCES[0]; // Primary source
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

    const response = await fetch(source.url, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Валидация
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Невалидный формат данных');
    }

    console.log(`Ghost Rejector: ✓ Загружено ${data.length} сигнатур из GitHub`);
    return {
      signatures: data,
      source: 'github',
      version: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    };
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось загрузить из GitHub:', error.message);
    return null;
  }
}

// Загрузка сигнатур из локального файла (fallback)
async function fetchSignaturesFromLocal() {
  try {
    const url = chrome.runtime.getURL('rules/signatures.json');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Невалидный формат');
    }

    return {
      signatures: data,
      source: 'local-file',
      version: 'bundled'
    };
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось загрузить локальный файл:', error.message);
    return null;
  }
}

// Кэширование сигнатур в chrome.storage
async function cacheSignatures(signatures, version) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_SIGNATURES]: signatures,
      [STORAGE_KEY_TIMESTAMP]: Date.now(),
      [STORAGE_KEY_VERSION]: version
    });
    console.log(`Ghost Rejector: Сигнатуры закэшированы (версия: ${version})`);
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось закэшировать:', error);
  }
}

// ============================================================================
// ВСТРОЕННЫЕ СИГНАТУРЫ (FALLBACK)
// ============================================================================

// Встроенные сигнатуры (fallback на случай проблем с загрузкой файла)
function getBuiltInSignatures() {
  const now = Date.now();
  const datestamp = new Date().toUTCString().replace(/,/g, '').replace(/ /g, '+');

  return [
    {
      id: "onetrust",
      name: "OneTrust",
      detectors: [
        "window.OneTrust",
        "window.OptanonWrapper",
        "#onetrust-banner-sdk",
        "#onetrust-consent-sdk",
        ".optanon-alert-box-wrapper"
      ],
      cookie: {
        name: "OptanonConsent",
        value: `isGpcEnabled=0&datestamp=${datestamp}&version=202501.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=ghost-rejector-${now}&interactionCount=1&landingPath=NotLandingPage&groups=1:1,2:0,3:0,4:0`
      },
      hideSelectors: [
        "#onetrust-banner-sdk",
        "#onetrust-consent-sdk",
        ".onetrust-pc-dark-filter",
        "#onetrust-pc-sdk",
        ".optanon-alert-box-wrapper",
        ".optanon-alert-box-bg",
        "div[class*='onetrust']",
        "div[id*='onetrust']",
        ".ot-sdk-container",
        ".ot-sdk-row"
      ]
    },
    {
      id: "cookiebot",
      name: "Cookiebot",
      detectors: [
        "window.Cookiebot",
        "#CybotCookiebotDialog",
        "#CookiebotWidget"
      ],
      cookie: {
        name: "CookieConsent",
        value: `{stamp:'ghost-rejector',necessary:true,preferences:false,statistics:false,marketing:false,method:'explicit',ver:1,utc:${now},region:'eu'}`
      },
      hideSelectors: [
        "#CybotCookiebotDialog",
        "#CookiebotWidget",
        ".CybotCookiebotDialogBodyButton"
      ]
    }
  ];
}


// Превентивная инъекция всех cookies до загрузки CMP
function injectAllCookiesPreventively(signatures) {
  console.log('Ghost Rejector: Превентивная инъекция cookies...');
  for (const cmp of signatures) {
    injectCookie(cmp.cookie);
  }
}

// Агрессивное скрытие всех известных селекторов
function hideAllBanners(signatures) {
  for (const cmp of signatures) {
    hideBanners(cmp.hideSelectors);
  }
}

// Определение и инъекция для найденной CMP
async function detectAndInject(signatures) {
  let foundCMP = false;

  for (const cmp of signatures) {
    if (isCMPPresent(cmp)) {
      foundCMP = true;
      await debugLog('detection', `Обнаружена CMP "${cmp.name}"`);

      // Обновляем pageStats
      pageStats.cmpDetected = cmp.name;
      pageStats.status = 'working';

      // Инъецируем cookie
      if (injectCookie(cmp.cookie)) {
        await debugLog('injection', `Cookie "${cmp.cookie.name}" установлен`);

        if (!pageStats.cookiesInjected.includes(cmp.cookie.name)) {
          pageStats.cookiesInjected.push(cmp.cookie.name);
        }

        // Скрываем баннеры
        const hidden = hideBanners(cmp.hideSelectors);
        pageStats.elementsHidden += hidden;

        // Проверка эффективности через 2 секунды
        setTimeout(() => checkEffectiveness(cmp), 2000);
      } else {
        await debugLog('error', `Не удалось установить cookie "${cmp.cookie.name}"`);
      }
    }
  }

  // Если CMP не найдена
  if (!foundCMP) {
    pageStats.status = 'no-cmp';
  }

  // Сохраняем статистику
  await savePageStats();
}

// Проверка эффективности инъекции
function checkEffectiveness(cmp) {
  const stillPresent = isCMPPresent(cmp);
  if (stillPresent) {
    console.warn(`⚠️ Ghost Rejector: Баннер ${cmp.name} всё ещё виден после инъекции!`);
    console.warn('Возможные причины:');
    console.warn('  1. Формат cookie устарел для этой версии CMP');
    console.warn('  2. Селекторы неправильные или изменились');
    console.warn('  3. CMP восстанавливает баннер через JavaScript');
    console.warn('  4. Это другая версия CMP с другим форматом');
  } else {
    console.log(`✓ Ghost Rejector: Баннер ${cmp.name} успешно скрыт и не восстановлен`);
  }
}


// Проверка наличия CMP на странице
function isCMPPresent(cmp) {
  for (const detector of cmp.detectors) {
    // Детектор для window объектов: "window.OneTrust"
    if (detector.startsWith('window.')) {
      const propName = detector.substring(7); // Убираем "window."
      if (window[propName]) {
        return true;
      }
    }
    // Детектор для DOM селекторов: "#onetrust-banner-sdk"
    else {
      if (document.querySelector(detector)) {
        return true;
      }
    }
  }
  return false;
}


// Инъекция cookie через document.cookie с retry логикой
function injectCookie(cookie, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 100;

  try {
    // Формат: name=value; path=/; max-age=31536000; SameSite=Lax
    // max-age=31536000 это 1 год
    const cookieString = `${cookie.name}=${cookie.value}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = cookieString;

    // Проверяем что cookie реально установился
    const success = document.cookie.includes(cookie.name);

    if (!success && retryCount < MAX_RETRIES) {
      // Retry через небольшую задержку
      setTimeout(() => {
        injectCookie(cookie, retryCount + 1);
      }, RETRY_DELAY * (retryCount + 1));
      return false;
    }

    // Валидация: проверяем что значение правильное
    if (success) {
      const actualValue = getCookieValue(cookie.name);
      const isCorrectFormat = actualValue.includes('groups=') || actualValue.includes('stamp:');

      if (!isCorrectFormat) {
        console.warn(`⚠️ Ghost Rejector: Cookie "${cookie.name}" установлен, но формат может быть неправильным!`);
        console.warn(`Ожидалось: ${cookie.value.substring(0, 50)}...`);
        console.warn(`Получили: ${actualValue.substring(0, 50)}...`);
      }
    } else if (retryCount >= MAX_RETRIES) {
      console.warn(`⚠️ Ghost Rejector: Не удалось установить cookie "${cookie.name}" после ${MAX_RETRIES} попыток`);
    }

    return success;
  } catch (error) {
    console.error('Ghost Rejector: Ошибка установки cookie:', error);
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => {
        injectCookie(cookie, retryCount + 1);
      }, RETRY_DELAY * (retryCount + 1));
    }
    return false;
  }
}

// Вспомогательная функция для получения значения cookie
function getCookieValue(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}


// Скрытие баннеров через CSS (оптимизированная версия с batch обработкой)
function hideBanners(selectors) {
  let hiddenCount = 0;

  try {
    // Оптимизация: объединяем все селекторы в один запрос к DOM
    const combinedSelector = selectors.join(', ');
    const elements = document.querySelectorAll(combinedSelector);

    hiddenCount = elements.length;

    if (elements.length > 0) {
      debugLog('hide', `Скрываем ${elements.length} элементов`);
    }

    elements.forEach(el => {
      // Просто удаляем из DOM
      el.remove();
    });
  } catch (error) {
    debugLog('error', `Ошибка скрытия баннера: ${error.message}`);
  }

  // Убираем overlay если есть
  removeBodyOverflow();

  return hiddenCount;
}

// Убираем блокировку скролла с body
function removeBodyOverflow() {
  try {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Убираем классы которые блокируют скролл
    const blockingClasses = ['modal-open', 'no-scroll', 'overflow-hidden'];
    blockingClasses.forEach(cls => {
      document.body.classList.remove(cls);
      document.documentElement.classList.remove(cls);
    });
  } catch (error) {
    // Игнорируем
  }
}


// MutationObserver для отслеживания динамически добавляемых баннеров
// Автоматически отключается через 30 секунд для экономии ресурсов
function setupMutationObserver(signatures) {
  let debounceTimer;
  const OBSERVER_TIMEOUT = 30000; // 30 секунд

  const observer = new MutationObserver((mutations) => {
    // Отменяем предыдущий таймер (debounce)
    clearTimeout(debounceTimer);

    // Запускаем проверку через 100ms после последнего изменения
    debounceTimer = setTimeout(() => {
      const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
      if (hasAddedNodes) {
        hideAllBanners(signatures);
      }
    }, 100);
  });

  // Наблюдаем за изменениями в body
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('Ghost Rejector: MutationObserver активирован (auto-disconnect через 30 сек)');

    // Автоматическое отключение через таймаут
    setTimeout(() => {
      observer.disconnect();
      clearTimeout(debounceTimer);
      console.log('Ghost Rejector: MutationObserver отключен (таймаут)');
    }, OBSERVER_TIMEOUT);

    return observer;
  } else {
    // Если body еще не готов, ждем
    setTimeout(() => setupMutationObserver(signatures), 100);
    return null;
  }
}

// Установка navigator.globalPrivacyControl
// Некоторые сайты проверяют это свойство перед показом баннера
function setGlobalPrivacyControl() {
  try {
    if (!navigator.globalPrivacyControl) {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        value: true,
        writable: false,
        configurable: false
      });
      console.log('Ghost Rejector: navigator.globalPrivacyControl установлен');
    }
  } catch (error) {
    console.warn('Ghost Rejector: Не удалось установить GPC:', error);
  }
}
