package parsers

// AllParsers returns all registered IDE parsers.
func AllParsers() []IDEParser {
	return []IDEParser{
		&CursorParser{},
		&ClaudeCodeParser{},
		&VSCodeCopilotParser{},
		&WindsurfParser{},
		&IntelliJParser{},
		&PyCharmParser{},
		&AndroidStudioParser{},
		&VisualStudioParser{},
		&ZedParser{},
		&SublimeTextParser{},
	}
}

// GetParser returns a specific parser by IDE id.
func GetParser(id IDESource) IDEParser {
	for _, p := range AllParsers() {
		if p.ID() == id {
			return p
		}
	}
	return nil
}

// DetectAvailableIDEs returns parsers for IDEs found on this machine.
func DetectAvailableIDEs() []IDEParser {
	var available []IDEParser
	for _, p := range AllParsers() {
		ok, err := p.Detect()
		if err == nil && ok {
			available = append(available, p)
		}
	}
	return available
}

// ConversationToEvents converts a ParsedConversation into RawConversationEvent slice.
func ConversationToEvents(conv ParsedConversation) []RawConversationEvent {
	var events []RawConversationEvent
	for _, msg := range conv.Messages {
		switch msg.Role {
		case "user":
			text := msg.Text
			if len(text) > 2000 {
				text = text[:2000]
			}
			events = append(events, RawConversationEvent{
				Type:      "user_message",
				Text:      text,
				Timestamp: msg.Timestamp,
			})
		case "assistant":
			text := msg.Text
			if len(text) > 4000 {
				text = text[:4000]
			}
			events = append(events, RawConversationEvent{
				Type:      "ai_response",
				Text:      text,
				Timestamp: msg.Timestamp,
			})
		case "tool":
			text := msg.Text
			if len(text) > 500 {
				text = text[:500]
			}
			events = append(events, RawConversationEvent{
				Type:      "tool_call",
				Text:      text,
				Name:      msg.ToolName,
				Timestamp: msg.Timestamp,
			})
		}
	}
	return events
}
