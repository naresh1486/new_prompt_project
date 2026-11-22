# Complete Deployment Guide: Vercel (Frontend) + Railway (Backend)

This guide walks you through deploying the **Meeting Transcriber** application into production using:
- **Vercel** for the Next.js Frontend (Free, fast global CDN, automated CI/CD)
- **Railway** for the FastAPI + AI Backend (Runs Docker with FFmpeg, PyTorch, Whisper, and Pyannote)

---

## Architecture Overview

```
 [User Browser]
       │
       ├──► https://your-app.vercel.app  (Next.js Frontend on Vercel)
       │         │
       │         ▼  (REST API calls & video streams)
       └──► https://your-backend.up.railway.app (FastAPI on Railway)
                 │
                 ├──► /app/storage (Railway Persistent Volume: SQLite & Videos)
                 ├──► FFmpeg (Audio Extraction)
                 ├──► Faster-Whisper (Speech-to-Text)
                 └──► Pyannote.audio (Speaker Diarization with HF Token)
```

---

## Prerequisites

1. A **GitHub account** (with your project pushed to a repository).
2. A free **[Railway.app](https://railway.app)** account.
3. A free **[Vercel.com](https://vercel.com)** account.
4. Your Hugging Face access token (`hf_...`).

---

## Part 1: Push Code to GitHub

If you haven't pushed your code to GitHub yet, run:

```bash
cd /Users/nareshyadav/Desktop/prompt_project/smart_sync

# Initialize and commit
git add .
git commit -m "Configure production Docker deployment and Vercel/Railway compatibility"

# Push to your GitHub repo
git remote add origin https://github.com/<your-username>/smart_sync.git
git branch -M main
git push -u origin main
```

---

## Part 2: Deploy the Backend on Railway

The backend requires FFmpeg, PyTorch, and a persistent disk for uploaded videos. Railway will build it automatically using `backend/Dockerfile`.

### Step 1: Create a Railway Project
1. Log in to [railway.app](https://railway.app) and click **"New Project"**.
2. Select **"Deploy from GitHub repo"**.
3. Choose your `smart_sync` repository.

### Step 2: Configure Service Settings
1. Click on the newly created service tile, go to **Settings**:
   - **Root Directory**: Set to `/backend`
   - **Dockerfile Path**: Set to `Dockerfile` (or leave default since Root Directory is `/backend`).
2. Go to **Networking** tab:
   - Click **"Generate Domain"**.
   - Copy this URL (e.g. `https://smart-sync-production.up.railway.app`). You will need this for Vercel.

### Step 3: Add a Persistent Volume (Critical for Storage)
Because uploaded videos, extracted WAV files, and the SQLite database are stored in `storage/`, you must attach a persistent disk so data isn't wiped on redeploys:
1. In your Railway service view, click **"Add Volume"** (or click `+ New` -> `Volume`).
2. Set the **Mount Path** to:
   ```
   /app/storage
   ```
3. Set the size (e.g. 5 GB or 10 GB).

### Step 4: Set Environment Variables
Go to the **Variables** tab in your Railway service and add the following:

| Variable | Value | Description |
|---|---|---|
| `PYANNOTE_AUTH_TOKEN` | `hf_your_token_here` | Your Hugging Face access token |
| `PYANNOTE_MODEL` | `pyannote/speaker-diarization-3.1` | Diarization model |
| `WHISPER_MODEL` | `base` | Whisper model size |
| `WHISPER_DEVICE` | `cpu` | Device (`cpu` or `cuda`) |
| `WHISPER_COMPUTE_TYPE` | `int8` | Compute quantization |
| `WHISPER_LANGUAGE` | `en` | Transcription language |
| `FRONTEND_ORIGIN` | `https://your-app.vercel.app` | *Update with your Vercel URL once generated* |

Click **Deploy**. Railway will build the Docker container and start the API.

---

## Part 3: Deploy the Frontend on Vercel

### Step 1: Import Project in Vercel
1. Log in to [vercel.com](https://vercel.com) and click **"Add New..."** -> **"Project"**.
2. Select your `smart_sync` GitHub repository and click **"Import"**.

### Step 2: Configure Build & Environment
1. In the configuration screen:
   - **Framework Preset**: Next.js
   - **Root Directory**: Click "Edit" and choose `frontend`
2. Open the **Environment Variables** section and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-backend.up.railway.app` *(Your Railway URL from Part 2)* |

3. Click **"Deploy"**.

Vercel will build and deploy your Next.js frontend in about 1 minute and assign you a URL (e.g., `https://smart-sync.vercel.app`).

### Step 3: Connect CORS
Go back to **Railway** -> **Variables**, and update `FRONTEND_ORIGIN`:
```
FRONTEND_ORIGIN=https://smart-sync.vercel.app
```
(Replace with your real Vercel URL). Railway will automatically redeploy with the updated CORS rule.

---

## Part 4: Verification Checklist

1. Open your live Vercel URL: `https://your-app.vercel.app`.
2. Click **"Upload meeting"** and upload a video file.
3. Observe the Railway backend logs in Railway dashboard:
   - Audio extraction via FFmpeg completes.
   - Faster-Whisper transcribes speech.
   - Pyannote clusters speakers.
4. When finished, inspect the interactive transcript with timestamps and distinct speaker badges!

---

## Alternative Cloud Options Comparison

| Option | Pros | Cons | Estimated Cost |
|---|---|---|---|
| **Vercel (Frontend) + Railway (Backend)** | Easy UI, zero server setup, automated CI/CD from GitHub. | Railway charges per CPU/RAM minute used by AI pipelines. | Free tier trial, then ~$5–10/mo |
| **Vercel (Frontend) + Render.com (Backend)** | Popular alternative to Railway, has Native Docker Web Services with Persistent Disks. | Free tier spins down on inactivity (takes 50s to wake up). | Free or $7/mo |
| **Single VPS (Hetzner / DigitalOcean) via Docker Compose** | **Best value for ML**. Unlimited CPU usage, flat price, no timeout limits, both frontend & backend in one place. | Requires running basic Linux commands once via SSH. | **$4 to $10/month flat** (Hetzner or DigitalOcean) |
| **AWS EC2 (t3.medium or g4dn.xlarge)** | Industry standard, GPU support (`g4dn` allows 10x faster transcription). | More complex setup (VPC, Security Groups, IAM). | $15–$30/mo (CPU) or $0.52/hr (GPU) |
