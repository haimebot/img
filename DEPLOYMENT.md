# Universal Deployment Guide

This application is built with React 19, Vite, Tailwind CSS, and a Node.js Express backend. It is 100% platform-agnostic and ready to deploy to any major cloud provider, container platform, serverless host, or private VPS.

---

## 1. Quick Overview of Deployment Targets

| Platform | Type | Recommended File | Start Command |
|---|---|---|---|
| **Vercel** | Serverless / Edge | `vercel.json`, `/api` | Auto-detected |
| **Netlify** | Static + Edge | `netlify.toml` | `npm run build` |
| **Docker / Cloud Run / AWS / Azure** | Container | `Dockerfile` | `node dist/server.cjs` |
| **Render** | Node.js PaaS | `render.yaml` | `npm run start` |
| **Zoho Catalyst (Slate / AppSail)** | Serverless / AppSail | `catalyst.json`, `app-config.json` | `npm run start` |
| **Railway** | Node.js PaaS / Nixpacks | `Procfile` / `Dockerfile` | `npm run start` |
| **Heroku / Dokku** | 12-factor PaaS | `Procfile` | `npm run start` |
| **Linux VPS (Ubuntu / Debian)** | Self-hosted | `docker-compose.yml` or PM2 | `docker compose up -d` |

---

## 2. Docker & Container Platforms

The included multi-stage `Dockerfile` uses lightweight `node:22-alpine`, builds both the frontend static bundle (`dist/`) and the Node.js backend server (`dist/server.cjs`), runs as a non-root security user, and dynamically binds to the `$PORT` environment variable provided by your cloud provider.

### Build and Run Locally / on VPS
```bash
# Build the Docker image
docker build -t amazon-image-viewer .

# Run container (maps port 3000)
docker run -d -p 3000:3000 --name amazon-image-viewer amazon-image-viewer

# Or using Docker Compose:
docker compose up -d
```

### Google Cloud Run
1. Push your repository to GitHub or submit source to Google Cloud Build:
   ```bash
   gcloud run deploy amazon-image-viewer --source . --region us-central1 --allow-unauthenticated
   ```
2. Cloud Run automatically passes `PORT=8080`, builds the `Dockerfile`, and provisions an HTTPS URL.

### AWS App Runner or ECS
1. Connect your GitHub repository to AWS App Runner.
2. Select **Container Registry** (or source directory with `Dockerfile`).
3. Set Port to `3000` (or leave default `$PORT`).
4. Health check endpoint: `/api/health`.

### Railway / Fly.io
- **Railway**: Simply link your GitHub repo. Railway detects the `Dockerfile` automatically and assigns a public domain.
- **Fly.io**: Run `fly launch`. Fly detects the `Dockerfile` and deploys globally.

---

## 3. Vercel Deployment

1. Import your GitHub repository into [Vercel](https://vercel.com).
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. The `vercel.json` file automatically routes frontend traffic to `dist/index.html` and backend API traffic to the serverless handlers in `/api/`.
6. Click **Deploy**.

---

## 4. Render Deployment

1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint** and select your repository (reads `render.yaml`).
   - Or click **New +** -> **Web Service**.
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`
   - Health Check Path: `/api/health`
3. Click **Create Web Service**.

---

## 5. Zoho Catalyst Deployment (Slate / AppSail)

### The Error You May Have Seen:
```
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/catalyst/img3.0/package.json'
```
**Why this happened:**
1. **Repository nesting:** When pushing code to GitHub, the files were placed inside a subfolder (e.g. `img3.0/amazon-image-viewer/package.json` instead of directly at the root `package.json`).
2. **Missing Base Directory in Catalyst Console:** Zoho Catalyst Slate Deployer cloned into `/catalyst/img3.0/` and expected `package.json` at the root of that clone.

### How to Fix & Deploy on Zoho Catalyst:

#### Option A: Direct AppSail / GitHub Git Integration
1. Open your repository on GitHub.
2. Ensure `package.json`, `package-lock.json`, `app-config.json`, and `catalyst.json` are in the **top-level root** of the repository (not inside an extra nested folder).
3. In Zoho Catalyst Console:
   - Navigate to **AppSail** -> **Create an AppSail Service**.
   - Runtime: **Node.js 22** (or matching version).
   - Source: **GitHub**. Select repository `img3.0`.
   - **Base / Root Directory**: Enter `.` (or if your project files are inside a subfolder, enter that subfolder name, e.g. `amazon-image-viewer`).
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`
   - Port: `3000`
4. Click **Deploy**.

#### Option B: Deploy using Catalyst CLI
```bash
# Install Catalyst CLI
npm install -g zcatalyst-cli

# Login and initialize in your project directory
catalyst login
catalyst init

# Deploy directly
catalyst deploy
```

---

## 6. Netlify Deployment

1. Link your repository in [Netlify](https://app.netlify.com).
2. Netlify will read `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Click **Deploy Site**.

---

## 7. Self-Hosted Linux VPS (Ubuntu / Debian with PM2)

If running directly on a Linux server without Docker:

```bash
# 1. Clone repository and install dependencies
git clone <your-repo-url>
cd amazon-image-viewer
npm install

# 2. Build production assets
npm run build

# 3. Start with PM2 process manager
npm install -g pm2
pm2 start dist/server.cjs --name "amazon-image-viewer"
pm2 save
pm2 startup
```

### Nginx Reverse Proxy Config (Optional for custom domain with SSL)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 8. Environment Variables

All environment variables are optional. Built-in defaults and browser-side canvas fallbacks ensure the app works immediately out of the box.

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port the server binds to | `3000` |
| `NODE_ENV` | Environment mode (`production` / `development`) | `production` |
| `REMOVE_BG_API_KEY` | Custom Remove.bg API key | Built-in default & browser fallback |
| `IMGBB_API_KEY` | Custom ImgBB API key | Built-in high-availability key pool |

---

## 9. Health Check Endpoint

All container orchestrators and load balancers can monitor application health at:
```http
GET /api/health
```
Response:
```json
{
  "status": "ok",
  "app": "Amazon Image Viewer"
}
```
