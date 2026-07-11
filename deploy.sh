#!/usr/bin/env bash
set -euo pipefail

project="$HOME/Projects/tv-kit"
repo_url="${TV_KIT_REPO_URL:-https://github.com/olibuijr/tv-kit.git}"
message="${*:-Deploy TV Kit $(date -u +'%Y-%m-%d %H:%M:%S UTC')}"
host="$(uname -n)"

# ~/Projects is Syncthing-mirrored between midget and Titan, but .git is deliberately
# local. Titan performs the authoritative commit when the caller has no local clone.
if [[ "$host" != titan ]]; then
  if [[ -d "$project/.git" ]]; then
    cd "$project"
    git add -A
    git diff --cached --quiet || git commit -m "$message"
    git push origin HEAD:main
  fi
  printf -v quoted_message '%q' "$message"
  exec ssh titan "cd ~/Projects/tv-kit && ./deploy.sh $quoted_message"
fi

cd "$project"
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$repo_url"
git add -A
git diff --cached --quiet || git commit -m "$message"
git push -u origin HEAD:main
git pull --ff-only origin main
commit="$(git rev-parse --short HEAD)"

echo '[1/5] Test and build on Titan'
bun install --frozen-lockfile
bun --env-file=/dev/null test
bun run typecheck
bun run build

echo '[2/5] Stop legacy Titan runtime and prepare TV checkout'
systemctl --user disable --now tvserverd.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/tvserverd.service"
systemctl --user daemon-reload
ssh tv "set -e; if [[ -d ~/Projects/tv-kit/.git ]]; then cd ~/Projects/tv-kit && git pull --ff-only origin main; else mkdir -p ~/Projects && git clone '$repo_url' ~/Projects/tv-kit; fi"

echo '[3/5] Transfer protected runtime state to TV'
ssh tv 'systemctl --user stop tv-kiosk.service tvserverd.service 2>/dev/null || true'
scp -q .env tv:Projects/tv-kit/.env
# SQLite is runtime state, not repository source. Copy a consistent stopped snapshot.
db_path="$(awk -F= '$1=="DB_PATH"{print substr($0,index($0,"=")+1)}' .env | tail -1)"
db_path="${db_path:-data/tv-kit.sqlite}"
[[ "$db_path" = /* ]] || db_path="$project/$db_path"
if [[ -f "$db_path" ]]; then
  ssh tv 'mkdir -p ~/Projects/tv-kit/data'
  scp -q "$db_path" tv:Projects/tv-kit/data/tv-kit.sqlite
fi

echo '[4/5] Install clients and services on TV'
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/dashboard" "$stage/remote"
cp -a apps/dashboard/dist/. "$stage/dashboard/"
cp -a apps/remote/dist/. "$stage/remote/"
tar -C "$stage" -cf - dashboard remote | ssh tv 'set -e; root="$HOME/.local/share/tv-kit"; mkdir -p "$root"; rm -rf "$root/dashboard" "$root/remote"; tar -C "$root" -xf -'
tar -C ops/systemd/user -cf - tvserverd.service tv-dashboard.service tv-remote.service tv-kiosk.service | ssh tv 'mkdir -p ~/.config/systemd/user; tar -C ~/.config/systemd/user -xf -'

ssh tv 'set -e; systemctl --user daemon-reload; systemctl --user enable --now tvserverd.service tv-dashboard.service tv-remote.service; for p in 3110 3111 3112; do for _ in $(seq 1 80); do curl -fsS --max-time 1 http://127.0.0.1:$p/health >/dev/null 2>&1 || curl -fsS --max-time 1 http://127.0.0.1:$p/ >/dev/null 2>&1; [[ $? = 0 ]] && break || true; sleep .25; done; done; flatpak kill com.google.Chrome 2>/dev/null || true; systemctl --user restart tv-kiosk.service'

echo '[5/5] Tune RÚV and verify on TV'
ssh tv "cd ~/Projects/tv-kit && bun -e 'const ws=new WebSocket(\"ws://127.0.0.1:3110/ws?client=pi\",{headers:{Origin:\"http://127.0.0.1:3111\"}});ws.onopen=()=>{ws.send(JSON.stringify({action:\"ruv-channel\",value:\"ruv\"}));setTimeout(()=>ws.close(),500)}'"
sleep 2
ssh tv 'curl -fsS --max-time 3 http://127.0.0.1:3110/health >/dev/null; systemctl --user is-active --quiet tvserverd.service tv-dashboard.service tv-remote.service tv-kiosk.service'
printf 'Deployed %s on TV: dashboard http://192.168.1.12:3111, remote http://192.168.1.12:3112\n' "$commit"
