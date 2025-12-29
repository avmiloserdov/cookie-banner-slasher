package main

// createGPCRule создает правило для добавления Global Privacy Control заголовка
// GPC - это стандарт который сигнализирует сайтам что пользователь не хочет трекинга
func createGPCRule() DNRRule {
	return DNRRule{
		ID:       5001, // Отдельный ID после всех блокировочных правил
		Priority: 1,
		Action: Action{
			Type: "modifyHeaders",
			RequestHeaders: []RequestHeader{
				{
					Header:    "Sec-GPC",
					Operation: "set",
					Value:     "1", // 1 = пользователь НЕ согласен на трекинг
				},
			},
		},
		Condition: Condition{
			// Применяем только к основным фреймам (сами страницы, не ресурсы)
			ResourceTypes: []string{"main_frame", "sub_frame"},
		},
	}
}
