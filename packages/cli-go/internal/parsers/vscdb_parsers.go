package parsers

import (
	"fmt"
	"path/filepath"
)

// CursorParser parses chat history from Cursor (VS Code fork).
type CursorParser struct{}

func (p *CursorParser) ID() IDESource       { return IDECursor }
func (p *CursorParser) DisplayName() string { return "Cursor" }

func (p *CursorParser) Detect() (bool, error) {
	return detectWorkspaceStorage("Cursor"), nil
}

func (p *CursorParser) ListProjects() ([]IDEProject, error) {
	return listWorkspaceProjects("Cursor")
}

func (p *CursorParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	storagePath := getWorkspaceStoragePath("Cursor")
	projectDir := filepath.Join(storagePath, projectID)

	return parseVscdbConversations(projectDir,
		[]string{
			"workbench.panel.aichat.view.aichat.chatdata",
			"composer.composerData",
		},
		[]string{"%aichat%", "%composer%"},
	)
}

// VSCodeCopilotParser parses chat history from VS Code (GitHub Copilot Chat).
type VSCodeCopilotParser struct{}

func (p *VSCodeCopilotParser) ID() IDESource       { return IDEVSCode }
func (p *VSCodeCopilotParser) DisplayName() string { return "VS Code (Copilot)" }

func (p *VSCodeCopilotParser) Detect() (bool, error) {
	return detectWorkspaceStorage("Code"), nil
}

func (p *VSCodeCopilotParser) ListProjects() ([]IDEProject, error) {
	return listWorkspaceProjects("Code")
}

func (p *VSCodeCopilotParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	storagePath := getWorkspaceStoragePath("Code")
	projectDir := filepath.Join(storagePath, projectID)

	return parseVscdbConversations(projectDir,
		[]string{"github.copilot.chat.history"},
		[]string{"%copilot%chat%"},
	)
}

// WindsurfParser parses chat history from Windsurf (Codeium).
type WindsurfParser struct{}

func (p *WindsurfParser) ID() IDESource       { return IDEWindsurf }
func (p *WindsurfParser) DisplayName() string { return "Windsurf" }

func (p *WindsurfParser) Detect() (bool, error) {
	return detectWorkspaceStorage("Windsurf"), nil
}

func (p *WindsurfParser) ListProjects() ([]IDEProject, error) {
	return listWorkspaceProjects("Windsurf")
}

func (p *WindsurfParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	storagePath := getWorkspaceStoragePath("Windsurf")
	projectDir := filepath.Join(storagePath, projectID)

	return parseVscdbConversations(projectDir,
		[]string{"windsurf.chat.history", "codeium"},
		[]string{"%codeium%chat%", "%windsurf%"},
	)
}

// VisualStudioParser parses chat history from Visual Studio (Windows only).
type VisualStudioParser struct{}

func (p *VisualStudioParser) ID() IDESource       { return IDEVisualStudio }
func (p *VisualStudioParser) DisplayName() string { return "Visual Studio" }

func (p *VisualStudioParser) Detect() (bool, error) {
	// Visual Studio stores in %LOCALAPPDATA% on Windows
	dir := visualStudioBaseDir()
	if dir == "" {
		return false, nil
	}
	return dirExists(dir), nil
}

func (p *VisualStudioParser) ListProjects() ([]IDEProject, error) {
	dir := visualStudioBaseDir()
	if dir == "" {
		return nil, fmt.Errorf("not on Windows")
	}
	return listSubdirProjects(dir, "ConversationHistory")
}

func (p *VisualStudioParser) ParseConversations(projectID string) ([]ParsedConversation, error) {
	dir := visualStudioBaseDir()
	if dir == "" {
		return nil, nil
	}
	return parseJSONFileConversations(filepath.Join(dir, projectID))
}
