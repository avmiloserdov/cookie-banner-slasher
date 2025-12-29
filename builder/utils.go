package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// saveJSON сохраняет данные в JSON файл с отступами для читаемости
// Автоматически создает директорию если её нет
func saveJSON(filename string, data interface{}) error {
	// Создаем директорию если не существует
	dir := filepath.Dir(filename)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ") // 2 пробела для отступов
	return encoder.Encode(data)
}
