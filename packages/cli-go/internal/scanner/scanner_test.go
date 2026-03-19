package scanner

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanDirectory_Basic(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "main.ts"), []byte("const x = 1;"), 0o644)
	os.WriteFile(filepath.Join(tmp, "utils.ts"), []byte("export function y() {}"), 0o644)

	files, results, err := ScanDirectory(ScanOptions{
		Path:  tmp,
		Depth: 3,
	})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
	if len(results) == 0 {
		t.Error("expected at least one result group")
	}
}

func TestScanDirectory_IgnoresNodeModules(t *testing.T) {
	tmp := t.TempDir()
	nm := filepath.Join(tmp, "node_modules", "pkg")
	os.MkdirAll(nm, 0o755)
	os.WriteFile(filepath.Join(nm, "index.ts"), []byte("// ignored"), 0o644)
	os.WriteFile(filepath.Join(tmp, "app.ts"), []byte("// kept"), 0o644)

	files, _, err := ScanDirectory(ScanOptions{Path: tmp, Depth: 5})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (node_modules excluded), got %d", len(files))
	}
}

func TestScanDirectory_CustomIgnore(t *testing.T) {
	tmp := t.TempDir()
	custom := filepath.Join(tmp, "generated")
	os.MkdirAll(custom, 0o755)
	os.WriteFile(filepath.Join(custom, "auto.ts"), []byte("// auto"), 0o644)
	os.WriteFile(filepath.Join(tmp, "real.ts"), []byte("// real"), 0o644)

	files, _, err := ScanDirectory(ScanOptions{
		Path:   tmp,
		Depth:  5,
		Ignore: []string{"generated"},
	})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (generated excluded), got %d", len(files))
	}
}

func TestScanDirectory_DepthLimit(t *testing.T) {
	tmp := t.TempDir()
	deep := filepath.Join(tmp, "a", "b", "c", "d")
	os.MkdirAll(deep, 0o755)
	os.WriteFile(filepath.Join(deep, "deep.ts"), []byte("// deep"), 0o644)
	os.WriteFile(filepath.Join(tmp, "shallow.ts"), []byte("// shallow"), 0o644)

	files, _, err := ScanDirectory(ScanOptions{Path: tmp, Depth: 1})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (depth-limited), got %d", len(files))
	}
}

func TestScanDirectory_MultipleLanguages(t *testing.T) {
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, "main.go"), []byte("package main"), 0o644)
	os.WriteFile(filepath.Join(tmp, "app.py"), []byte("print('hello')"), 0o644)
	os.WriteFile(filepath.Join(tmp, "index.ts"), []byte("console.log()"), 0o644)
	os.WriteFile(filepath.Join(tmp, "readme.md"), []byte("# Docs"), 0o644)

	files, results, err := ScanDirectory(ScanOptions{Path: tmp, Depth: 3})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 3 {
		t.Errorf("expected 3 source files (md excluded), got %d", len(files))
	}

	if len(results) == 0 {
		t.Fatal("expected results")
	}
	r := results[0]
	foundGo, foundPy, foundTS := false, false, false
	for _, tag := range r.Tags {
		switch tag {
		case "go":
			foundGo = true
		case "python":
			foundPy = true
		case "typescript":
			foundTS = true
		}
	}
	if !foundGo || !foundPy || !foundTS {
		t.Errorf("expected go, python, typescript tags; got %v", r.Tags)
	}
}

func TestScanDirectory_EmptyDir(t *testing.T) {
	tmp := t.TempDir()
	files, results, err := ScanDirectory(ScanOptions{Path: tmp, Depth: 3})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 files, got %d", len(files))
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

func TestScanDirectory_ResultStructure(t *testing.T) {
	tmp := t.TempDir()
	sub := filepath.Join(tmp, "src")
	os.MkdirAll(sub, 0o755)
	os.WriteFile(filepath.Join(sub, "handler.ts"), []byte("export function handle() {}"), 0o644)

	_, results, err := ScanDirectory(ScanOptions{Path: tmp, Depth: 3})
	if err != nil {
		t.Fatalf("ScanDirectory: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	r := results[0]
	if r.FeatureName != "src" {
		t.Errorf("expected feature name 'src', got %s", r.FeatureName)
	}
	if r.EntryType != "scan" {
		t.Errorf("expected entry type 'scan', got %s", r.EntryType)
	}
	hasAutoScan := false
	for _, tag := range r.Tags {
		if tag == "auto-scan" {
			hasAutoScan = true
		}
	}
	if !hasAutoScan {
		t.Error("expected 'auto-scan' tag in results")
	}
}
