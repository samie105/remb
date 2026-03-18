package scanner

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Default ignore patterns
var defaultIgnore = []string{
	"node_modules", ".git", ".next", "dist", "build",
	"__pycache__", ".venv", "vendor", ".idea", ".vscode",
	"coverage", ".nyc_output", ".turbo", ".cache",
}

// Source file extensions we care about
var sourceExtensions = map[string]string{
	".ts":     "typescript",
	".tsx":    "typescript-react",
	".js":     "javascript",
	".jsx":    "javascript-react",
	".py":     "python",
	".go":     "go",
	".rs":     "rust",
	".java":   "java",
	".rb":     "ruby",
	".php":    "php",
	".swift":  "swift",
	".kt":     "kotlin",
	".cs":     "csharp",
	".cpp":    "cpp",
	".c":      "c",
	".h":      "c-header",
	".vue":    "vue",
	".svelte": "svelte",
}

// ScanResult represents a scanned directory's context.
type ScanResult struct {
	FeatureName string
	Content     string
	EntryType   string
	Tags        []string
}

// ScanOptions configures the scanner.
type ScanOptions struct {
	Path   string
	Depth  int
	Ignore []string
}

// ScanDirectory scans a directory and produces context entries.
func ScanDirectory(opts ScanOptions) (files []string, results []ScanResult, err error) {
	root, err := filepath.Abs(opts.Path)
	if err != nil {
		return nil, nil, fmt.Errorf("resolve path: %w", err)
	}

	ignoreSet := make(map[string]bool)
	for _, p := range defaultIgnore {
		ignoreSet[p] = true
	}
	for _, p := range opts.Ignore {
		ignoreSet[p] = true
	}

	// Group files by their parent directory
	dirFiles := make(map[string][]string)

	err = filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return nil // Skip errors
		}

		rel, _ := filepath.Rel(root, path)

		// Check depth
		depth := strings.Count(rel, string(filepath.Separator))
		if depth > opts.Depth {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Skip ignored directories
		if info.IsDir() {
			if ignoreSet[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}

		// Only process source files
		ext := strings.ToLower(filepath.Ext(info.Name()))
		if _, ok := sourceExtensions[ext]; !ok {
			return nil
		}

		files = append(files, path)
		dir := filepath.Dir(rel)
		if dir == "." {
			dir = filepath.Base(root)
		}
		dirFiles[dir] = append(dirFiles[dir], rel)

		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("scan directory: %w", err)
	}

	// Build context entries per directory
	for dir, dirFileList := range dirFiles {
		featureName := strings.ReplaceAll(dir, string(filepath.Separator), "/")

		var contentBuilder strings.Builder
		contentBuilder.WriteString(fmt.Sprintf("Auto-scanned directory: %s\n\n", dir))
		contentBuilder.WriteString(fmt.Sprintf("Files (%d):\n", len(dirFileList)))

		langCounts := make(map[string]int)
		for _, f := range dirFileList {
			ext := strings.ToLower(filepath.Ext(f))
			if lang, ok := sourceExtensions[ext]; ok {
				langCounts[lang]++
			}
			contentBuilder.WriteString(fmt.Sprintf("  - %s\n", f))
		}

		contentBuilder.WriteString("\nLanguages:\n")
		for lang, count := range langCounts {
			contentBuilder.WriteString(fmt.Sprintf("  - %s: %d files\n", lang, count))
		}

		tags := []string{"auto-scan"}
		for lang := range langCounts {
			tags = append(tags, lang)
		}

		results = append(results, ScanResult{
			FeatureName: featureName,
			Content:     contentBuilder.String(),
			EntryType:   "scan",
			Tags:        tags,
		})
	}

	return files, results, nil
}
