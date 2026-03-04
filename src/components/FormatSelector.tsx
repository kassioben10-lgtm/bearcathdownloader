import { motion } from "framer-motion";
import { Download, Film, Music, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface FormatSelectorProps {
  onDownload: (format: string, quality: string) => void;
  isDownloading?: boolean;
}

const videoQualities = ["2160p (4K)", "1080p (Full HD)", "720p (HD)", "480p", "360p"];
const audioQualities = ["320kbps", "256kbps", "192kbps", "128kbps"];

const FormatSelector = ({ onDownload, isDownloading }: FormatSelectorProps) => {
  const [format, setFormat] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState(videoQualities[1]);
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
      {/* Format Toggle */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1.5">
        <button
          onClick={() => handleFormatChange("video")}
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
          onClick={() => handleFormatChange("audio")}
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

      {/* Quality Selector */}
      <div className="relative">
        <button
          onClick={() => setShowQualities(!showQualities)}
          className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 text-foreground text-sm hover:border-primary/30 transition-colors duration-300"
        >
          <span>Qualidade: <span className="font-semibold">{quality}</span></span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showQualities ? "rotate-180" : ""}`} />
        </button>
        {showQualities && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden z-10 shadow-xl shadow-background/50"
          >
            {qualities.map((q) => (
              <button
                key={q}
                onClick={() => { setQuality(q); setShowQualities(false); }}
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

      {/* Download Button */}
      <Button
        variant="glow"
        size="lg"
        className="w-full text-base py-6"
        onClick={() => onDownload(format, quality)}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Download className="h-5 w-5 mr-2" />
            Baixar {format === "video" ? "Vídeo" : "Áudio"}
          </>
        )}
      </Button>
    </motion.div>
  );
};

export default FormatSelector;
