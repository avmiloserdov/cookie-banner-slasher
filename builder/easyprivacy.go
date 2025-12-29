package main

import (
	"bufio"
	"io"
	"net/http"
	"strings"
)

const (
	easyPrivacyURL = "https://easylist.to/easylist/easyprivacy.txt"
	maxRules       = 5000 // Берем только первые 5000 правил для оптимизации
)

// downloadAndParseEasyPrivacy скачивает список EasyPrivacy и парсит его в DNR правила
func downloadAndParseEasyPrivacy() ([]DNRRule, error) {
	resp, err := http.Get(easyPrivacyURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return parseEasyPrivacyRules(resp.Body), nil
}

// parseEasyPrivacyRules парсит EasyPrivacy формат в DeclarativeNetRequest правила
// Ищет только простые правила формата ||domain.com^ (самые эффективные)
func parseEasyPrivacyRules(r io.Reader) []DNRRule {
	scanner := bufio.NewScanner(r)
	rules := []DNRRule{}
	id := 1

	for scanner.Scan() && len(rules) < maxRules {
		line := strings.TrimSpace(scanner.Text())

		// Пропускаем мусор
		if shouldSkipLine(line) {
			continue
		}

		// Обрабатываем только ||domain^ правила
		if domain := extractDomain(line); domain != "" {
			rules = append(rules, createBlockRule(id, domain))
			id++
		}
	}

	return rules
}

// shouldSkipLine проверяет, нужно ли пропустить строку
func shouldSkipLine(line string) bool {
	// Комментарии и секции
	if strings.HasPrefix(line, "!") || strings.HasPrefix(line, "[") {
		return true
	}
	// Exception правила (@@)
	if strings.HasPrefix(line, "@@") {
		return true
	}
	// Косметические правила (##, #%#, ###)
	if strings.Contains(line, "##") || strings.Contains(line, "#%#") || strings.Contains(line, "###") {
		return true
	}
	return false
}

// extractDomain извлекает домен из правила формата ||domain.com^
func extractDomain(line string) string {
	// Проверяем формат ||domain^
	if !strings.HasPrefix(line, "||") || !strings.Contains(line, "^") {
		return ""
	}

	// Убираем ||
	domain := line[2:]

	// Находим ^
	caretIdx := strings.Index(domain, "^")
	if caretIdx <= 0 {
		return ""
	}
	domain = domain[:caretIdx]

	// Убираем опции (все после $)
	if dollarIdx := strings.Index(domain, "$"); dollarIdx > 0 {
		domain = domain[:dollarIdx]
	}

	// Пропускаем regex паттерны
	if strings.Contains(domain, "/") && strings.HasSuffix(domain, "/") {
		return ""
	}

	return domain
}

// createBlockRule создает DNR правило для блокировки домена
func createBlockRule(id int, domain string) DNRRule {
	return DNRRule{
		ID:       id,
		Priority: 1,
		Action: Action{
			Type: "block",
		},
		Condition: Condition{
			URLFilter: "*" + domain + "*",
			// Блокируем все типы ресурсов с трекерами
			ResourceTypes: []string{
				"script",
				"image",
				"xmlhttprequest",
				"other",
				"stylesheet",
				"font",
				"media",
			},
		},
	}
}
