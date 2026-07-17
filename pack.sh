#!/bin/bash
echo "Packaging Praescius Chrome Extension..."

# Remove old zip if it exists
rm -f praescius-release.zip

# Zip everything EXCEPT the web/ folder, .git, and other unnecessary files
zip -r praescius-release.zip . \
  -x "web/*" \
  -x ".git/*" \
  -x ".gitignore" \
  -x "*.zip" \
  -x "*.sh" \
  -x "docs/*" \
  -x "AGENTS.md" \
  -x "CLAUDE.md"

echo "Done! Upload 'praescius-release.zip' to the Chrome Web Store."
