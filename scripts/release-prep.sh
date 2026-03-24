#!/bin/bash

set -e

# Get the current version from package.json
current_version=$(node -p "require('./package.json').version")

# Prompt the user for a new version
echo "Current version: $current_version"
read -p "Enter new version: " new_version

if [ -z "$new_version" ]; then
  echo "Error: No version provided"
  exit 1
fi

# Update the version in package.json
pkg=$(node -e "const pkg = require('./package.json'); pkg.version = '$new_version'; process.stdout.write(JSON.stringify(pkg, null, 2));")
echo "$pkg" > package.json

# Update package-lock.json
npm ci

echo "✅ Version updated to $new_version"
