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

# Install the latest official yt-dlp binary directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Verify installations
RUN yt-dlp --version && ffmpeg -version

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
