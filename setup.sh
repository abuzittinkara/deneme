#!/bin/bash
set -euo pipefail

# Install npm dependencies without running package scripts
npm ci --ignore-scripts