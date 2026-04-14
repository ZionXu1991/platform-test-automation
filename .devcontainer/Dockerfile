FROM mcr.microsoft.com/devcontainers/javascript-node:20

# ─── Cypress system dependencies (headless Chrome/Electron) ──────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnotify-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xvfb \
    && rm -rf /var/lib/apt/lists/*
