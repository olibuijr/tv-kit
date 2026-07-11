# Deploying TV Kit

Work in `~/Projects/tv-kit` on either **midget** or **Titan**. Syncthing mirrors source files between those hosts; Git metadata is intentionally not synced.

Run:

```bash
./deploy.sh "Describe the deployment"
```

The script:

1. commits and pushes source to GitHub (on Titan when the caller has no local `.git`),
2. connects to Titan and runs `git pull --ff-only`,
3. installs dependencies, tests, type-checks, and builds on Titan,
4. stops and removes any legacy Titan `tvserverd` service,
5. updates the TV computer checkout from GitHub,
6. transfers the protected environment and a consistent SQLite runtime snapshot,
7. installs and starts `tvserverd`, dashboard, remote, and kiosk services on the TV computer,
8. tunes the shared state to the live RÚV channel and verifies all services.

Runtime endpoints are TV-local:

- API/WebSocket: `http://192.168.1.12:3110`
- Dashboard: `http://192.168.1.12:3111`
- Remote: `http://192.168.1.12:3112`

Titan is the build/deployment host only. It must not run TV Kit services.
