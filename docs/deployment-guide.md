# Meeting Transcriber - Production Deployment Guide

This guide covers deploying the **Meeting Transcriber** application to any cloud Virtual Private Server (VPS) such as **DigitalOcean, AWS EC2, Hetzner, or Linode** using **Docker Compose**.

---

## 1. Hardware & System Requirements

Because the backend runs **Faster-Whisper** (speech-to-text) and **pyannote.audio** (speaker diarization):

* **CPU**: 2+ vCPU cores (4 vCPU recommended for faster processing)
* **RAM**: Minimum 4 GB RAM (8 GB recommended for simultaneous transcription & diarization)
* **Disk**: 25 GB+ SSD
* **OS**: Ubuntu 22.04 LTS or 24.04 LTS (recommended)

---

## 2. Quick Deploy with Docker Compose

### Step 1: Provision your VPS
Create an Ubuntu VPS on your preferred cloud provider (e.g., DigitalOcean Droplet with 4GB RAM or AWS t3.medium / t3.large).

### Step 2: Install Docker and Docker Compose
SSH into your server and run:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3: Clone the Repository
```bash
git clone <your-repository-url> meeting-transcriber
cd meeting-transcriber
```

### Step 4: Configure `.env`
Create or edit `.env` in the project root:

```bash
cp .env.example .env
nano .env
```

Set your configuration:
```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
FRONTEND_ORIGIN=http://your-server-ip:3000
NEXT_PUBLIC_API_BASE_URL=http://your-server-ip:8000

WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_LANGUAGE=en

# Hugging Face token with accepted pyannote model conditions
PYANNOTE_AUTH_TOKEN=hf_your_token_here
PYANNOTE_MODEL=pyannote/speaker-diarization-3.1
```

### Step 5: Run the Deploy Script
```bash
./deploy.sh
```

Both containers will build and launch in the background.

---

## 3. Setting Up a Custom Domain and Free HTTPS (Caddy / Nginx)

To access your app securely over `https://yourdomain.com` without typing port numbers:

### Using Caddy (Easiest - Automatic SSL)

1. Install Caddy on the VPS:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   ```

2. Point your domain's DNS `A` record to your VPS IP address.

3. Edit `/etc/caddy/Caddyfile`:
   ```caddy
   yourdomain.com {
       # Route API requests to backend
       handle /api/* {
           reverse_proxy localhost:8000
       }
       handle /docs* {
           reverse_proxy localhost:8000
       }
       handle /openapi.json {
           reverse_proxy localhost:8000
       }

       # Route all other requests to frontend
       handle {
           reverse_proxy localhost:3000
       }
   }
   ```

4. Restart Caddy:
   ```bash
   sudo systemctl restart caddy
   ```
   Caddy automatically provisions and renews a free Let's Encrypt SSL certificate!

---

## 4. Maintenance & Operations

| Task | Command |
|---|---|
| View real-time logs | `docker compose logs -f` |
| View backend logs only | `docker compose logs -f backend` |
| View frontend logs only | `docker compose logs -f frontend` |
| Restart services | `docker compose restart` |
| Update application code | `git pull && ./deploy.sh` |
| Stop all services | `docker compose down` |
| Back up meetings data | `tar -czvf storage_backup.tar.gz storage/` |
