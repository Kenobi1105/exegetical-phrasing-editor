#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Exegetical Phrasing Editor — GitHub Pages Deployment Script
#  Run this once to create the repository and deploy the app.
#  After that, just re-run to push updates.
# ═══════════════════════════════════════════════════════════

set -e  # Exit on any error

GITHUB_USER="Kenobi1105"
REPO_NAME="exegetical-phrasing-editor"
REPO_URL="https://github.com/$GITHUB_USER/$REPO_NAME"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Exegetical Phrasing Editor — Deploy to GitHub  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check for git ──────────────────────────────
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed."
    echo "   Download it from: https://git-scm.com/download/win"
    exit 1
fi
echo "✅ Git found."

# ── Step 2: Ask for GitHub token ──────────────────────
echo ""
echo "📋 You need a GitHub Personal Access Token."
echo "   Follow these steps:"
echo ""
echo "   1. Go to: https://github.com/settings/tokens/new"
echo "   2. Name it anything (e.g. 'Exegetical Editor')"
echo "   3. Set expiration to 'No expiration' (or 90 days)"
echo "   4. Under 'Select scopes', check only: ✅ repo"
echo "   5. Click 'Generate token'"
echo "   6. Copy the token (starts with 'ghp_')"
echo ""
read -s -p "Paste your GitHub token here (it won't show): " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ No token entered. Exiting."
    exit 1
fi

# Validate token looks right
if [[ ! "$GITHUB_TOKEN" == ghp_* ]] && [[ ! "$GITHUB_TOKEN" == github_pat_* ]]; then
    echo "⚠  Token doesn't look right (should start with 'ghp_')"
    read -p "   Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then exit 1; fi
fi

echo "✅ Token received."

# ── Step 3: Create or verify repo on GitHub ───────────
echo ""
echo "🔍 Checking if repository exists..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$GITHUB_USER/$REPO_NAME")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Repository already exists."
else
    echo "📁 Creating repository '$REPO_NAME'..."
    RESULT=$(curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Content-Type: application/json" \
        "https://api.github.com/user/repos" \
        -d "{\"name\":\"$REPO_NAME\",\"description\":\"Exegetical Phrasing Editor — Biblical scholarship tool\",\"public\":true,\"auto_init\":false}")
    
    if echo "$RESULT" | grep -q '"full_name"'; then
        echo "✅ Repository created: $REPO_URL"
    else
        echo "❌ Failed to create repository."
        echo "   Response: $RESULT"
        exit 1
    fi
fi

# ── Step 4: Init git if needed ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".git" ]; then
    echo ""
    echo "🔧 Initialising git repository..."
    git init
    git branch -M main
    git remote add origin "https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
    echo "✅ Git initialised."
else
    # Update remote URL with fresh token
    git remote set-url origin "https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
    echo "✅ Git already initialised."
fi

# ── Step 5: Stage and commit ──────────────────────────
echo ""
echo "📦 Staging files..."
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
    echo "ℹ  No changes to commit — everything is already up to date."
else
    COMMIT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
    git commit -m "$COMMIT_MSG"
    echo "✅ Committed: $COMMIT_MSG"
fi

# ── Step 6: Push ──────────────────────────────────────
echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Push successful!"

# ── Step 7: Enable GitHub Pages (first deploy only) ───
echo ""
echo "🌐 Enabling GitHub Pages..."
PAGES_RESULT=$(curl -s -X PUT \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/pages" \
    -d '{"source":{"branch":"main","path":"/"}}' 2>/dev/null)

if echo "$PAGES_RESULT" | grep -q '"url"'; then
    echo "✅ GitHub Pages enabled!"
elif echo "$PAGES_RESULT" | grep -q "already enabled"; then
    echo "✅ GitHub Pages already enabled."
else
    # Try PATCH if PUT fails (already created)
    curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Content-Type: application/json" \
        "https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/pages" \
        -d '{"source":{"branch":"main","path":"/"}}' > /dev/null 2>&1 || true
    echo "✅ GitHub Pages configured."
fi

# ── Done ───────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║                   🎉  DONE!                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Your app will be live in 1–2 minutes at:"
echo ""
echo "  👉 https://$GITHUB_USER.github.io/$REPO_NAME"
echo ""
echo "  To update the app in future, just re-run:"
echo "  ./deploy.sh"
echo ""
