package main

import (
	"fmt"
	"time"
)

// generateCMPSignatures создает сигнатуры для определения и обхода CMP систем
// CMP (Consent Management Platform) - это системы баннеров cookie
func generateCMPSignatures() []CMPSignature {
	return []CMPSignature{
		createOneTrustSignature(),
		createCookiebotSignature(),
	}
}

// createOneTrustSignature - OneTrust используется на ~40% сайтов топ-1000
// Примеры: CNN.com, Microsoft.com, Oracle.com
func createOneTrustSignature() CMPSignature {
	return CMPSignature{
		ID:   "onetrust",
		Name: "OneTrust",

		// Детекторы - как определить что на сайте OneTrust
		Detectors: []string{
			"window.OneTrust",       // JS объект OneTrust SDK
			"window.OptanonWrapper", // Альтернативный объект
			"#onetrust-banner-sdk",  // Основной баннер
			"#onetrust-consent-sdk", // Полный интерфейс настроек
			".optanon-alert-box-wrapper", // Альтернативный баннер
		},

		// Cookie который мы подсунем вместо настоящего согласия
		Cookie: Cookie{
			Name:  "OptanonConsent",
			Value: buildOneTrustCookieValue(),
		},

		// CSS селекторы элементов которые нужно спрятать
		HideSelectors: []string{
			"#onetrust-banner-sdk",
			"#onetrust-consent-sdk",
			".onetrust-pc-dark-filter", // Затемнение фона
			"#onetrust-pc-sdk",          // Preference Center
			".optanon-alert-box-wrapper",
			".optanon-alert-box-bg",
			"div[class*='onetrust']",
			"div[id*='onetrust']",
			".ot-sdk-container",
			".ot-sdk-row",
		},
	}
}

// buildOneTrustCookieValue строит значение cookie для OneTrust
// Формат: URL-encoded параметры разделенные &
func buildOneTrustCookieValue() string {
	now := time.Now()
	datestamp := now.Format("Mon+Jan+02+2006+15:04:05+GMT-0700+(MST)")

	// groups - самое важное:
	// 1:1 = Strictly Necessary (включены)
	// 2:0 = Performance (выключены)
	// 3:0 = Functional (выключены)
	// 4:0 = Targeting (выключены)
	return fmt.Sprintf(
		"isGpcEnabled=0&datestamp=%s&version=202501.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=ghost-rejector-%d&interactionCount=1&landingPath=NotLandingPage&groups=1:1,2:0,3:0,4:0",
		datestamp,
		now.Unix(),
	)
}

// createCookiebotSignature - Cookiebot популярен в Европе на средних сайтах
// Примеры: Cookiebot.com, многие EU бизнес сайты
func createCookiebotSignature() CMPSignature {
	return CMPSignature{
		ID:   "cookiebot",
		Name: "Cookiebot",

		// Детекторы
		Detectors: []string{
			"window.Cookiebot",       // JS объект Cookiebot
			"#CybotCookiebotDialog",  // Основной диалог
			"#CookiebotWidget",       // Виджет
		},

		// Cookie для Cookiebot
		Cookie: Cookie{
			Name:  "CookieConsent",
			Value: buildCookiebotCookieValue(),
		},

		// Селекторы для скрытия
		HideSelectors: []string{
			"#CybotCookiebotDialog",
			"#CookiebotWidget",
			".CybotCookiebotDialogBodyButton",
		},
	}
}

// buildCookiebotCookieValue строит значение cookie для Cookiebot
// Формат: JSON-подобная строка (не чистый JSON!)
func buildCookiebotCookieValue() string {
	now := time.Now()
	utc := now.UnixMilli() // Миллисекунды с 1970

	// necessary:true - только необходимые cookies
	// preferences:false, statistics:false, marketing:false - всё остальное отключено
	return fmt.Sprintf(
		"{stamp:'ghost-rejector',necessary:true,preferences:false,statistics:false,marketing:false,method:'explicit',ver:1,utc:%d,region:'eu'}",
		utc,
	)
}
