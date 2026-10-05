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
  if (!filename) return "audio";
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

/**
 * Smart parser to clean video title, separate artist and track,
 * and strip unwanted tags like (Official Video), (Clipe Oficial), [4K], etc.
 */
export function parseMusicMetadata(rawTitle = "", rawChannel = "", ytData = {}) {
  let artist = (ytData.artist || "").trim();
  let title = (ytData.track || "").trim();
  let album = (ytData.album || "").trim();
  let year = ytData.release_year
    ? String(ytData.release_year)
    : ytData.upload_date
    ? String(ytData.upload_date).slice(0, 4)
    : "";

  let cleanCh = (rawChannel || "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s*Official(?:\s*(?:Music|Artist|Channel))?$/i, "")
    .replace(/\s*Oficial$/i, "")
    .trim();

  // Junk patterns to strip from song title
  const junkPatterns = [
    /\s*[\(\[\{]?(?:official\s*(?:music\s*)?video|video\s*oficial|vídeo\s*oficial|clipe\s*oficial|clip\s*oficial|clipe|clip\s*officiel|official\s*audio|áudio\s*oficial|audio\s*oficial|official\s*lyric\s*video|lyric\s*video|letra|lyrics|visualizer|clip)[\)\]\}]?/gi,
    /\s*[\(\[\{]?(?:4k(?:\s*upgrade)?|1080p|hd|hq|hq audio|remastered|remasterizado|audio)[\)\]\}]?/gi,
    /\s*\|\s*$/g,
    /^\s*\|\s*/g,
  ];

  let cleaned = (rawTitle || "").trim();
  for (const pat of junkPatterns) {
    cleaned = cleaned.replace(pat, " ");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If yt-dlp already provided explicit track and artist
  if (artist && title) {
    return {
      artist,
      title,
      album: album || title || "Single",
      year: year || String(new Date().getFullYear()),
      filename: `${artist} - ${title}.mp3`,
    };
  }

  // Detect separators: ' - ', ' – ', ' — ', ' : ', ' | '
  const sepMatch = cleaned.match(/^(.*?)\s*(?:[-–—:|])\s*(.*)$/);
  if (sepMatch) {
    let part1 = sepMatch[1].trim();
    let part2 = sepMatch[2].trim();

    const p1Lower = part1.toLowerCase();
    const p2Lower = part2.toLowerCase();
    const chLower = cleanCh.toLowerCase();

    // If part2 looks like channel/artist (e.g. "Song Name - Artist")
    if (chLower && (p2Lower === chLower || p2Lower.includes(chLower))) {
      artist = part2;
      title = part1;
    } else {
      artist = part1;
      title = part2;
    }
  } else {
    artist = cleanCh || "YouTube";
    title = cleaned || rawTitle || "Música";
  }

  // Remove trailing or leading dashes or colons
  title = title.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim();
  artist = artist.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim();

  if (!title) title = rawTitle || "Música";
  if (!artist) artist = cleanCh || "Desconhecido";

  const filename =
    artist && artist !== "Desconhecido" && !title.toLowerCase().startsWith(artist.toLowerCase())
      ? `${artist} - ${title}.mp3`
      : `${title}.mp3`;

  return {
    artist,
    title,
    album: album || (artist ? `${artist} - Single` : "Single"),
    year: year || String(new Date().getFullYear()),
    filename,
  };
}

/**
 * Ensures ID3v2.3 tags (Title, Artist, Album, Year) and front cover art
 * are properly written and embedded into the MP3 using ffmpeg.
 */
export async function ensureMp3TagsAndCover(mp3Path, { title, artist, album, year, thumbnailUrl }) {
  if (!fs.existsSync(mp3Path)) return false;
  const tmpDir = path.dirname(mp3Path);
  const tempOutput = path.join(tmpDir, `tagged_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);

  // Check if mp3 already has a video/image stream (attached pic / album art)
  let hasCover = false;
  try {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v",
      "-show_entries", "stream=codec_name",
      "-of", "default=noprint_wrappers=1:nokey=1",
      mp3Path,
    ]);
    let probeOut = "";
    probe.stdout.on("data", (d) => {
      probeOut += d.toString();
    });
    await new Promise((res) => {
      probe.on("close", res);
      probe.on("error", res);
    });
    hasCover = probeOut.trim().length > 0;
  } catch {}

  let tempThumbPath = null;
  if (!hasCover && thumbnailUrl) {
    try {
      const res = await fetch(thumbnailUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        tempThumbPath = path.join(tmpDir, `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`);
        fs.writeFileSync(tempThumbPath, buffer);
      }
    } catch {}
  }

  const ffmpegArgs = ["-y", "-i", mp3Path];
  if (tempThumbPath && fs.existsSync(tempThumbPath)) {
    ffmpegArgs.push("-i", tempThumbPath);
    ffmpegArgs.push("-map", "0:a", "-map", "1:v");
    ffmpegArgs.push("-metadata:s:v", 'title="Album cover"', "-metadata:s:v", 'comment="Cover (front)"');
  } else {
    ffmpegArgs.push("-map", "0");
  }

  ffmpegArgs.push(
    "-c", "copy",
    "-id3v2_version", "3",
    "-metadata", `title=${title || ""}`,
    "-metadata", `artist=${artist || ""}`,
    "-metadata", `album=${album || (artist ? `${artist} - Single` : "Single")}`,
    "-metadata", `date=${year || new Date().getFullYear()}`,
    "-metadata", "comment=",
    "-metadata", "description=",
    "-metadata", "synopsis=",
    tempOutput
  );

  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ffmpegArgs);
    proc.on("close", (code) => {
      if (tempThumbPath && fs.existsSync(tempThumbPath)) {
        try { fs.unlinkSync(tempThumbPath); } catch {}
      }
      if (code === 0 && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 0) {
        try {
          fs.unlinkSync(mp3Path);
          fs.renameSync(tempOutput, mp3Path);
          resolve(true);
          return;
        } catch {}
      }
      if (fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(tempOutput); } catch {}
      }
      resolve(false);
    });
    proc.on("error", () => {
      if (tempThumbPath && fs.existsSync(tempThumbPath)) {
        try { fs.unlinkSync(tempThumbPath); } catch {}
      }
      if (fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(tempOutput); } catch {}
      }
      resolve(false);
    });
  });
}

export async function getVideoInfo(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("URL do YouTube inválida.");
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return new Promise((resolve) => {
    let resolved = false;

    // 12 seconds timeout to allow full metadata extraction
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        resolve(await getOEmbedFallback(videoId));
      }
    }, 12000);

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

          const rawTitle = data.title || "Vídeo do YouTube";
          const rawChannel = data.uploader || data.channel || "YouTube";

          const cleanMusic = parseMusicMetadata(rawTitle, rawChannel, {
            artist: data.artist,
            track: data.track,
            album: data.album,
            release_year: data.release_year,
            upload_date: data.upload_date,
          });

          resolve({
            id: videoId,
            title: cleanMusic.title,
            rawTitle,
            artist: cleanMusic.artist,
            album: cleanMusic.album,
            year: cleanMusic.year,
            channel: rawChannel,
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

  const cleanMusic = parseMusicMetadata(title, channel);

  return {
    id: videoId,
    title: cleanMusic.title,
    rawTitle: title,
    artist: cleanMusic.artist,
    album: cleanMusic.album,
    year: cleanMusic.year,
    channel,
    duration: "",
    views: "",
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function startDownloadJob({
  url,
  format = "video",
  quality = "720p (HD)",
  customTitle,
  customArtist,
  customAlbum,
  customYear,
  thumbnailUrl,
}) {
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

  let audioBitrate = "320K";
  if (isAudio) {
    if (quality.includes("256")) audioBitrate = "256K";
    else if (quality.includes("192")) audioBitrate = "192K";
    else if (quality.includes("128")) audioBitrate = "128K";

    args.push(
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", audioBitrate,
      "--embed-metadata",
      "--embed-thumbnail",
      "--convert-thumbnails", "jpg",
      "-o", outputTemplate,
      cleanUrl
    );
  } else {
    const heightMatch = quality.match(/(\d+)p/);
    const height = heightMatch ? heightMatch[1] : "1080";
    args.push(
      "-f", `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
      "--merge-output-format", "mp4",
      "--embed-metadata",
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
    message: isAudio ? "Iniciando download da música..." : "Iniciando download do vídeo...",
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

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();

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

    if (text.includes("[ThumbnailsConvertor]")) {
      job.status = "processing";
      job.message = "Processando capa oficial em alta resolução...";
    } else if (text.includes("[ExtractAudio]")) {
      job.status = "processing";
      job.message = `Convertendo para MP3 (${audioBitrate.replace("K", "kbps")})...`;
    } else if (text.includes("[EmbedThumbnail]")) {
      job.status = "processing";
      job.message = "Embutindo capa oficial no arquivo MP3...";
    } else if (text.includes("[Metadata]")) {
      job.status = "processing";
      job.message = "Gravando metadados de artista, título e álbum...";
    } else if (text.includes("[Merger]")) {
      job.status = "processing";
      job.message = "Mesclando vídeo e áudio em alta definição...";
    }
  });

  let stderrText = "";
  proc.stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  proc.on("close", async (code) => {
    if (code === 0) {
      try {
        const prefix = `bearcatch_${jobId}`;
        const targetExt = isAudio ? ".mp3" : ".mp4";
        const allTmpFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith(prefix));
        const matchedFiles = allTmpFiles.filter((f) => f.endsWith(targetExt));
        const filesToPick = matchedFiles.length > 0 ? matchedFiles : allTmpFiles;

        if (filesToPick.length > 0) {
          const finalFile = path.join(tmpDir, filesToPick[0]);
          job.filePath = finalFile;

          // Clean up any remaining temporary image files (e.g. bearcatch_job.jpg)
          for (const f of allTmpFiles) {
            if (f !== filesToPick[0] && (f.endsWith(".jpg") || f.endsWith(".webp") || f.endsWith(".webm") || f.endsWith(".part"))) {
              try { fs.unlinkSync(path.join(tmpDir, f)); } catch {}
            }
          }

          // If audio, apply ID3v2.3 tagger and ensure cover art
          if (isAudio) {
            job.message = "Finalizando tags ID3 e capa oficial...";
            await ensureMp3TagsAndCover(finalFile, {
              title: customTitle,
              artist: customArtist,
              album: customAlbum,
              year: customYear,
              thumbnailUrl: thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            });
          }

          // Calculate clean human-readable filename
          let finalName = "";
          if (isAudio) {
            if (customArtist && customTitle) {
              finalName = `${customArtist} - ${customTitle}.mp3`;
            } else if (customTitle) {
              finalName = `${customTitle}.mp3`;
            } else {
              finalName = `musica_${videoId}.mp3`;
            }
          } else {
            finalName = customTitle ? `${customTitle}.mp4` : `video_${videoId}.mp4`;
          }

          const safeFinalName = sanitizeFilename(finalName);
          const ext = isAudio ? ".mp3" : ".mp4";
          job.filename = safeFinalName.toLowerCase().endsWith(ext)
            ? safeFinalName
            : `${safeFinalName}${ext}`;

          job.status = "ready";
          job.progress = 100;
          job.message = "Download concluído com sucesso!";
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
