import { motion, AnimatePresence } from "framer-motion";
import { Download, Film, Music, ChevronDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

interface FormatSelectorProps {
  onDownload: (format: "video" | "audio", quality: string) => void;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadSpeed?: string;
  downloadEta?: string;
  downloadMessage?: string;
  downloadError?: string | null;
  downloadReadyFile?: { jobId: string; filename: string } | null;
}

const videoQualities = ["2160p (4K)", "1080p (Full HD)", "720p (HD)", "480p", "360p"];
const audioQualities = ["320kbps (Melhor)", "256kbps", "192kbps", "128kbps"];

const FormatSelector = ({
  onDownload,
  isDownloading = false,
  downloadProgress = 0,
  downloadSpeed = "",
  downloadEta = "",
  downloadMessage = "",
  downloadError = null,
  downloadReadyFile = null,
}: FormatSelectorProps) => {
  const [format, setFormat] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState(videoQualities[1]); // 1080p default
  const [showQualities, setShowQualities] = useState(false);

  const qualities = format === "video" ? videoQualities : audioQualities;

  const handleFormatChange = (newFormat: "video" | "audio") => {
    setFormat(newFormat);
    setQuality(newFormat === "video" ? videoQualities[1] : audioQualities[0]);
    setShowQualities(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="w-full max-w-2xl mx-auto space-y-4"
    >
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1.5">
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
          MP3 (Áudio)
        </button>
      </div>

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
              <span>{downloadSpeed ? `Velocidade: ${downloadSpeed}` : "Conectando..."}</span>
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
            <span className="font-medium">Download pronto! Arquivo enviado.</span>
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
        onClick={() => onDownload(format, quality)}
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
            Baixar {format === "video" ? `Vídeo (${quality})` : `Áudio MP3 (${quality})`}
          </>
        )}
      </Button>
    </motion.div>
  );
};

export default FormatSelector;
