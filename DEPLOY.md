# Deploy Guide

## Best option: Render

This is a Node.js + Socket.io web app, so deploy it as a web service.

1. Push this folder to a GitHub repository.
2. In Render, create a new Web Service from that repository.
3. Use:
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
4. Add environment variables:
   - `ADMIN_KEY`: your private admin password
   - `STATE_FILE`: `/var/data/state.json`
5. Add a persistent disk:
   - Mount Path: `/var/data`
   - Size: `1 GB`
6. After deploy:
   - Live standings: `https://your-app.onrender.com/`
   - Admin: `https://your-app.onrender.com/admin`
   - Overall points: `https://your-app.onrender.com/standings`

The included `render.yaml` can be used as a Render Blueprint. It includes the web service, health check, environment placeholders, and a persistent disk.

## Quick/free deploy warning

If you deploy without a persistent disk or database, the scoreboard can still run, but match data saved in `state.json` can reset after a restart or redeploy.

## Railway

Railway also works:

1. Deploy from GitHub.
2. Set variables:
   - `ADMIN_KEY`
   - `STATE_FILE=/app/data/state.json` or another mounted volume path
3. Start command: `npm start`
4. Health check path: `/healthz`

