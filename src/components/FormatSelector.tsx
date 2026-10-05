import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Film,
  Music,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  User,
  Check,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { type VideoInfo } from "./VideoPreview";

interface FormatSelectorProps {
  onDownload: (
    format: "video" | "audio",
    quality: string,
    meta?: { title?: string; artist?: string }
  ) => void;
  videoInfo?: VideoInfo | null;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadSpeed?: string;
  downloadEta?: string;
  downloadMessage?: string;
  downloadError?: string | null;
  downloadReadyFile?: { jobId: string; filename: string } | null;
}

const videoQualities = ["2160p (4K)", "1080p (Full HD)", "720p (HD)", "480p", "360p"];
const audioQualities = [
  "320kbps (Melhor Qualidade)",
  "256kbps (Alta Qualidade)",
  "192kbps (Padrão)",
  "128kbps (Econômico)",
];

const FormatSelector = ({
  onDownload,
  videoInfo = null,
  isDownloading = false,
  downloadProgress = 0,
  downloadSpeed = "",
  downloadEta = "",
  downloadMessage = "",
  downloadError = null,
  downloadReadyFile = null,
}: FormatSelectorProps) => {
  const [format, setFormat] = useState<"video" | "audio">("audio");
  const [quality, setQuality] = useState(audioQualities[0]); // 320kbps default
  const [showQualities, setShowQualities] = useState(false);

  // Editable metadata for MP3
  const [artist, setArtist] = useState(videoInfo?.artist || "");
  const [title, setTitle] = useState(videoInfo?.title || "");

  // Update when video changes
  useEffect(() => {
    if (videoInfo) {
      setArtist(videoInfo.artist || videoInfo.channel || "");
      setTitle(videoInfo.title || "");
    }
  }, [videoInfo]);

  const qualities = format === "video" ? videoQualities : audioQualities;

  const handleFormatChange = (newFormat: "video" | "audio") => {
    setFormat(newFormat);
    setQuality(newFormat === "video" ? videoQualities[1] : audioQualities[0]);
    setShowQualities(false);
  };

  const handleResetMetadata = () => {
    if (videoInfo) {
      setArtist(videoInfo.artist || videoInfo.channel || "");
      setTitle(videoInfo.title || "");
    }
  };

  const cleanFilenamePreview =
    artist && title
      ? `${artist} - ${title}.mp3`
      : title
      ? `${title}.mp3`
      : "musica.mp3";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="w-full max-w-2xl mx-auto space-y-4"
    >
      {/* Format Switcher */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleFormatChange("audio")}
          disabled={isDownloading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
            format === "audio"
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Music className="h-4 w-4" />
          MP3 (Áudio + Capa & Tags)
        </button>
        <button
          type="button"
          onClick={() => handleFormatChange("video")}
          disabled={isDownloading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
            format === "video"
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Film className="h-4 w-4" />
          MP4 (Vídeo)
        </button>
      </div>

      {/* Quality Picker */}
      <div className="relative">
        <button
          type="button"
          disabled={isDownloading}
          onClick={() => setShowQualities(!showQualities)}
          className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm hover:border-primary/30 transition-colors duration-300 disabled:opacity-60"
        >
          <span>
            Qualidade: <span className="font-semibold text-primary">{quality}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              showQualities ? "rotate-180" : ""
            }`}
          />
        </button>

        {showQualities && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden z-20 shadow-xl shadow-background/50"
          >
            {qualities.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuality(q);
                  setShowQualities(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-150 ${
                  quality === q
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                {q}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Dedicated Music Metadata Card for MP3 */}
      {format === "audio" && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-card/90 border border-primary/20 rounded-xl space-y-3.5 backdrop-blur-sm shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Metadados da Música (ID3 Tags)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetMetadata}
                title="Restaurar valores automáticos"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Restaurar
              </button>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                100% Completo
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" /> Artista / Banda
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Nome do Artista"
                disabled={isDownloading}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5 text-primary" /> Nome da Música (Título)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nome da Música"
                disabled={isDownloading}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between pt-2 text-xs text-muted-foreground border-t border-border/40 gap-2">
            <div className="flex items-center gap-1.5 font-mono truncate max-w-sm sm:max-w-md">
              <span className="text-foreground/70 shrink-0">Arquivo gerado:</span>
              <span className="text-primary font-medium truncate" title={cleanFilenamePreview}>
                {cleanFilenamePreview}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
              <Check className="h-3 w-3" />
              <span>Capa HD embutida no MP3</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Real-time Progress Bar Card */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-card/80 border border-primary/30 rounded-xl space-y-3 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {downloadMessage || "Baixando arquivo..."}
              </span>
              <span className="font-bold text-primary font-mono text-base">
                {Math.round(downloadProgress)}%
              </span>
            </div>

            <Progress value={downloadProgress} className="h-2.5 bg-secondary overflow-hidden" />

            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>{downloadSpeed ? `Velocidade: ${downloadSpeed}` : "Processando..."}</span>
              <span>{downloadEta ? `Tempo restante: ${downloadEta}` : ""}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Ready State */}
      {downloadReadyFile && !isDownloading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-sm"
        >
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="font-medium">
              Download pronto! Arquivo: <span className="font-bold">{downloadReadyFile.filename}</span>
            </span>
          </div>
          <a
            href={`/api/file?jobId=${downloadReadyFile.jobId}`}
            download={downloadReadyFile.filename}
            className="text-xs text-primary hover:underline font-semibold"
          >
            Baixar novamente
          </a>
        </motion.div>
      )}

      {/* Error State */}
      {downloadError && !isDownloading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{downloadError}</span>
        </motion.div>
      )}

      {/* Main Download Button */}
      <Button
        variant="glow"
        size="lg"
        className="w-full text-base py-6 shadow-lg shadow-primary/20"
        onClick={() => onDownload(format, quality, format === "audio" ? { title, artist } : undefined)}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Baixando... ({Math.round(downloadProgress)}%)
          </>
        ) : (
          <>
            <Download className="h-5 w-5 mr-2" />
            {format === "video"
              ? `Baixar Vídeo MP4 (${quality})`
              : `Baixar Música MP3 (${quality})`}
          </>
        )}
      </Button>
    </motion.div>
  );
};

export default FormatSelector;
