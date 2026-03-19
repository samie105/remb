package credentials

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestGetAPIKey_EnvVar(t *testing.T) {
	t.Setenv("REMB_API_KEY", "remb_test_env_12345678")
	key := GetAPIKey()
	if key != "remb_test_env_12345678" {
		t.Errorf("expected env key, got %q", key)
	}
}

func TestGetAPIKey_File(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("REMB_API_KEY", "") // clear env

	path, err := SaveAPIKey("remb_file_key_12345678")
	if err != nil {
		t.Fatalf("SaveAPIKey: %v", err)
	}
	if path == "" {
		t.Fatal("SaveAPIKey returned empty path")
	}

	key := GetAPIKey()
	if key != "remb_file_key_12345678" {
		t.Errorf("expected file key, got %q", key)
	}
}

func TestGetAPIKey_NoCredentials(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("REMB_API_KEY", "")

	key := GetAPIKey()
	if key != "" {
		t.Errorf("expected empty key, got %q", key)
	}
}

func TestSaveAPIKey_CreatesFile(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	path, err := SaveAPIKey("remb_save_test_12345678")
	if err != nil {
		t.Fatalf("SaveAPIKey: %v", err)
	}

	expected := filepath.Join(tmp, "remb", "credentials")
	if path != expected {
		t.Errorf("path mismatch: got %q, want %q", path, expected)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	content := string(data)
	if got := "api_key=remb_save_test_12345678"; !contains(content, got) {
		t.Errorf("content %q missing %q", content, got)
	}
}

func TestSaveAPIKey_PermissionsRestricted(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permissions check not applicable on Windows")
	}

	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	path, err := SaveAPIKey("remb_perm_test_12345678")
	if err != nil {
		t.Fatalf("SaveAPIKey: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	mode := info.Mode().Perm()
	if mode != 0o600 {
		t.Errorf("expected 0600, got %04o", mode)
	}
}

func TestClearAPIKey(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("REMB_API_KEY", "")

	SaveAPIKey("remb_clear_test_12345678")
	key := GetAPIKey()
	if key != "remb_clear_test_12345678" {
		t.Fatalf("expected saved key, got %q", key)
	}

	ClearAPIKey()
	key = GetAPIKey()
	if key != "" {
		t.Errorf("expected empty after clear, got %q", key)
	}
}

func TestClearAPIKey_NoFile(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	result := ClearAPIKey()
	if result {
		t.Error("expected false when no credentials file exists")
	}
}

func TestGetCredentialsFilePath(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

	path := GetCredentialsFilePath()
	if !contains(path, "remb") || !contains(path, "credentials") {
		t.Errorf("unexpected path: %q", path)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
