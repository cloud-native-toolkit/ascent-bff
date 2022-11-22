#!/bin/bash

set -e

# The following files and folders are copied by default in the CIO CI/CD Pipeline:
# package.json, package-lock.json, node_modules
# These files are the other resources required for the app to run
# FILES_TO_COPY=("next.config.mjs")
FOLDERS_TO_COPY=("public" "dist" "fonts" "express-app" "config")

# Prune the node_dependencies
npm prune --omit=dev

# Clean up existing build directory and recreate
if [ -d build ]; then
	rm -rf build
fi
mkdir -p build

# for file in "${FILES_TO_COPY[@]}"; do
#   rsync -R "${file}" ./build/
# done

for folder in "${FOLDERS_TO_COPY[@]}"; do
  rsync -a "./${folder}" ./build/
done
