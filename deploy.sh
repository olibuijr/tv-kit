#!/usr/bin/env bash
set -euo pipefail

canonical_host="titan"
project="/home/olafurbui/Projects/tv-kit"

if [[ "$(uname -n)" != "$canonical_host" ]]; then
  printf -v quoted ' %q' "$@"
  exec ssh "$canonical_host" "cd $(printf %q "$project") && ./deploy.sh${quoted}"
fi

cd "$project"
message="${*:-Deploy TV Kit $(date -u +'%Y-%m-%d %H:%M:%S UTC')}"

echo "[1/6] Install, test, type-check, and build on Titan"
bun install --frozen-lockfile
bun --env-file=/dev/null test
bun run typecheck
bun run build

echo "[2/6] Commit verified source on Titan"
if [[ ! -d .git ]]; then
  git init -b main
  git config user.name "${GIT_AUTHOR_NAME:-Ólafur Búi}"
  git config user.email "${GIT_AUTHOR_EMAIL:-olafurbui@users.noreply.github.com}"
fi
git add -A
if ! git diff --cached --quiet; then
  git commit -m "$message"
fi
commit="$(git rev-parse --short HEAD)"

echo "[3/6] Stage built clients"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/dashboard" "$stage/remote"
cp -a apps/dashboard/dist/. "$stage/dashboard/"
cp -a apps/remote/dist/. "$stage/remote/"

echo "[4/6] Deploy static artifacts and user services to TV"
tar -C "$stage" -cf - dashboard remote | ssh tv '
  set -euo pipefail
  root="$HOME/.local/share/tv-kit"
  incoming="$(mktemp -d "$HOME/.local/share/tv-kit-incoming.XXXXXX")"
  trap '\''rm -rf "$incoming"'\'' EXIT
  tar -C "$incoming" -xf -
  install -d "$root"
  rm -rf "$root/dashboard.previous" "$root/remote.previous"
  [[ ! -d "$root/dashboard" ]] || mv "$root/dashboard" "$root/dashboard.previous"
  [[ ! -d "$root/remote" ]] || mv "$root/remote" "$root/remote.previous"
  mv "$incoming/dashboard" "$root/dashboard"
  mv "$incoming/remote" "$root/remote"
'
ssh tv 'install -d "$HOME/.config/systemd/user"'
tar -C ops/systemd/user -cf - tv-dashboard.service tv-remote.service tv-kiosk.service | ssh tv 'tar -C "$HOME/.config/systemd/user" -xf -'

echo "[5/6] Start clients and kiosk on TV"
ssh tv '
  set -euo pipefail
  systemctl --user stop tv-kiosk.service 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable --now tv-dashboard.service tv-remote.service tv-kiosk.service
  for port in 3111 3112; do
    for _ in $(seq 1 40); do
      curl -fsS --max-time 1 "http://127.0.0.1:${port}/" >/dev/null && break
      sleep .25
    done
    curl -fsS --max-time 2 "http://127.0.0.1:${port}/" >/dev/null
  done
'

echo "[6/6] Verify deployment from Titan"
curl -fsS --max-time 3 http://192.168.1.12:3111/ >/dev/null
curl -fsS --max-time 3 http://192.168.1.12:3112/ >/dev/null
curl -fsS --max-time 3 http://127.0.0.1:3110/health >/dev/null
printf 'Deployed commit %s\nDashboard: http://192.168.1.12:3111\nRemote:    http://192.168.1.12:3112\n' "$commit"
