#!/usr/bin/env bash
set -euo pipefail

# Run from any working directory. A private Node installation is optional.
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for runtime_bin in \
  "$project_dir/.runtime/node-v24.21.0-linux-x64/bin" \
  "$project_dir/../.runtime/node-v24.21.0-linux-x64/bin"; do
  if [[ -x "$runtime_bin/node" ]]; then
    export PATH="$runtime_bin:$PATH"
    break
  fi
done
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Install Node.js 24 LTS, then run this launcher again." >&2
  exit 1
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo "Daily5 requires Node.js 24 LTS." >&2
  exit 1
fi
cd -- "$project_dir"
exec npm run dev
