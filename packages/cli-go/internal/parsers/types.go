package parsers

import "time"

// IDESource identifies a supported IDE.
type IDESource string

const (
	IDECursor        IDESource = "cursor"
	IDEClaudeCode    IDESource = "claude-code"
	IDEVSCode        IDESource = "vscode"
	IDEWindsurf      IDESource = "windsurf"
	IDEIntelliJ      IDESource = "intellij"
	IDEPyCharm       IDESource = "pycharm"
	IDEAndroidStudio IDESource = "android-studio"
	IDEVisualStudio  IDESource = "visual-studio"
	IDEZed           IDESource = "zed"
	IDESublimeText   IDESource = "sublime-text"
)

// IDEProject represents a single workspace / project within an IDE.
type IDEProject struct {
	ID            string
	Name          string
	StoragePath   string
	WorkspacePath string
	LastModified  time.Time
}

// ConversationMessage is a single message in a conversation.
type ConversationMessage struct {
	Role      string // "user", "assistant", "tool", "system"
	Text      string
	Timestamp int64  // Unix ms
	ToolName  string // only for tool messages
}

// ParsedConversation is a full conversation parsed from IDE storage.
type ParsedConversation struct {
	ID        string
	Title     string
	Messages  []ConversationMessage
	StartedAt *time.Time
	EndedAt   *time.Time
}

// IDEParser is the interface every IDE parser must implement.
type IDEParser interface {
	ID() IDESource
	DisplayName() string
	Detect() (bool, error)
	ListProjects() ([]IDEProject, error)
	ParseConversations(projectID string) ([]ParsedConversation, error)
}

// RawConversationEvent matches the server-side event type for the smart ingestion API.
type RawConversationEvent struct {
	Type      string `json:"type"` // user_message, ai_response, tool_call, file_save, chat_turn, editor_focus
	Text      string `json:"text,omitempty"`
	Path      string `json:"path,omitempty"`
	Name      string `json:"name,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
}
