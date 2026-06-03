# GitHub Workflows

Two GitHub Actions workflows automate dependency management and pull request documentation.

## Dependency Update Check

**File:** `.github/workflows/dependency-update.yml`

Checks vendor dependencies for newer versions and opens a PR when updates are available.

### How it works

1. Reads `dependencies.json` (the single source of truth for vendor library versions)
2. Queries the npm registry for each dependency
3. Finds the latest version within the same major range (e.g., 5.24.0 → 5.25.0, but not 6.0.0)
4. If updates exist: bumps versions in `dependencies.json`, deletes old vendor files, commits to a new branch, and opens a PR
5. If everything is current: logs "All dependencies are up to date" and exits

### Schedule

- **Automatic:** Every Monday at 9:00 AM UTC
- **Manual:** Actions tab → "Dependency Update Check" → Run workflow

### What the PR contains

- Updated `dependencies.json` with new version numbers
- Deleted vendor files (so `serve.py` re-downloads the new versions on next start)
- A table showing each package, old version, and new version

### Adding a new dependency

Add an entry to `dependencies.json`:

```json
{
  "name": "package-name",
  "version": "1.0.0",
  "files": {
    "local-filename.js": "https://unpkg.com/package-name@{{version}}/dist/file.js"
  },
  "registry": "npm"
}
```

The `{{version}}` placeholder is replaced by `serve.py` when downloading and by the workflow when checking for updates.

### Why same-major only

Major version bumps (e.g., MapLibre 5.x → 6.x) often have breaking API changes that require manual code updates. The workflow only suggests minor/patch bumps that should be safe to merge without code changes.

---

## PR Summary

**File:** `.github/workflows/pr-summary.yml`

Automatically posts a summary comment on every pull request, including an AI-generated description of the changes.

### How it works

1. Triggered when a PR is opened or updated (`pull_request_target`)
2. Fetches the PR metadata, commit messages, and file diffs
3. Sends the diff context to GitHub Models API (`openai/gpt-4o-mini`) to generate a 3-5 sentence natural-language description
4. Posts a comment on the PR with:
   - PR title, author, and draft status
   - Total additions/deletions
   - AI-generated description of functional changes
   - Per-file breakdown showing new/modified functions

### Configuration

Requires a `MODELS_TOKEN` secret in the repository (or organization) settings. This token authenticates with the [GitHub Models API](https://github.com/marketplace/models).

### What it skips

- `.github/`, `.circleci/`, `.gitlab/` directories are excluded from the AI summary context and file list
- Merge commits are filtered from the commit message list
- Diffs are truncated to keep the AI prompt within token limits (1500 chars per file, max 12 files)

### Why `pull_request_target`

This trigger runs the workflow from the base branch (main), not the PR branch. This ensures the workflow always has access to repository secrets (`MODELS_TOKEN`), even for PRs from forks or new branches.
