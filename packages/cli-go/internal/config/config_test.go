package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindProjectConfig_Found(t *testing.T) {
	tmp := t.TempDir()
	content := "project: my-project\napi_url: https://www.useremb.com\n"
	if err := os.WriteFile(filepath.Join(tmp, ".remb.yml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	found := FindProjectConfig(tmp)
	if found == nil {
		t.Fatal("expected config to be found")
	}
	if found.Config.Project != "my-project" {
		t.Errorf("project = %q, want %q", found.Config.Project, "my-project")
	}
	if found.Config.APIURL != "https://www.useremb.com" {
		t.Errorf("api_url = %q, want %q", found.Config.APIURL, "https://www.useremb.com")
	}
	if found.Dir != tmp {
		t.Errorf("dir = %q, want %q", found.Dir, tmp)
	}
}

func TestFindProjectConfig_NotFound(t *testing.T) {
	tmp := t.TempDir()
	found := FindProjectConfig(tmp)
	if found != nil {
		t.Error("expected nil when no config exists")
	}
}

func TestFindProjectConfig_WalksUp(t *testing.T) {
	tmp := t.TempDir()
	content := "project: parent-proj\napi_url: https://www.useremb.com\n"
	if err := os.WriteFile(filepath.Join(tmp, ".remb.yml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	child := filepath.Join(tmp, "src", "components")
	if err := os.MkdirAll(child, 0o755); err != nil {
		t.Fatal(err)
	}

	found := FindProjectConfig(child)
	if found == nil {
		t.Fatal("expected config to be found by walking up")
	}
	if found.Config.Project != "parent-proj" {
		t.Errorf("project = %q, want %q", found.Config.Project, "parent-proj")
	}
}

func TestFindProjectConfig_DefaultAPIURL(t *testing.T) {
	tmp := t.TempDir()
	content := "project: test-proj\n"
	if err := os.WriteFile(filepath.Join(tmp, ".remb.yml"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	found := FindProjectConfig(tmp)
	if found == nil {
		t.Fatal("expected config")
	}
	if found.Config.APIURL != DefaultAPIURL {
		t.Errorf("api_url = %q, want default %q", found.Config.APIURL, DefaultAPIURL)
	}
}

func TestWriteProjectConfig(t *testing.T) {
	tmp := t.TempDir()
	cfg := ProjectConfig{
		Project: "write-test",
		APIURL:  "https://www.useremb.com",
		IDE:     "vscode",
	}

	path, err := WriteProjectConfig(tmp, cfg)
	if err != nil {
		t.Fatalf("WriteProjectConfig: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	content := string(data)

	expectations := []string{"project: write-test", "api_url: https://www.useremb.com", "ide: vscode"}
	for _, exp := range expectations {
		found := false
		for i := 0; i <= len(content)-len(exp); i++ {
			if content[i:i+len(exp)] == exp {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("content missing %q", exp)
		}
	}
}

func TestWriteProjectConfig_RoundTrip(t *testing.T) {
	tmp := t.TempDir()
	cfg := ProjectConfig{
		Project: "roundtrip",
		APIURL:  "https://custom.example.com",
	}

	WriteProjectConfig(tmp, cfg)
	found := FindProjectConfig(tmp)
	if found == nil {
		t.Fatal("expected config after write")
	}
	if found.Config.Project != "roundtrip" {
		t.Errorf("project = %q", found.Config.Project)
	}
	if found.Config.APIURL != "https://custom.example.com" {
		t.Errorf("api_url = %q", found.Config.APIURL)
	}
}
