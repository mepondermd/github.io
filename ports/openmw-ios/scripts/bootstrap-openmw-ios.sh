#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bootstrap-openmw-ios.sh <destination> [ref]

Fetch OpenMW, checkout the requested ref (default: master), and apply the iOS
bootstrap patch from this port kit. GitLab is tried first, then the GitHub mirror.
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -lt 1 ]]; then
  usage
  exit $([[ $# -lt 1 ]] && echo 2 || echo 0)
fi

DEST=$1
REF=${2:-master}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PORT_ROOT=$(cd -- "${SCRIPT_DIR}/.." && pwd)
PATCH_FILE="${PORT_ROOT}/patches/openmw-ios-bootstrap.patch"

if [[ -e "${DEST}" && ! -d "${DEST}/.git" ]]; then
  echo "Destination exists but is not a git checkout: ${DEST}" >&2
  exit 1
fi

if [[ ! -d "${DEST}/.git" ]]; then
  if ! git clone https://gitlab.com/OpenMW/openmw.git "${DEST}"; then
    git clone https://github.com/OpenMW/openmw.git "${DEST}"
  fi
fi

git -C "${DEST}" fetch --tags --prune origin
git -C "${DEST}" checkout "${REF}"

if git -C "${DEST}" apply --check "${PATCH_FILE}"; then
  git -C "${DEST}" apply "${PATCH_FILE}"
else
  echo "Patch does not apply cleanly; leaving checkout untouched for manual rebase." >&2
  exit 1
fi

cat <<DONE
Prepared OpenMW iOS source tree:
  ${DEST}

Next: set TEAM_ID, BUNDLE_ID, OPENMW_SRC, and OPENMW_DEPS_PREFIX, then run:
  ${PORT_ROOT}/scripts/build-ipa.sh
DONE
