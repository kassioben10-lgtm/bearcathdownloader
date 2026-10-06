import fs from "fs";
import { URL } from "url";
import {
  getVideoInfo,
  startDownloadJob,
  getJob,
  cleanupJob,
  extractVideoId,
  extractPlaylistId,
  getPlaylistInfo,
  startPlaylistDownloadJob,
} from "./downloader.js";

export function createApiMiddleware() {
  return async function apiMiddleware(req, res, next) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // CORS headers for local testing
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (!pathname.startsWith("/api/")) {
      return next ? next() : undefined;
    }

    const sendJson = (statusCode, data) => {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
    };

    try {
      // 1. Health check
      if (pathname === "/api/health") {
        return sendJson(200, { status: "ok", service: "Bear Catch Downloader Local API" });
      }

      // 2. Video Info
      if (pathname === "/api/info" && req.method === "GET") {
        const url = parsedUrl.searchParams.get("url");
        if (!url) {
          return sendJson(400, { error: "Parâmetro url é obrigatório." });
        }
        try {
          const info = await getVideoInfo(url);
          return sendJson(200, { success: true, data: info });
        } catch (err) {
          return sendJson(500, { error: err.message || "Erro ao obter informações do vídeo." });
        }
      }

      // 2.1 Playlist Info
      if (pathname === "/api/playlist-info" && req.method === "GET") {
        const url = parsedUrl.searchParams.get("url") || parsedUrl.searchParams.get("list");
        if (!url) {
          return sendJson(400, { error: "Parâmetro url ou list é obrigatório." });
        }
        try {
          const info = await getPlaylistInfo(url);
          return sendJson(200, { success: true, data: info });
        } catch (err) {
          return sendJson(500, { error: err.message || "Erro ao obter informações da playlist." });
        }
      }

      // 3. Start Single Download Job
      if (pathname === "/api/start-download" && req.method === "POST") {
        let bodyText = "";
        req.on("data", (chunk) => {
          bodyText += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const body = bodyText ? JSON.parse(bodyText) : {};
            const { url, format, quality, title, artist, album, year, thumbnail } = body;
            if (!url) {
              return sendJson(400, { error: "URL é obrigatória." });
            }

            let finalTitle = title;
            let finalArtist = artist;
            let finalAlbum = album;
            let finalYear = year;
            let finalThumbnail = thumbnail;

            // If title or artist missing, fetch info quickly
            if (!finalTitle || !finalArtist) {
              try {
                const info = await getVideoInfo(url);
                if (info) {
                  finalTitle = finalTitle || info.title;
                  finalArtist = finalArtist || info.artist;
                  finalAlbum = finalAlbum || info.album;
                  finalYear = finalYear || info.year;
                  finalThumbnail = finalThumbnail || info.thumbnail;
                }
              } catch {}
            }

            const jobId = startDownloadJob({
              url,
              format,
              quality,
              customTitle: finalTitle,
              customArtist: finalArtist,
              customAlbum: finalAlbum,
              customYear: finalYear,
              thumbnailUrl: finalThumbnail,
            });

            return sendJson(200, { success: true, jobId });
          } catch (err) {
            return sendJson(500, { error: err.message || "Erro ao iniciar download." });
          }
        });
        return;
      }

      // 3.1 Start Playlist Download Job
      if (pathname === "/api/start-playlist-download" && req.method === "POST") {
        let bodyText = "";
        req.on("data", (chunk) => {
          bodyText += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const body = bodyText ? JSON.parse(bodyText) : {};
            const { url, playlistId, playlistTitle, format, quality, selectedVideoIds, selectedIndices } = body;
            const finalPlaylistId = playlistId || extractPlaylistId(url);

            if (!finalPlaylistId && (!selectedVideoIds || selectedVideoIds.length === 0)) {
              return sendJson(400, { error: "ID da playlist ou faixas selecionadas são obrigatórios." });
            }

            const jobId = startPlaylistDownloadJob({
              playlistId: finalPlaylistId,
              playlistTitle: playlistTitle || "Playlist",
              format: format || "audio",
              quality: quality || "320kbps (Melhor Qualidade)",
              selectedVideoIds: selectedVideoIds || null,
              selectedIndices: selectedIndices || null,
            });

            return sendJson(200, { success: true, jobId });
          } catch (err) {
            return sendJson(500, { error: err.message || "Erro ao iniciar download da playlist." });
          }
        });
        return;
      }

      // 4. Check Download Progress
      if (pathname === "/api/progress" && req.method === "GET") {
        const jobId = parsedUrl.searchParams.get("jobId");
        if (!jobId) {
          return sendJson(400, { error: "jobId é obrigatório." });
        }

        const job = getJob(jobId);
        if (!job) {
          return sendJson(404, { error: "Job não encontrado ou expirado." });
        }

        return sendJson(200, {
          success: true,
          status: job.status,
          progress: job.progress,
          speed: job.speed,
          eta: job.eta,
          message: job.message,
          filename: job.filename,
          isPlaylist: !!job.isPlaylist,
          currentItem: job.currentItem || 1,
          totalItems: job.totalItems || 1,
          error: job.error,
        });
      }

      // 5. Download Completed File
      if (pathname === "/api/file" && req.method === "GET") {
        const jobId = parsedUrl.searchParams.get("jobId");
        if (!jobId) {
          return sendJson(400, { error: "jobId é obrigatório." });
        }

        const job = getJob(jobId);
        if (!job || job.status !== "ready" || !job.filePath || !fs.existsSync(job.filePath)) {
          return sendJson(404, { error: "Arquivo ainda não está pronto ou expirou." });
        }

        const stat = fs.statSync(job.filePath);
        const filename =
          job.filename ||
          (job.isPlaylist
            ? "playlist.zip"
            : job.format === "mp3"
            ? "audio.mp3"
            : "video.mp4");

        const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
        const encodedFilename = encodeURIComponent(filename);

        let contentType = "application/octet-stream";
        if (filename.toLowerCase().endsWith(".zip")) {
          contentType = "application/zip";
        } else if (filename.toLowerCase().endsWith(".mp3") || job.format === "mp3") {
          contentType = "audio/mpeg";
        } else if (filename.toLowerCase().endsWith(".mp4") || job.format === "mp4") {
          contentType = "video/mp4";
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
        );
        res.setHeader("Content-Length", stat.size);

        const readStream = fs.createReadStream(job.filePath);
        readStream.pipe(res);

        readStream.on("close", () => {
          setTimeout(() => cleanupJob(jobId), 1500);
        });

        readStream.on("error", (err) => {
          console.error("Stream error:", err);
          cleanupJob(jobId);
        });

        return;
      }

      // If route not found under /api/
      return sendJson(404, { error: "Rota API não encontrada." });
    } catch (err) {
      console.error("API error:", err);
      return sendJson(500, { error: err.message || "Erro interno do servidor." });
    }
  };
}
