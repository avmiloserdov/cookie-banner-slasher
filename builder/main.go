package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("Ghost Rejector Builder")
	fmt.Println("======================")

	// Шаг 1: Загружаем и парсим EasyPrivacy
	fmt.Println("\n[1/4] Скачивание EasyPrivacy списка...")
	rules, err := downloadAndParseEasyPrivacy()
	if err != nil {
		fmt.Printf("Ошибка: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("      Распарсено %d правил блокировки\n", len(rules))

	// Шаг 2: Добавляем правило GPC заголовка
	fmt.Println("[2/4] Добавление GPC заголовка...")
	rules = append(rules, createGPCRule())

	// Шаг 3: Генерируем сигнатуры для OneTrust и Cookiebot
	fmt.Println("[3/4] Генерация сигнатур CMP...")
	signatures := generateCMPSignatures()

	// Шаг 4: Сохраняем JSON файлы
	fmt.Println("[4/4] Сохранение файлов...")
	if err := saveJSON("../extension/rules/net_rules.json", rules); err != nil {
		fmt.Printf("Ошибка сохранения правил: %v\n", err)
		os.Exit(1)
	}
	if err := saveJSON("../extension/rules/signatures.json", signatures); err != nil {
		fmt.Printf("Ошибка сохранения сигнатур: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n✓ Создано %d сетевых правил\n", len(rules))
	fmt.Printf("✓ Создано %d CMP сигнатур\n", len(signatures))
	fmt.Println("\nГотово! Загрузите расширение из папки ../extension/")
}
