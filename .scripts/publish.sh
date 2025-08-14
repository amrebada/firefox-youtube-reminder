#!/bin/bash

# get the current version from the manifest.json
VERSION=$(grep -oE '"version": "[^"]+' manifest.json | cut -d'"' -f4)
echo "Current version: $VERSION"

# increment the version (handle major.minor format)
IFS='.' read -ra VERSION_PARTS <<< "$VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]:-0}
NEW_MINOR=$((MINOR + 1))
NEW_VERSION="$MAJOR.$NEW_MINOR"
echo "New version: $NEW_VERSION"

# update the version in the manifest.json
sed -i '' "s/\"version\": \"$VERSION\"/\"version\": \"$NEW_VERSION\"/" manifest.json

# build the extension
web-ext build --overwrite-dest

# get the path to the built extension
BUILD_PATH=$(find . -name "youtube-video-reminders-*.zip")
echo "Built extension: $BUILD_PATH"

# Check if environment variables are set
if [ -z "$AMO_API_KEY" ] || [ -z "$AMO_API_SECRET" ]; then
    echo "Error: AMO_API_KEY and AMO_API_SECRET environment variables must be set"
    echo "Please set them before running this script:"
    echo "export AMO_API_KEY=\"your-api-key\""
    echo "export AMO_API_SECRET=\"your-api-secret\""
    exit 1
fi

# Publish the extension to the Mozilla Add-ons store
web-ext sign --api-key="$AMO_API_KEY" --api-secret="$AMO_API_SECRET" --channel=listed