---
name: remb-scan
version: 1.0.0
description: Scan codebases, set up webhooks for automatic scanning, and interpret scan results. Use when user says "scan the codebase", "analyze the project", "refresh context", or "set up webhooks".
---

# Remb Scanning

You are helping the user scan their codebase with Remb — extracting features, dependencies, and architectural patterns automatically.

## Trigger a Scan

```bash
# Scan current project (uses .remb.yml)
remb scan

# Scan a specific project
remb scan -p my-project

# Scan from a GitHub repo directly
remb scan --repo owner/repo
```

A scan:
1. Reads all source files from GitHub (or local push)
2. Groups files into features using AI smart-grouping
3. Extracts context entries, dependencies, and patterns
4. Stores everything in Remb linked to features

## Check Scan Status

```bash
remb scan status
remb scan status -p my-project
```

Scan states: `queued` → `scanning` → `processing` → `completed` (or `failed`).

## Push Local Files

If the project isn't on GitHub, push files directly:

```bash
remb push
```

This sends local source files to Remb for scanning. Respects `.gitignore` and `.rembignore`.

## Webhook Setup (Scan-on-Push)

Set up automatic scanning on every git push:

1. Go to your GitHub repo → Settings → Webhooks
2. Add webhook:
   - **URL**: `https://www.useremb.com/api/webhooks/github`
   - **Content type**: `application/json`
   - **Events**: Just the `push` event
3. Link your repo in Remb:
   ```bash
   remb link --repo owner/repo
   ```

Now every push triggers a scan automatically.

## Ignore Patterns

Create `.rembignore` in your project root (same syntax as `.gitignore`):

```
node_modules/
dist/
*.test.ts
__snapshots__/
```

Or configure in Remb dashboard under Project Settings → Ignore Patterns.

## Interpreting Results

After a scan completes, check what was found:

```bash
# Full context bundle (includes scan results)
remb context bundle

# Check specific features discovered
remb get -f "feature-name"
```

The scan extracts:
- **Features** — logical groupings of related files
- **Context entries** — what each feature does, key decisions, patterns used
- **Dependencies** — inter-feature and external package dependencies
- **File mappings** — which files belong to which features

## Best Practices

1. **Scan after major refactors** — keeps context fresh
2. **Set up webhooks early** — automated scanning prevents stale context
3. **Review scan output** — AI grouping isn't perfect, use `remb save` to correct or add detail
4. **Use `.rembignore`** — exclude generated files, tests, and noise to improve quality
