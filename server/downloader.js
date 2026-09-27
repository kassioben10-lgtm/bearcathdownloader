import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";

// In-memory job store
const jobs = new Map();

// Helper to clean up old temp files on startup
try {
  const tmpDir = os.tmpdir();
  const existingFiles = fs.readdirSync(tmpDir);
  for (const file of existingFiles) {
    if (file.startsWith("bearcatch_")) {
      try {
        fs.unlinkSync(path.join(tmpDir, file));
      } catch {}
    }
  }
} catch {}

export function extractVideoId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const shortMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|v|shorts|live)\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

export function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getVideoInfo(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL do YouTube inválida.");
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return new Promise((resolve) => {
    // Timeout of 5 seconds for yt-dlp metadata
    let resolved = false;

    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        resolve(await getOEmbedFallback(videoId));
      }
    }, 6000);

    const proc = spawn("yt-dlp", [
      "--js-runtimes", "node",
      "--remote-components", "ejs:github",
      "--dump-json",
      "--no-playlist",
      cleanUrl,
    ]);

    let stdout = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.on("close", async (code) => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;

      if (code === 0 && stdout) {
        try {
          const data = JSON.parse(stdout);
          let durationStr = data.duration_string || "";
          if (!durationStr && data.duration) {
            const mins = Math.floor(data.duration / 60);
            const secs = data.duration % 60;
            durationStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
          }

          let viewsStr = "";
          if (data.view_count) {
            viewsStr = Number(data.view_count).toLocaleString("pt-BR") + " visualizações";
          }

          const thumbnail =
            data.thumbnail ||
            `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

          resolve({
            id: videoId,
            title: data.title || "Vídeo do YouTube",
            channel: data.uploader || data.channel || "YouTube",
            duration: durationStr,
            views: viewsStr,
            thumbnail,
            url: cleanUrl,
          });
          return;
        } catch {}
      }

      // Fallback to oembed if yt-dlp info failed
      resolve(await getOEmbedFallback(videoId));
    });

    proc.on("error", async () => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;
      resolve(await getOEmbedFallback(videoId));
    });
  });
}

async function getOEmbedFallback(videoId) {
  let title = "Vídeo do YouTube";
  let channel = "YouTube";
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      channel = data.author_name || channel;
    }
  } catch {}

  return {
    id: videoId,
    title,
    channel,
    duration: "",
    views: "",
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function startDownloadJob({ url, format = "video", quality = "720p (HD)" }) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL do YouTube inválida.");
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const jobId = "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const tmpDir = os.tmpdir();

  const isAudio = format === "audio";
  const outputTemplate = path.join(tmpDir, `bearcatch_${jobId}.%(ext)s`);

  let args = [
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
    "--no-playlist",
    "--no-warnings",
  ];

  if (isAudio) {
    args.push(
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", outputTemplate,
      cleanUrl
    );
  } else {
    const heightMatch = quality.match(/(\d+)p/);
    const height = heightMatch ? heightMatch[1] : "1080";
    args.push(
      "-f", `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      cleanUrl
    );
  }

  const job = {
    id: jobId,
    url: cleanUrl,
    format: isAudio ? "mp3" : "mp4",
    status: "downloading",
    progress: 0,
    speed: "",
    eta: "",
    message: "Iniciando download...",
    filePath: null,
    filename: null,
    error: null,
    createdAt: Date.now(),
  };

  jobs.set(jobId, job);

  // Auto clean jobs older than 15 minutes
  setTimeout(() => {
    if (jobs.has(jobId)) {
      const j = jobs.get(jobId);
      if (j.filePath && fs.existsSync(j.filePath)) {
        try { fs.unlinkSync(j.filePath); } catch {}
      }
      jobs.delete(jobId);
    }
  }, 15 * 60 * 1000);

  const proc = spawn("yt-dlp", args);
  job.proc = proc;

  let titleExtracted = "";

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();

    // Check title/destination
    const destMatch = text.match(/Destination:\s*(.+)$/m);
    if (destMatch && !titleExtracted) {
      titleExtracted = path.basename(destMatch[1].trim());
    }

    // Match download progress: [download]  45.2% of 11.28MiB at 4.29MiB/s ETA 00:01
    const progMatch = text.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
    if (progMatch) {
      job.progress = Math.min(Math.round(parseFloat(progMatch[1])), 99);
      job.speed = progMatch[3];
      job.eta = progMatch[4];
      job.message = `Baixando... ${job.progress}% (${job.speed})`;
    } else {
      const simpleProgMatch = text.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (simpleProgMatch) {
        job.progress = Math.min(Math.round(parseFloat(simpleProgMatch[1])), 99);
        job.message = `Baixando... ${job.progress}%`;
      }
    }

    if (text.includes("[ExtractAudio]") || text.includes("[Merger]")) {
      job.status = "processing";
      job.message = isAudio ? "Convertendo para MP3..." : "Processando e mesclando vídeo...";
    }
  });

  let stderrText = "";
  proc.stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  proc.on("close", (code) => {
    if (code === 0) {
      // Find output file
      try {
        const prefix = `bearcatch_${jobId}`;
        const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(prefix));
        if (files.length > 0) {
          const finalFile = path.join(tmpDir, files[0]);
          job.filePath = finalFile;
          job.status = "ready";
          job.progress = 100;
          job.message = "Download concluído!";
          const ext = path.extname(finalFile) || (isAudio ? ".mp3" : ".mp4");
          const safeTitle = titleExtracted ? sanitizeFilename(titleExtracted) : `video_${videoId}`;
          job.filename = safeTitle.endsWith(ext) ? safeTitle : `${safeTitle}${ext}`;
          return;
        }
      } catch (err) {
        job.error = "Erro ao localizar arquivo temporário: " + err.message;
      }
    }

    job.status = "error";
    job.error = stderrText.slice(-300) || "Falha no download (código " + code + ")";
  });

  proc.on("error", (err) => {
    job.status = "error";
    job.error = "Falha ao iniciar yt-dlp: " + err.message;
  });

  return jobId;
}

export function getJob(jobId) {
  return jobs.get(jobId);
}

export function cleanupJob(jobId) {
  const job = jobs.get(jobId);
  if (job) {
    if (job.filePath && fs.existsSync(job.filePath)) {
      try {
        fs.unlinkSync(job.filePath);
      } catch {}
    }
    jobs.delete(jobId);
  }
}
