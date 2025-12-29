package main

// DNRRule - правило для Chrome DeclarativeNetRequest API
// Используется для блокировки трекеров на сетевом уровне
type DNRRule struct {
	ID        int       `json:"id"`
	Priority  int       `json:"priority"`
	Action    Action    `json:"action"`
	Condition Condition `json:"condition"`
}

// Action - что делать с запросом
type Action struct {
	Type           string          `json:"type"` // "block" или "modifyHeaders"
	RequestHeaders []RequestHeader `json:"requestHeaders,omitempty"`
}

// RequestHeader - модификация HTTP заголовка
type RequestHeader struct {
	Header    string `json:"header"`
	Operation string `json:"operation"` // "set", "remove", "append"
	Value     string `json:"value"`
}

// Condition - когда применять правило
type Condition struct {
	URLFilter     string   `json:"urlFilter,omitempty"`     // Паттерн URL (с wildcards *)
	ResourceTypes []string `json:"resourceTypes,omitempty"` // Типы ресурсов
}

// CMPSignature - сигнатура для определения CMP системы
// Содержит всю инфу для детекции и обхода конкретной CMP
type CMPSignature struct {
	ID            string   `json:"id"`            // Уникальный ID (onetrust, cookiebot)
	Name          string   `json:"name"`          // Человеческое имя
	Detectors     []string `json:"detectors"`     // Как определить эту CMP на странице
	Cookie        Cookie   `json:"cookie"`        // Какой cookie подставить
	HideSelectors []string `json:"hideSelectors"` // CSS селекторы для скрытия баннеров
}

// Cookie - данные для инъекции cookie
type Cookie struct {
	Name  string `json:"name"`  // Имя cookie
	Value string `json:"value"` // Значение cookie
}
