#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
NODE=${CROSS_TEST_NODE:-$(command -v node)}
NODE=$("$NODE" -p 'process.execPath')
"$NODE" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || major === 22 && minor < 19) { console.error("Node >=22.19.0 is required"); process.exit(1); }'
if [ "${1:-}" = node ]; then
  shift
  exec /usr/bin/env -i PATH="$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin" "$NODE" --import ./test/support/clean-env.mjs "$@"
fi
# Resolve npm independently: Homebrew, nvm and Actions need not share a layout.
NPM=$("$NODE" -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$(command -v npm)")
exec /usr/bin/env -i PATH="$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin" "$NODE" --import ./test/support/clean-env.mjs "$NPM" "$@"
