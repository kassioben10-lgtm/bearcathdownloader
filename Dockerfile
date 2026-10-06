# Base image with Node.js 20 on Debian Bookworm Slim
FROM node:20-bookworm-slim

# Install system dependencies: Python3, FFmpeg, zip, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    zip \
    unzip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (official JS runtime required by yt-dlp for YouTube player decoding)
RUN curl -fsSL https://deno.land/install.sh | sh \
    && cp /root/.deno/bin/deno /usr/local/bin/deno \
    && chmod a+rx /usr/local/bin/deno

# Install the latest yt-dlp with JavaScript solvers and pre-release fixes
RUN pip3 install --no-cache-dir --break-system-packages -U --pre "yt-dlp[default]" \
    || (curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp)

# Verify installations
RUN yt-dlp --version && ffmpeg -version && deno --version

# Set work directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install npm dependencies (including dev dependencies for build step)
RUN npm install

# Copy application source code
COPY . .

# Build the frontend production bundle (into /app/dist)
RUN npm run build

# Set environment defaults
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Start the all-in-one server
CMD ["node", "server.js"]
