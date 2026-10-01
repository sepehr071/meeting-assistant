// pm2 process definitions (template). Adjust APP_DIR and ports for your host.
//
//   pm2 start deploy/ecosystem.config.js        # both apps
//   pm2 restart meeting-backend meeting-frontend && pm2 save
//
// If your host cannot reach ElevenLabs/OpenRouter directly, uncomment the
// HTTPS_PROXY line and point it at an egress proxy you control.
// The frontend runs via start-fe.sh so nvm's node is on PATH at runtime and boot.
const APP_DIR = process.env.APP_DIR || "/opt/meeting-assistant";

module.exports = {
  apps: [
    {
      name: "meeting-backend",
      cwd: `${APP_DIR}/backend`,
      script: ".venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 5001",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      env: {
        // HTTPS_PROXY: "http://127.0.0.1:3128",
        NO_PROXY: "localhost,127.0.0.1,::1"
      }
    },
    {
      name: "meeting-frontend",
      script: `${APP_DIR}/frontend/start-fe.sh`,
      interpreter: "bash",
      autorestart: true,
      max_restarts: 10
    }
  ]
};
