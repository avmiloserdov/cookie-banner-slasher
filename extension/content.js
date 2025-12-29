// Content script - выполняется на каждой странице
// Задача: найти CMP систему, инъецировать cookie отказа, спрятать баннеры

(async function() {
  'use strict';

  console.log('Ghost Rejector: Content script запущен на', window.location.href);

  // Загружаем сигнатуры CMP систем
  const result = await loadSignatures();
  if (!result || !result.signatures) {
    console.error('Ghost Rejector: Не удалось загрузить сигнатуры');
    return;
  }

  const { signatures, source, version } = result;
  console.log(`Ghost Rejector: Загружено ${signatures.length} сигнатур из источника: ${source} (версия: ${version})`);

  // Ждем готовности DOM для надежной работы с cookies
  await waitForDOMReady();

  // Инъецируем cookies СРАЗУ, до детекции (превентивно)
  injectAllCookiesPreventively(signatures);

  // Агрессивное скрытие - запускаем сразу
  hideAllBanners(signatures);

  // Пытаемся детектировать CMP
  detectAndInject(signatures);

  // Повторные проверки для асинхронно загружаемых CMP
  const timers = [];
  timers.push(setTimeout(() => {
    detectAndInject(signatures);
    hideAllBanners(signatures);
  }, 500));

  timers.push(setTimeout(() => {
    detectAndInject(signatures);
    hideAllBanners(signatures);
  }, 1000));

  timers.push(setTimeout(() => {
    detectAndInject(signatures);
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


// Загрузка signatures.json с надежным fallback
async function loadSignatures() {
  try {
    const url = chrome.runtime.getURL('rules/signatures.json');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    // Валидация что получили массив с сигнатурами
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Невалидный формат signatures.json');
    }

    return {
      signatures: data,
      source: 'file',
      version: 'latest'
    };
  } catch (error) {
    console.warn('Ghost Rejector: ⚠️ Не удалось загрузить signatures.json, используем встроенные сигнатуры:', error.message);
    return {
      signatures: getBuiltInSignatures(),
      source: 'builtin',
      version: '2025-01-01'
    };
  }
}

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
function detectAndInject(signatures) {
  for (const cmp of signatures) {
    if (isCMPPresent(cmp)) {
      console.log(`Ghost Rejector: Обнаружена CMP "${cmp.name}"`);

      // Отправляем сообщение в background
      try {
        chrome.runtime.sendMessage({
          type: 'cmpDetected',
          cmpName: cmp.name
        });
      } catch (e) {
        // Игнорируем ошибки отправки сообщений
      }

      // Инъецируем cookie
      if (injectCookie(cmp.cookie)) {
        console.log(`Ghost Rejector: Cookie "${cmp.cookie.name}" установлен`);

        try {
          chrome.runtime.sendMessage({
            type: 'cookieInjected',
            cmpName: cmp.name
          });
        } catch (e) {
          // Игнорируем ошибки отправки сообщений
        }

        // Скрываем баннеры
        hideBanners(cmp.hideSelectors);

        // Проверка эффективности через 2 секунды
        setTimeout(() => checkEffectiveness(cmp), 2000);
      } else {
        console.warn(`Ghost Rejector: Не удалось установить cookie "${cmp.cookie.name}"`);
      }

      // Продолжаем проверку других CMP (не break!)
    }
  }
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
  try {
    // Оптимизация: объединяем все селекторы в один запрос к DOM
    const combinedSelector = selectors.join(', ');
    const elements = document.querySelectorAll(combinedSelector);

    if (elements.length > 0) {
      console.log(`Ghost Rejector: Скрываем ${elements.length} элементов за один проход DOM`);
    }

    elements.forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('position', 'absolute', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('width', '0', 'important');
      el.style.setProperty('height', '0', 'important');
      el.style.setProperty('overflow', 'hidden', 'important');
      // Дополнительно удаляем из DOM
      el.remove();
    });
  } catch (error) {
    console.warn('Ghost Rejector: Ошибка скрытия баннера:', error);
  }

  // Убираем overlay если есть
  removeBodyOverflow();
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
