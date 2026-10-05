import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Zap, Shield, Globe, Sparkles } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import VideoPreview, { type VideoInfo } from "@/components/VideoPreview";
import FormatSelector from "@/components/FormatSelector";
import { useToast } from "@/hooks/use-toast";
import { extractVideoId, isValidYouTubeUrl } from "@/lib/youtube";
import bearLogo from "@/assets/bear-logo.png";

const features = [
  { icon: Zap, title: "Super Rápido", desc: "Download em velocidade máxima diretamente no seu dispositivo" },
  { icon: Shield, title: "100% Seguro", desc: "Sem anúncios invasivos, sem rastreadores ou malware" },
  { icon: Globe, title: "Sem Limites", desc: "Baixe vídeos em até 4K ou áudios MP3 em 320kbps ilimitados" },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [downloadEta, setDownloadEta] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadReadyFile, setDownloadReadyFile] = useState<{ jobId: string; filename: string } | null>(null);

  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const { toast } = useToast();

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleSearch = async (url: string, autoDownload: boolean = false) => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      toast({
        title: "URL inválida",
        description: "Por favor, insira um link válido do YouTube (vídeo, shorts ou lives).",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setDownloadError(null);
    setDownloadReadyFile(null);
    setCurrentUrl(url);

    let title = "Vídeo do YouTube";
    let channel = "YouTube";
    let duration = "";
    let views = "";
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    let artist: string | undefined = undefined;
    let album: string | undefined = undefined;
    let year: string | undefined = undefined;
    let rawTitle: string | undefined = undefined;

    // 1. Try local backend /api/info
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          title = result.data.title || title;
          rawTitle = result.data.rawTitle || result.data.title;
          artist = result.data.artist;
          album = result.data.album;
          year = result.data.year;
          channel = result.data.channel || channel;
          duration = result.data.duration || "";
          views = result.data.views || "";
          thumbnail = result.data.thumbnail || thumbnail;
        }
      } else {
        throw new Error("Local API fallback");
      }
    } catch {
      // Fallback to oembed
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          title = data.title || title;
          channel = data.author_name || channel;
        }
      } catch {}
    }

    const videoData: VideoInfo = {
      title,
      rawTitle,
      artist,
      album,
      year,
      thumbnail,
      duration,
      views,
      channel,
    };

    setVideo(videoData);
    setIsLoading(false);

    // If auto-download was requested upon pasting, start right away!
    if (autoDownload) {
      setTimeout(() => {
        handleDownload("video", "1080p (Full HD)");
      }, 100);
    }
  };

  const handleDownload = async (
    format: "video" | "audio",
    quality: string,
    meta?: { title?: string; artist?: string }
  ) => {
    if (!currentUrl) return;

    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadSpeed("");
    setDownloadEta("");
    setDownloadMessage("Conectando ao YouTube...");
    setDownloadError(null);
    setDownloadReadyFile(null);

    toast({
      title: "Iniciando download...",
      description: `Processando ${format === "audio" ? "áudio MP3 com capa e tags" : quality}. Aguarde...`,
    });

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    try {
      // Start download job via local API
      const startRes = await fetch("/api/start-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: currentUrl,
          format,
          quality,
          title: meta?.title || video?.title,
          artist: meta?.artist || video?.artist,
          album: video?.album,
          year: video?.year,
          thumbnail: video?.thumbnail,
        }),
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${startRes.status} ao iniciar download.`);
      }

      const startData = await startRes.json();
      const jobId = startData.jobId;

      // Poll progress every 500ms
      pollIntervalRef.current = setInterval(async () => {
        try {
          const progRes = await fetch(`/api/progress?jobId=${jobId}`);
          if (!progRes.ok) return;

          const progData = await progRes.json();

          if (progData.progress !== undefined) {
            setDownloadProgress(progData.progress);
          }
          if (progData.speed) setDownloadSpeed(progData.speed);
          if (progData.eta) setDownloadEta(progData.eta);
          if (progData.message) setDownloadMessage(progData.message);

          if (progData.status === "ready") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setDownloadProgress(100);
            setDownloadMessage("Download finalizado! Salvando no computador...");
            setIsDownloading(false);

            const filename = progData.filename || (format === "audio" ? "audio.mp3" : "video.mp4");
            setDownloadReadyFile({ jobId, filename });

            // Trigger browser direct file save
            const fileUrl = `/api/file?jobId=${jobId}`;
            const link = document.createElement("a");
            link.href = fileUrl;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast({
              title: "Download concluído!",
              description: `O arquivo ${filename} foi baixado com sucesso.`,
            });
          } else if (progData.status === "error") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsDownloading(false);
            setDownloadError(progData.error || "Falha no download");
            toast({
              title: "Erro no download",
              description: progData.error || "Não foi possível baixar o vídeo.",
              variant: "destructive",
            });
          }
        } catch (pollErr) {
          console.error("Poll error:", pollErr);
        }
      }, 500);
    } catch (err: any) {
      console.error("Download error:", err);
      setIsDownloading(false);
      setDownloadError(err.message || "Erro de conexão com o servidor local.");
      toast({
        title: "Erro ao processar",
        description: err.message || "Verifique se o servidor local está em execução.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-between">
      <div className="absolute inset-0 gradient-hero pointer-events-none" />

      <div className="relative z-10 flex-1">
        <header className="flex items-center justify-center pt-6 pb-2">
          <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-card/60 border border-border/60 backdrop-blur-md shadow-sm">
            <img src={bearLogo} alt="Bear Catch" className="h-5 w-auto" />
            <span className="font-semibold text-foreground text-sm tracking-tight">
              Bear Catch Downloader
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
              v2.0 Turbo
            </span>
          </div>
        </header>

        <main className="container max-w-4xl mx-auto px-4 pt-10 pb-16 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-4"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative group">
                <div className="absolute -inset-2 bg-primary/30 rounded-full blur-xl group-hover:bg-primary/50 transition-all duration-500" />
                <img
                  src={bearLogo}
                  alt="Bear Catch Logo"
                  className="relative h-20 w-auto drop-shadow-md hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-foreground tracking-tight">
              <span className="text-gradient">Bear Catch</span> Downloader
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto">
              Baixe vídeos e músicas do YouTube em alta velocidade e qualidade máxima. Cole o link e o download começará imediatamente!
            </p>
          </motion.div>

          <UrlInput
            onSubmit={handleSearch}
            isLoading={isLoading}
            isDownloading={isDownloading}
          />

          {video && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              <VideoPreview video={video} />
              <FormatSelector
                videoInfo={video}
                onDownload={handleDownload}
                isDownloading={isDownloading}
                downloadProgress={downloadProgress}
                downloadSpeed={downloadSpeed}
                downloadEta={downloadEta}
                downloadMessage={downloadMessage}
                downloadError={downloadError}
                downloadReadyFile={downloadReadyFile}
              />
            </motion.div>
          )}

          {!video && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8"
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                  className="flex flex-col items-center text-center p-6 bg-card/60 backdrop-blur-md border border-border/60 rounded-2xl hover:border-primary/40 transition-colors shadow-sm"
                >
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl mb-3 text-primary">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display font-semibold text-foreground text-base mb-1">
                    {f.title}
                  </h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </main>
      </div>

      <footer className="text-center py-6 text-muted-foreground text-xs border-t border-border/40 relative z-10 bg-card/20">
        <p>Bear Catch Downloader. Desenvolvido para uso pessoal e legal. Respeite os direitos autorais dos criadores.</p>
      </footer>
    </div>
  );
};

export default Index;
