package scanner

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const manifestVersion = 1

// ScanManifest stores a snapshot of file content hashes from the last local scan.
// Lives at .remb/scan-manifest.json — conceptually like git's index.
type ScanManifest struct {
	Version   int    `json:"version"`
	ScannedAt string `json:"scanned_at"`
	Project   string `json:"project"`
	// Files maps repo-relative paths to their SHA-256 hex digest.
	Files map[string]string `json:"files"`
}

// ManifestPath returns the path to the manifest file for a given project root.
func ManifestPath(root string) string {
	return filepath.Join(root, ".remb", "scan-manifest.json")
}

// LoadManifest loads the manifest from disk. Returns an empty manifest (not an
// error) if it doesn't exist yet — first scan is always a full scan.
func LoadManifest(root string) (*ScanManifest, error) {
	path := ManifestPath(root)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &ScanManifest{Files: make(map[string]string)}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var m ScanManifest
	if err := json.Unmarshal(data, &m); err != nil {
		// Corrupt manifest — treat as first scan
		return &ScanManifest{Files: make(map[string]string)}, nil
	}
	if m.Files == nil {
		m.Files = make(map[string]string)
	}
	return &m, nil
}

// SaveManifest writes the manifest to .remb/scan-manifest.json.
func SaveManifest(root, project string, hashes map[string]string) error {
	dir := filepath.Join(root, ".remb")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create .remb dir: %w", err)
	}
	m := ScanManifest{
		Version:   manifestVersion,
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
		Project:   project,
		Files:     hashes,
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	return os.WriteFile(ManifestPath(root), data, 0o644)
}

// HashFile computes the SHA-256 hex digest of a file's contents.
func HashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// DiffResult describes what changed since the last manifest.
type DiffResult struct {
	// ChangedDirs is the set of directory names (feature names) that have
	// at least one added, modified, or deleted file.
	ChangedDirs map[string]bool
	// Added/Modified/Deleted counts for display.
	Added    int
	Modified int
	Deleted  int
}

// Diff compares the current file→hash map against the previous manifest.
// dirForFile maps a repo-relative file path to its feature/directory name.
func Diff(prev *ScanManifest, current map[string]string, dirForFile map[string]string) DiffResult {
	result := DiffResult{ChangedDirs: make(map[string]bool)}

	// Added or modified
	for file, hash := range current {
		prevHash, existed := prev.Files[file]
		if !existed {
			result.Added++
			result.ChangedDirs[dirForFile[file]] = true
		} else if prevHash != hash {
			result.Modified++
			result.ChangedDirs[dirForFile[file]] = true
		}
	}

	// Deleted
	for file := range prev.Files {
		if _, exists := current[file]; !exists {
			result.Deleted++
			result.ChangedDirs[dirForFile[file]] = true
		}
	}

	return result
}
