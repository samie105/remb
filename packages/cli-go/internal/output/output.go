package output

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
)

// ANSI color codes
const (
	reset  = "\033[0m"
	red    = "\033[31m"
	green  = "\033[32m"
	yellow = "\033[33m"
	cyan   = "\033[36m"
	bold   = "\033[1m"
	dim    = "\033[2m"
)

func Success(msg string) {
	fmt.Fprintf(os.Stderr, "%s✔%s %s\n", green, reset, msg)
}

func Error(msg string) {
	fmt.Fprintf(os.Stderr, "%s✖%s %s\n", red, reset, msg)
}

func Info(msg string) {
	fmt.Fprintf(os.Stderr, "%sℹ%s %s\n", cyan, reset, msg)
}

func Warn(msg string) {
	fmt.Fprintf(os.Stderr, "%s⚠%s %s\n", yellow, reset, msg)
}

func KeyValue(key, value string) {
	fmt.Fprintf(os.Stderr, "  %s%s%s %s\n", dim, key+":", reset, value)
}

func Bold(s string) string {
	return bold + s + reset
}

func Dim(s string) string {
	return dim + s + reset
}

func Cyan(s string) string {
	return cyan + s + reset
}

// Entry represents a context entry for formatting.
type Entry struct {
	ID        string `json:"id"`
	Feature   string `json:"feature"`
	Content   string `json:"content"`
	EntryType string `json:"entry_type"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
}

// FormatEntries formats entries in the given format.
func FormatEntries(entries []Entry, format string) string {
	switch format {
	case "json":
		b, _ := json.MarshalIndent(entries, "", "  ")
		return string(b)
	case "markdown":
		return formatMarkdown(entries)
	default:
		return formatTable(entries)
	}
}

func formatTable(entries []Entry) string {
	var buf strings.Builder
	w := tabwriter.NewWriter(&buf, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tFEATURE\tTYPE\tDATE\tCONTENT")
	fmt.Fprintln(w, "──\t───────\t────\t────\t───────")
	for _, e := range entries {
		content := e.Content
		if len(content) > 60 {
			content = content[:57] + "..."
		}
		date := e.CreatedAt
		if len(date) >= 10 {
			date = date[:10]
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
			e.ID[:8], e.Feature, e.EntryType, date, content)
	}
	w.Flush()
	return buf.String()
}

func formatMarkdown(entries []Entry) string {
	var buf strings.Builder
	for i, e := range entries {
		if i > 0 {
			buf.WriteString("\n---\n\n")
		}
		fmt.Fprintf(&buf, "## %s [%s]\n", e.Feature, e.EntryType)
		date := e.CreatedAt
		if len(date) >= 10 {
			date = date[:10]
		}
		fmt.Fprintf(&buf, "_%s — %s_\n\n", e.Source, date)
		buf.WriteString(e.Content)
		buf.WriteString("\n")
	}
	return buf.String()
}
