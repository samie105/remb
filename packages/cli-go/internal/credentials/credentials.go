package credentials

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func getCredentialsDir() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "remb")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".config", "remb")
}

func getCredentialsPath() string {
	return filepath.Join(getCredentialsDir(), "credentials")
}

// GetAPIKey returns the API key from env var or credentials file.
func GetAPIKey() string {
	if key := os.Getenv("REMB_API_KEY"); key != "" {
		return key
	}

	path := getCredentialsPath()
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "api_key=") {
			return strings.TrimSpace(strings.TrimPrefix(line, "api_key="))
		}
	}
	return ""
}

// SaveAPIKey writes the API key to the credentials file with 0600 permissions.
func SaveAPIKey(apiKey string) (string, error) {
	dir := getCredentialsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create credentials directory: %w", err)
	}

	path := getCredentialsPath()
	content := fmt.Sprintf(
		"# Remb API credentials\n# Keep this file secret — do not commit to version control\napi_key=%s\n",
		apiKey,
	)

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write credentials: %w", err)
	}

	// Ensure proper permissions even if file already existed
	if runtime.GOOS != "windows" {
		_ = os.Chmod(path, 0o600)
	}

	return path, nil
}

// ClearAPIKey empties the credentials file.
func ClearAPIKey() bool {
	path := getCredentialsPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return false
	}
	_ = os.WriteFile(path, []byte(""), 0o600)
	return true
}

// GetCredentialsFilePath returns the path to the credentials file.
func GetCredentialsFilePath() string {
	return getCredentialsPath()
}
