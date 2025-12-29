package main

import "fmt"

// RuleSource - источник правил блокировки
// Задел под поддержку множественных источников в будущем
type RuleSource struct {
	ID       string
	Name     string
	URL      string
	Priority int
	Enabled  bool
}

// Конфигурация источников правил
var ruleSources = []RuleSource{
	{
		ID:       "easyprivacy",
		Name:     "EasyPrivacy",
		URL:      "https://easylist.to/easylist/easyprivacy.txt",
		Priority: 1,
		Enabled:  true,
	},
	// Задел под дополнительные источники:
	// {
	// 	ID:       "easylist",
	// 	Name:     "EasyList",
	// 	URL:      "https://easylist.to/easylist/easylist.txt",
	// 	Priority: 2,
	// 	Enabled:  false,
	// },
}

// mergeRules объединяет правила из разных источников с deduplication
// Возвращает дедуплицированный список правил с корректными ID
func mergeRules(ruleSets ...[]DNRRule) []DNRRule {
	seenDomains := make(map[string]bool)
	merged := []DNRRule{}
	currentID := 1
	duplicates := 0

	for _, ruleSet := range ruleSets {
		for _, rule := range ruleSet {
			// Извлекаем домен из URLFilter
			domain := rule.Condition.URLFilter
			if domain == "" {
				continue
			}

			// Deduplication
			if seenDomains[domain] {
				duplicates++
				continue
			}

			// Добавляем с новым ID
			rule.ID = currentID
			merged = append(merged, rule)
			seenDomains[domain] = true
			currentID++
		}
	}

	if duplicates > 0 {
		fmt.Printf("      Удалено дублей при объединении: %d\n", duplicates)
	}

	return merged
}

// fetchFromAllSources загружает правила из всех активных источников
// Возвращает объединенный дедуплицированный список
func fetchFromAllSources() ([]DNRRule, error) {
	allRules := [][]DNRRule{}

	for _, source := range ruleSources {
		if !source.Enabled {
			continue
		}

		fmt.Printf("\n[Источник: %s]\n", source.Name)

		switch source.ID {
		case "easyprivacy":
			rules, err := downloadAndParseEasyPrivacy()
			if err != nil {
				fmt.Printf("⚠️  Ошибка загрузки %s: %v\n", source.Name, err)
				continue
			}
			allRules = append(allRules, rules)

		// Задел под другие источники:
		// case "easylist":
		// 	rules, err := downloadAndParseEasyList()
		// 	if err != nil {
		// 		fmt.Printf("⚠️  Ошибка загрузки %s: %v\n", source.Name, err)
		// 		continue
		// 	}
		// 	allRules = append(allRules, rules)

		default:
			fmt.Printf("⚠️  Неизвестный источник: %s\n", source.ID)
		}
	}

	if len(allRules) == 0 {
		return nil, fmt.Errorf("не удалось загрузить ни одного источника")
	}

	// Объединяем с deduplication
	fmt.Printf("\n[Объединение источников]\n")
	merged := mergeRules(allRules...)
	return merged, nil
}
