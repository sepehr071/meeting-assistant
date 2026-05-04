# Install — Ubuntu, no SSL/domain, pm2

## 1. One-time prereqs

Run the bundled installer (idempotent):

```bash
chmod +x bootstrap.sh
./bootstrap.sh
```

Installs: apt base packages, ffmpeg, `uv`, node 22, pnpm, pm2.

After install, reopen shell or run `source ~/.local/bin/env` so `uv` is on PATH.

## 2. Clone + env

```bash
git clone <your repo> meeting-assistant
cd meeting-assistant

cp backend/.env.example backend/.env
nano backend/.env        # fill ELEVENLABS_API_KEY, OPENROUTER_API_KEY, SESSION_SECRET (>=32 chars)

cp frontend/.env.example frontend/.env.local
# leave NEXT_PUBLIC_API_BASE / PORT as-is — setup.sh overwrites them
```

`SESSION_SECRET` random 32+ chars: `openssl rand -hex 32`.

The script overwrites `PORT`, `HOST`, `ALLOWED_ORIGIN` in `backend/.env` and `PORT`, `NEXT_PUBLIC_API_BASE` in `frontend/.env.local` every run. API keys + secrets are left alone.

## 3. Run

```bash
chmod +x setup.sh
./setup.sh
```

Custom desired ports (script falls back to a random free port in 20000-29999 if busy):

```bash
BACK_PORT=8001 FRONT_PORT=3001 ./setup.sh
```

Override IP detection (e.g. when `hostname -I` picks the wrong interface):

```bash
SERVER_IP=192.168.1.50 ./setup.sh
```

## 4. Auto-start on boot (one-time)

```bash
pm2 startup systemd -u $USER --hp $HOME    # run the printed sudo command
pm2 save
```

## 5. Firewall (if ufw enabled)

Open the actual ports the script printed — defaults below:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
```

## Common ops

```bash
pm2 status
pm2 logs                       # both
pm2 logs ma-backend --lines 50
pm2 restart all                # after .env edits (no port change)
./setup.sh                     # re-run for any port / IP change (rebuilds frontend)
pm2 delete ma-backend ma-frontend
```

## Notes

- Mic recording + tab-audio capture need a secure context (HTTPS or `localhost`). On a LAN IP over plain HTTP the browser blocks them. **File upload still works.**
- `NEXT_PUBLIC_API_BASE` is baked into the frontend at build time → script always rebuilds.
- SQLite DB lives at `backend/meeting.db`, audio at `backend/storage/audio/`. Back these up.
