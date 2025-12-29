package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("Ghost Rejector Builder")
	fmt.Println("======================")

	// Шаг 1: Загружаем правила из всех активных источников
	fmt.Println("\n[1/4] Загрузка правил блокировки из источников...")
	rules, err := fetchFromAllSources()
	if err != nil {
		fmt.Printf("Ошибка: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("      ✓ Итого уникальных правил: %d\n", len(rules))

	// Шаг 2: Добавляем правило GPC заголовка
	fmt.Println("\n[2/4] Добавление GPC заголовка...")
	rules = append(rules, createGPCRule())

	// Шаг 3: Генерируем сигнатуры для OneTrust и Cookiebot
	fmt.Println("\n[3/4] Генерация сигнатур CMP...")
	signatures := generateCMPSignatures()

	// Шаг 4: Сохраняем JSON файлы
	fmt.Println("\n[4/4] Сохранение файлов...")
	if err := saveJSON("../extension/rules/net_rules.json", rules); err != nil {
		fmt.Printf("Ошибка сохранения правил: %v\n", err)
		os.Exit(1)
	}
	if err := saveJSON("../extension/rules/signatures.json", signatures); err != nil {
		fmt.Printf("Ошибка сохранения сигнатур: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n✓ Создано %d сетевых правил (+ 1 GPC)\n", len(rules)-1)
	fmt.Printf("✓ Создано %d CMP сигнатур\n", len(signatures))
	fmt.Println("\n🎉 Готово! Правила сохранены в ../extension/rules/")
}
