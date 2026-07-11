#!/usr/bin/env bash
# Build on Titan; deploy runtime artifacts only to /opt/tv-kit on TV.
set -euo pipefail
project="$HOME/Projects/tv-kit"
tv_host="olafurbui@192.168.1.12"
message="${*:-Deploy TV Kit $(date -u +'%Y-%m-%dT%H:%M:%SZ')}"

if [[ "$(uname -n)" != titan ]]; then
	printf -v q '%q' "$message"
	exec ssh titan "cd ~/Projects/tv-kit && ./deploy.sh $q"
fi
cd "$project"

git add -A
git diff --cached --quiet || git commit -m "$message"
git push origin HEAD:main
git pull --ff-only origin main

bun install --frozen-lockfile
bun --env-file=/dev/null test
bun run typecheck
bun run build
rm -rf .deploy-stage
mkdir -p .deploy-stage/bin .deploy-stage/dashboard .deploy-stage/remote
bun build --compile apps/server/src/index.ts --outfile .deploy-stage/bin/tvserverd
cp -a apps/dashboard/dist/. .deploy-stage/dashboard/
cp -a apps/remote/dist/. .deploy-stage/remote/
cp ops/systemd/system/tvserverd.service .deploy-stage/

# The TV deliberately has no repository, Bun, Node, or build tooling. It receives only
# the compiled daemon and static assets. Root access is intentionally required for /opt.
ssh "$tv_host" 'sudo -n true' || {
	echo 'TV prerequisite: grant olafurbui passwordless sudo for /usr/bin/install, /usr/bin/systemctl, /usr/bin/tee, and /bin/mkdir, then rerun deploy.sh.' >&2
	exit 1
}

tar -C .deploy-stage -I 'zstd -1 -T0' -cf - . | ssh "$tv_host" '
  set -euo pipefail
  sudo systemctl stop tvserverd.service 2>/dev/null || true
  incoming=$(mktemp -d)
  trap "rm -rf $incoming" EXIT
  zstd -d -q | tar -C "$incoming" -xf -
  sudo install -d -o root -g root -m 0755 /opt/tv-kit /opt/tv-kit/bin /opt/tv-kit/dashboard /opt/tv-kit/remote /etc/tv-kit
  sudo rm -rf /opt/tv-kit/bin /opt/tv-kit/dashboard /opt/tv-kit/remote
  sudo mv "$incoming/bin" "$incoming/dashboard" "$incoming/remote" /opt/tv-kit/
  sudo chown -R root:root /opt/tv-kit
  sudo chmod 0755 /opt/tv-kit/bin/tvserverd
  sudo install -o root -g root -m 0644 "$incoming/tvserverd.service" /etc/systemd/system/tvserverd.service
'
# Deployment values and DB are runtime state, never Git or frontend artifacts.
ssh "$tv_host" 'sudo install -d -o olafurbui -g olafurbui -m 0700 /var/lib/tv-kit'
scp -q .env "$tv_host":/tmp/tv-kit.env
ssh "$tv_host" 'sudo install -o root -g olafurbui -m 0640 /tmp/tv-kit.env /etc/tv-kit/tv-kit.env; rm -f /tmp/tv-kit.env'
db_path=$(awk -F= '$1=="DB_PATH" {print substr($0,index($0,"=")+1)}' .env | tail -1)
db_path=${db_path:-data/tv-kit.sqlite}
[[ $db_path = /* ]] || db_path="$project/$db_path"
[[ ! -f $db_path ]] || {
	scp -q "$db_path" "$tv_host":/tmp/tv-kit.sqlite
	ssh "$tv_host" 'sudo install -o olafurbui -g olafurbui -m 0600 /tmp/tv-kit.sqlite /var/lib/tv-kit/tv-kit.sqlite; rm -f /tmp/tv-kit.sqlite'
}
ssh "$tv_host" 'sudo systemctl daemon-reload; sudo systemctl enable --now tvserverd.service; sudo systemctl is-active --quiet tvserverd.service; curl -fsS --max-time 5 http://127.0.0.1:3110/health >/dev/null; sudo journalctl -u tvserverd.service -n 25 --no-pager'
