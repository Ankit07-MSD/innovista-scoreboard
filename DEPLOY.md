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
5. Choose the Free plan.
6. After deploy:
   - Live standings: `https://your-app.onrender.com/`
   - Admin: `https://your-app.onrender.com/admin`
   - Overall points: `https://your-app.onrender.com/standings`

The included `render.yaml` can be used as a Render Blueprint. It includes the free web service, health check, and admin key placeholder.

## Free deploy warning

On Render Free, the app can sleep after inactivity and the local `state.json` can reset after a restart/redeploy. For a short event this is usually okay if the admin panel stays open and active. For permanent saved data, use a paid persistent disk or a database later.

## Paid persistent storage

If you want match data to survive restarts/redeploys:

1. Upgrade the web service to a paid plan.
2. Add a persistent disk:
   - Mount Path: `/var/data`
   - Size: `1 GB`
3. Add environment variable:
   - `STATE_FILE=/var/data/state.json`

## Railway

Railway also works:

1. Deploy from GitHub.
2. Set variables:
   - `ADMIN_KEY`
   - `STATE_FILE=/app/data/state.json` or another mounted volume path
3. Start command: `npm start`
4. Health check path: `/healthz`
