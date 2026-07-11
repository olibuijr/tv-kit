#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

install -d "$unit_dir"
install -m 0644 "$root/ops/systemd/user/tvserverd.service" "$unit_dir/tvserverd.service"
install -m 0644 "$root/ops/systemd/user/tvserverd-radioscraper.service" "$unit_dir/tvserverd-radioscraper.service"
install -m 0644 "$root/ops/systemd/user/tvserverd-radioscraper.timer" "$unit_dir/tvserverd-radioscraper.timer"
chmod 0600 "$root/.env"

cd "$root"
bun install --frozen-lockfile
bun run build

systemctl --user daemon-reload
systemctl --user enable tvserverd.service tvserverd-radioscraper.timer
systemctl --user restart tvserverd.service

set -a
source "$root/.env"
set +a
for _ in {1..50}; do
  curl --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/health" >/dev/null && break
  sleep .2
done
curl --silent --fail --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null

systemctl --user start tvserverd-radioscraper.service
systemctl --user start tvserverd-radioscraper.timer
