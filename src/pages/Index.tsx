import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Zap,
  Shield,
  Globe,
  Sparkles,
  Music,
  ListMusic,
  FolderArchive,
  Layers,
  Loader2,
  Server,
  AlertTriangle,
  Laptop,
} from "lucide-react";
import UrlInput from "@/components/UrlInput";
import VideoPreview, { type VideoInfo } from "@/components/VideoPreview";
import FormatSelector from "@/components/FormatSelector";
import PlaylistPreview from "@/components/PlaylistPreview";
import PlaylistChoicePrompt from "@/components/PlaylistChoicePrompt";
import ServerSettingsModal from "@/components/ServerSettingsModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  parseYouTubeUrl,
  isValidYouTubeUrl,
  type PlaylistInfo,
  type PlaylistEntry,
} from "@/lib/youtube";
import { getApiUrl, isStaticGitHubPages, getApiBaseUrl } from "@/lib/api";
import bearLogo from "@/assets/bear-logo.png";

const features = [
  {
    icon: Zap,
    title: "Super Rápido & Turbo",
    desc: "Download em velocidade máxima e sem limites diretamente no seu dispositivo",
  },
  {
    icon: ListMusic,
    title: "Compatível com Playlists",
    desc: "Baixe a música avulsa ou a playlist completa compactada em um arquivo ZIP",
  },
  {
    icon: Shield,
    title: "100% Seguro & Limpo",
    desc: "Capa HD oficial embutida, metadados ID3 completos e sem anúncios invasivos",
  },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  // Single video states
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [downloadEta, setDownloadEta] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadReadyFile, setDownloadReadyFile] = useState<{
    jobId: string;
    filename: string;
  } | null>(null);

  // Playlist states
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [isPlaylistDownloading, setIsPlaylistDownloading] = useState(false);
  const [playlistProgress, setPlaylistProgress] = useState(0);
  const [playlistSpeed, setPlaylistSpeed] = useState("");
  const [playlistEta, setPlaylistEta] = useState("");
  const [playlistMessage, setPlaylistMessage] = useState("");
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistReadyFile, setPlaylistReadyFile] = useState<{
    jobId: string;
    filename: string;
  } | null>(null);

  // Active view ("video" or "playlist") when link has both
  const [activeView, setActiveView] = useState<"video" | "playlist">("video");
  const [showChoicePrompt, setShowChoicePrompt] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);

  const { toast } = useToast();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playlistPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear polling intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (playlistPollIntervalRef.current)
        clearInterval(playlistPollIntervalRef.current);
    };
  }, []);

  const handleSearch = async (url: string, autoDownload: boolean = false) => {
    const analysis = parseYouTubeUrl(url);

    if (!analysis.videoId && !analysis.playlistId) {
      toast({
        title: "URL inválida",
        description:
          "Por favor, insira um link válido do YouTube (vídeo, música, Shorts ou playlist).",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setDownloadError(null);
    setDownloadReadyFile(null);
    setPlaylistError(null);
    setPlaylistReadyFile(null);
    setCurrentUrl(url);

    // If it's a pure playlist URL (no single video ID attached)
    if (analysis.isPlaylistOnly) {
      setVideo(null);
      setShowChoicePrompt(false);
      setActiveView("playlist");

      try {
        const res = await fetch(
          getApiUrl(`/api/playlist-info?list=${encodeURIComponent(analysis.playlistId!)}`)
        );
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.data) {
            setPlaylist(result.data);
            setIsLoading(false);
            return;
          }
        }
        throw new Error("Falha ao carregar playlist");
      } catch (err: any) {
        setIsLoading(false);
        toast({
          title: "Erro na playlist",
          description:
            err.message || "Não foi possível carregar os dados da playlist.",
          variant: "destructive",
        });
        return;
      }
    }

    // If it's a video attached to a playlist (e.g. watch?v=...&list=...)
    if (analysis.isVideoWithPlaylist) {
      setShowChoicePrompt(true);
      setActiveView("video");

      // Fetch single video info
      fetchVideoData(analysis.cleanVideoUrl || url);

      // Also prefetch playlist info in parallel
      fetchPlaylistData(analysis.cleanPlaylistUrl || url);
      return;
    }

    // Normal single video (no playlist)
    setShowChoicePrompt(false);
    setPlaylist(null);
    setActiveView("video");
    await fetchVideoData(analysis.cleanVideoUrl || url, autoDownload);
  };

  const fetchVideoData = async (videoUrl: string, autoDownload = false) => {
    const analysis = parseYouTubeUrl(videoUrl);
    const videoId = analysis.videoId;
    if (!videoId) {
      setIsLoading(false);
      return;
    }

    let title = "Vídeo do YouTube";
    let channel = "YouTube";
    let duration = "";
    let views = "";
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    let artist: string | undefined = undefined;
    let album: string | undefined = undefined;
    let year: string | undefined = undefined;
    let rawTitle: string | undefined = undefined;

    try {
      const res = await fetch(getApiUrl(`/api/info?url=${encodeURIComponent(videoUrl)}`));
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

    // If autoDownload was requested on a normal single video
    if (autoDownload && !analysis.isVideoWithPlaylist) {
      setTimeout(() => {
        handleDownload("video", "1080p (Full HD)");
      }, 100);
    }
  };

  const fetchPlaylistData = async (playlistUrl: string) => {
    const analysis = parseYouTubeUrl(playlistUrl);
    if (!analysis.playlistId) return;

    try {
      const res = await fetch(
        getApiUrl(`/api/playlist-info?list=${encodeURIComponent(analysis.playlistId)}`)
      );
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          setPlaylist(result.data);
        }
      }
    } catch (err) {
      console.warn("Could not prefetch playlist:", err);
    }
  };

  const handleDownload = async (
    format: "video" | "audio",
    quality: string,
    meta?: { title?: string; artist?: string }
  ) => {
    if (!currentUrl || isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadSpeed("");
    setDownloadEta("");
    setDownloadMessage("Conectando ao YouTube...");
    setDownloadError(null);
    setDownloadReadyFile(null);

    toast({
      title: "Iniciando download...",
      description: `Processando ${
        format === "audio" ? "áudio MP3 com capa e tags" : quality
      }. Aguarde...`,
    });

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    try {
      const analysis = parseYouTubeUrl(currentUrl);
      const targetUrl = analysis.cleanVideoUrl || currentUrl;

      const startRes = await fetch(getApiUrl("/api/start-download"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
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
        if (startRes.status === 405) {
          setShowServerModal(true);
          throw new Error(
            "O GitHub Pages é estático e não pode processar downloads diretamente. Conecte sua URL do backend (Render) ou use o aplicativo para Windows (.exe)!"
          );
        }
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${startRes.status} ao iniciar download.`);
      }

      const startData = await startRes.json();
      const jobId = startData.jobId;

      pollIntervalRef.current = setInterval(async () => {
        try {
          const progRes = await fetch(getApiUrl(`/api/progress?jobId=${jobId}`));
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

            const filename =
              progData.filename ||
              (format === "audio" ? "audio.mp3" : "video.mp4");
            setDownloadReadyFile({ jobId, filename });

            const fileUrl = getApiUrl(`/api/file?jobId=${jobId}`);
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

  const handlePlaylistDownload = async (
    format: "video" | "audio",
    quality: string,
    selectedIds: string[],
    selectedIndices?: number[]
  ) => {
    if (!playlist || isPlaylistDownloading) return;

    setIsPlaylistDownloading(true);
    setPlaylistProgress(0);
    setPlaylistSpeed("");
    setPlaylistEta("");
    setPlaylistMessage("Iniciando download das faixas da playlist...");
    setPlaylistError(null);
    setPlaylistReadyFile(null);

    toast({
      title: "Iniciando download da playlist...",
      description: `Baixando ${selectedIds.length} faixas em formato ${
        format === "audio" ? "MP3 com tags e capas" : "MP4"
      } para arquivo ZIP.`,
    });

    if (playlistPollIntervalRef.current) {
      clearInterval(playlistPollIntervalRef.current);
    }

    try {
      const res = await fetch(getApiUrl("/api/start-playlist-download"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          format,
          quality,
          selectedVideoIds: selectedIds,
          selectedIndices,
        }),
      });

      if (!res.ok) {
        if (res.status === 405) {
          setShowServerModal(true);
          throw new Error(
            "O GitHub Pages é estático e não pode processar downloads diretamente. Conecte sua URL do backend (Render) ou use o aplicativo para Windows (.exe)!"
          );
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao iniciar download da playlist.");
      }

      const data = await res.json();
      const jobId = data.jobId;

      playlistPollIntervalRef.current = setInterval(async () => {
        try {
          const progRes = await fetch(getApiUrl(`/api/progress?jobId=${jobId}`));
          if (!progRes.ok) return;

          const progData = await progRes.json();

          if (progData.progress !== undefined) {
            setPlaylistProgress(progData.progress);
          }
          if (progData.speed) setPlaylistSpeed(progData.speed);
          if (progData.eta) setPlaylistEta(progData.eta);
          if (progData.message) setPlaylistMessage(progData.message);

          if (progData.status === "ready") {
            if (playlistPollIntervalRef.current) {
              clearInterval(playlistPollIntervalRef.current);
            }
            setPlaylistProgress(100);
            setPlaylistMessage("Playlist concluída! Salvando arquivo ZIP...");
            setIsPlaylistDownloading(false);

            const filename = progData.filename || `${playlist.title || "playlist"}.zip`;
            setPlaylistReadyFile({ jobId, filename });

            const fileUrl = getApiUrl(`/api/file?jobId=${jobId}`);
            const link = document.createElement("a");
            link.href = fileUrl;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast({
              title: "Playlist concluída!",
              description: `O arquivo ${filename} foi baixado com sucesso.`,
            });
          } else if (progData.status === "error") {
            if (playlistPollIntervalRef.current) {
              clearInterval(playlistPollIntervalRef.current);
            }
            setIsPlaylistDownloading(false);
            setPlaylistError(progData.error || "Falha no download da playlist.");
            toast({
              title: "Erro na playlist",
              description: progData.error || "Falha ao baixar músicas da playlist.",
              variant: "destructive",
            });
          }
        } catch (pollErr) {
          console.error("Playlist poll error:", pollErr);
        }
      }, 600);
    } catch (err: any) {
      setIsPlaylistDownloading(false);
      setPlaylistError(err.message || "Erro ao conectar com o servidor.");
      toast({
        title: "Erro ao processar playlist",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadSingleTrackFromPlaylist = (track: PlaylistEntry) => {
    setVideo({
      title: track.title,
      rawTitle: track.rawTitle,
      artist: track.artist,
      album: track.album,
      year: track.year,
      thumbnail: track.thumbnail,
      duration: track.duration || "",
      views: "",
      channel: track.channel || "",
    });
    setCurrentUrl(track.url || `https://www.youtube.com/watch?v=${track.id}`);
    setActiveView("video");
    setShowChoicePrompt(false);

    toast({
      title: "Música selecionada",
      description: `Configurando download individual de: ${track.title}`,
    });
  };

  const analysis = currentUrl ? parseYouTubeUrl(currentUrl) : null;
  const hasBoth = !!(analysis?.isVideoWithPlaylist && (video || playlist));

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-between">
      <div className="absolute inset-0 gradient-hero pointer-events-none" />

      <div className="relative z-10 flex-1">
        <header className="flex items-center justify-between max-w-4xl mx-auto px-4 pt-6 pb-2">
          <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-card/60 border border-border/60 backdrop-blur-md shadow-sm">
            <img src={bearLogo} alt="Bear Catch" className="h-5 w-auto" />
            <span className="font-semibold text-foreground text-sm tracking-tight">
              Bear Catch Downloader
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
              v2.5 Playlist Turbo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ServerSettingsModal
              open={showServerModal}
              onOpenChange={setShowServerModal}
              trigger={
                <Button
                  size="sm"
                  className="h-9 px-3.5 text-xs font-semibold gap-2 rounded-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 shadow-sm transition-all"
                >
                  <Server className="h-4 w-4 shrink-0 text-primary" />
                  <span>Conectar Servidor</span>
                  {getApiBaseUrl() ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </Button>
              }
            />
          </div>
        </header>

        <main className="container max-w-4xl mx-auto px-4 pt-8 pb-16 space-y-6">
          {isStaticGitHubPages() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Você está acessando pelo <strong>GitHub Pages</strong>. Para baixar músicas e vídeos, conecte seu backend do <strong>Render</strong> ou baixe o app para <strong>Windows (.exe)</strong>.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowServerModal(true)}
                  className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                >
                  <Server className="h-3.5 w-3.5 mr-1.5" /> Conectar Servidor
                </Button>
                <a
                  href="https://github.com/kassioben10-lgtm/bearcathdownloader/actions"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Laptop className="h-3.5 w-3.5" /> Baixar .exe
                </a>
              </div>
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-3"
          >
            <div className="flex items-center justify-center gap-3 mb-3">
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
            <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
              Baixe vídeos, faixas avulsas e <span className="text-foreground font-semibold">playlists completas</span> do YouTube em qualidade máxima com capas embutidas e tags automáticas.
            </p>

            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowServerModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs bg-card/70 hover:bg-card border border-border/70 hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground cursor-pointer shadow-sm"
              >
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>Status do Servidor:</span>
                {getApiBaseUrl() ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    ● Conectado ({getApiBaseUrl()})
                  </span>
                ) : isStaticGitHubPages() ? (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    ● Desconectado (Clique para conectar o Render)
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    ● Servidor Local Ativo
                  </span>
                )}
              </button>
            </div>
          </motion.div>

          <UrlInput
            onSubmit={handleSearch}
            isLoading={isLoading}
            isDownloading={isDownloading || isPlaylistDownloading}
          />

          {/* Interactive Choice Prompt when link contains a song in a playlist */}
          <AnimatePresence>
            {showChoicePrompt && (
              <PlaylistChoicePrompt
                key="choice-prompt"
                videoTitle={video?.title}
                playlistItemCount={playlist?.itemCount}
                onChooseSingle={() => {
                  setShowChoicePrompt(false);
                  setActiveView("video");
                }}
                onChoosePlaylist={() => {
                  setShowChoicePrompt(false);
                  setActiveView("playlist");
                }}
              />
            )}
          </AnimatePresence>

          {/* View Switcher Tabs (Only visible when link contains both single video & playlist) */}
          {hasBoth && !showChoicePrompt && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center"
            >
              <div className="flex items-center p-1 bg-card/80 border border-border/80 rounded-xl backdrop-blur-md shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveView("video")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all duration-200 ${
                    activeView === "video"
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Music className="h-4 w-4" />
                  Música Individual
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("playlist")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all duration-200 ${
                    activeView === "playlist"
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListMusic className="h-4 w-4" />
                  Playlist Completa {playlist?.itemCount ? `(${playlist.itemCount})` : ""}
                </button>
              </div>
            </motion.div>
          )}

          {/* Single Video View */}
          {activeView === "video" && video && (
            <motion.div
              key="video-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
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

          {/* Playlist View */}
          {activeView === "playlist" && playlist && (
            <motion.div
              key="playlist-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
            >
              <PlaylistPreview
                playlist={playlist}
                onDownloadPlaylist={handlePlaylistDownload}
                onDownloadSingleTrack={handleDownloadSingleTrackFromPlaylist}
                isDownloading={isPlaylistDownloading}
                downloadProgress={playlistProgress}
                downloadSpeed={playlistSpeed}
                downloadEta={playlistEta}
                downloadMessage={playlistMessage}
                downloadError={playlistError}
                downloadReadyFile={playlistReadyFile}
              />
            </motion.div>
          )}

          {/* Loading Indicator */}
          {isLoading && !video && !playlist && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Buscando informações do YouTube...
              </p>
            </div>
          )}

          {/* Features Grid (Shown when nothing is searched yet) */}
          {!video && !playlist && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6"
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
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
        <p>
          Bear Catch Downloader. Suporta download de faixas individuais e playlists completas em ZIP.
        </p>
      </footer>
    </div>
  );
};

export default Index;
