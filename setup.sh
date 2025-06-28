#!/bin/bash
set -euo pipefail

# Install backend and frontend npm dependencies
npm ci
npm --prefix frontend ci
