import fs from "fs";
import { URL } from "url";
import {
  getVideoInfo,
  startDownloadJob,
  getJob,
  cleanupJob,
  extractVideoId,
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
        const info = await getVideoInfo(url);
        return sendJson(200, { success: true, data: info });
      }

      // 3. Start Download Job
      if (pathname === "/api/start-download" && req.method === "POST") {
        let bodyText = "";
        req.on("data", (chunk) => {
          bodyText += chunk.toString();
        });

        req.on("end", () => {
          try {
            const body = bodyText ? JSON.parse(bodyText) : {};
            const { url, format, quality } = body;
            if (!url) {
              return sendJson(400, { error: "URL é obrigatória." });
            }

            const jobId = startDownloadJob({ url, format, quality });
            return sendJson(200, { success: true, jobId });
          } catch (err) {
            return sendJson(500, { error: err.message || "Erro ao iniciar download." });
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
        const filename = job.filename || (job.format === "mp3" ? "audio.mp3" : "video.mp4");
        const encodedFilename = encodeURIComponent(filename);

        res.statusCode = 200;
        res.setHeader(
          "Content-Type",
          job.format === "mp3" ? "audio/mpeg" : "video/mp4"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        );
        res.setHeader("Content-Length", stat.size);

        const readStream = fs.createReadStream(job.filePath);
        readStream.pipe(res);

        readStream.on("close", () => {
          setTimeout(() => cleanupJob(jobId), 1000);
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
