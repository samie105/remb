package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/richie/remb/internal/config"
	"github.com/richie/remb/internal/credentials"
	"github.com/richie/remb/internal/output"
	"github.com/spf13/cobra"
)

var loginKey string

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate the CLI via browser OAuth or manual API key",
	RunE:  runLogin,
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove stored API credentials",
	Run: func(cmd *cobra.Command, args []string) {
		credentials.ClearAPIKey()
		output.Success("API credentials cleared.")
	},
}

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show current authentication status",
	Run: func(cmd *cobra.Command, args []string) {
		key := credentials.GetAPIKey()
		if key == "" {
			output.Error("Not authenticated. Run `remb login` to set up.")
			os.Exit(1)
		}
		output.Success("Authenticated")
		if len(key) > 4 {
			output.KeyValue("Key", "remb_..."+key[len(key)-4:])
		}
		output.KeyValue("Credentials", credentials.GetCredentialsFilePath())
	},
}

func init() {
	loginCmd.Flags().StringVar(&loginKey, "key", "", "Authenticate with an API key directly")
}

func getBaseURL() string {
	cfg := config.FindProjectConfig("")
	if cfg != nil && cfg.Config.APIURL != "" {
		return strings.TrimRight(cfg.Config.APIURL, "/")
	}
	return strings.TrimRight(config.DefaultAPIURL, "/")
}

func runLogin(cmd *cobra.Command, args []string) error {
	// Path 1: Manual key via --key flag
	if loginKey != "" {
		return saveAndConfirm(loginKey)
	}

	// Check if stdin is a terminal
	stat, _ := os.Stdin.Stat()
	isPiped := (stat.Mode() & os.ModeCharDevice) == 0

	if isPiped {
		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() {
			return saveAndConfirm(strings.TrimSpace(scanner.Text()))
		}
		output.Error("No API key provided via stdin.")
		os.Exit(1)
	}

	// TTY: ask the user
	fmt.Println()
	fmt.Println("  " + output.Bold("How would you like to authenticate?"))
	fmt.Println()
	fmt.Println("  " + output.Cyan("1)") + " Sign in with GitHub " + output.Dim("(opens browser)"))
	fmt.Println("  " + output.Cyan("2)") + " Paste an API key manually")
	fmt.Println()
	fmt.Print("  " + output.Bold("Choice") + " " + output.Dim("[1/2]") + ": ")

	reader := bufio.NewReader(os.Stdin)
	choice, _ := reader.ReadString('\n')
	choice = strings.TrimSpace(choice)

	if choice == "2" {
		fmt.Print("  " + output.Bold("Paste your API key") + " " + output.Dim("(from Dashboard → Settings → API Keys)") + ": ")
		key, _ := reader.ReadString('\n')
		return saveAndConfirm(strings.TrimSpace(key))
	}

	// Default: Browser OAuth
	fmt.Println()
	output.Info("Starting browser login...")

	baseURL := getBaseURL()

	resp, err := http.Post(baseURL+"/api/cli/auth/start", "application/json", nil)
	if err != nil {
		output.Error(fmt.Sprintf("Failed to start login: %v", err))
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		output.Error(fmt.Sprintf("Failed to start login: HTTP %d", resp.StatusCode))
		os.Exit(1)
	}

	var startResp struct {
		State   string `json:"state"`
		AuthURL string `json:"authUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&startResp); err != nil {
		output.Error(fmt.Sprintf("Failed to parse login response: %v", err))
		os.Exit(1)
	}

	fmt.Println()
	output.Info("Opening browser to authenticate...")
	fmt.Println(output.Dim("  If the browser doesn't open, visit:"))
	fmt.Println(output.Dim("  " + startResp.AuthURL))
	fmt.Println()

	openBrowser(startResp.AuthURL)

	fmt.Print("⠋ Waiting for browser authentication...")

	result := pollForToken(baseURL, startResp.State, 120*time.Second)
	fmt.Print("\r\033[K") // Clear the spinner line

	if result == nil {
		output.Error("Login timed out or was cancelled.")
		fmt.Println()
		output.Info("You can also login manually: " + output.Bold("remb login --key <api-key>"))
		os.Exit(1)
	}

	path, err := credentials.SaveAPIKey(result.APIKey)
	if err != nil {
		output.Error(fmt.Sprintf("Failed to save credentials: %v", err))
		os.Exit(1)
	}

	fmt.Println()
	loginMsg := "Authenticated"
	if result.Login != "" {
		loginMsg += " as " + output.Bold(result.Login)
	}
	output.Success(loginMsg + "!")
	output.KeyValue("Location", path)
	if len(result.APIKey) > 4 {
		output.KeyValue("Preview", "remb_..."+result.APIKey[len(result.APIKey)-4:])
	}
	fmt.Println()
	output.Info("Run " + output.Bold("remb get -p <project>") + " to verify your key works.")

	return nil
}

type pollResult struct {
	APIKey string
	Login  string
}

func pollForToken(baseURL, state string, timeout time.Duration) *pollResult {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 10 * time.Second}

	for time.Now().Before(deadline) {
		time.Sleep(2 * time.Second)

		u := fmt.Sprintf("%s/api/cli/auth/poll?state=%s", baseURL, url.QueryEscape(state))
		resp, err := client.Get(u)
		if err != nil {
			continue
		}

		var data struct {
			Status string `json:"status"`
			APIKey string `json:"apiKey"`
			Login  string `json:"login"`
		}
		err = json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if err != nil {
			continue
		}

		if data.Status == "completed" && data.APIKey != "" {
			return &pollResult{APIKey: data.APIKey, Login: data.Login}
		}
		if data.Status == "expired" {
			return nil
		}
	}
	return nil
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "windows":
		cmd = "rundll32"
		args = []string{"url.dll,FileProtocolHandler"}
	default:
		cmd = "xdg-open"
	}
	args = append(args, url)
	_ = exec.Command(cmd, args...).Start()
}

func saveAndConfirm(key string) error {
	if key == "" {
		output.Error("No API key provided.")
		os.Exit(1)
	}

	if !strings.HasPrefix(key, "remb_") {
		output.Error("Invalid key format. Remb keys start with " + output.Bold("remb_"))
		os.Exit(1)
	}

	path, err := credentials.SaveAPIKey(key)
	if err != nil {
		output.Error(fmt.Sprintf("Failed to save API key: %v", err))
		os.Exit(1)
	}

	fmt.Println()
	output.Success("API key saved successfully!")
	output.KeyValue("Location", path)
	if len(key) > 4 {
		output.KeyValue("Preview", "remb_..."+key[len(key)-4:])
	}
	fmt.Println()
	output.Info("Run " + output.Bold("remb get -p <project>") + " to verify your key works.")

	return nil
}
