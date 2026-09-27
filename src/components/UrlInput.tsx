import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, Download, Clipboard, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isValidYouTubeUrl } from "@/lib/youtube";

interface UrlInputProps {
  onSubmit: (url: string, autoDownload?: boolean) => void;
  isLoading: boolean;
  isDownloading?: boolean;
}

const UrlInput = ({ onSubmit, isLoading, isDownloading }: UrlInputProps) => {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoDownload, setAutoDownload] = useState(true);

  // Auto-detect when URL is typed or pasted
  const handleUrlChange = (value: string) => {
    setUrl(value);
    const trimmed = value.trim();
    if (isValidYouTubeUrl(trimmed)) {
      // Auto-trigger if valid YouTube URL
      onSubmit(trimmed, autoDownload);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (isValidYouTubeUrl(text.trim())) {
          onSubmit(text.trim(), autoDownload);
        }
      }
    } catch {
      // Clipboard permission denied or not supported
    }
  };

  const handleSubmit = (e: React.FormEvent, forceDownload = false) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim(), forceDownload || autoDownload);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="w-full max-w-2xl mx-auto space-y-3"
    >
      <form onSubmit={(e) => handleSubmit(e, false)} className="relative group">
        <div className="absolute -inset-0.5 bg-primary/20 rounded-xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
        <div className="relative flex items-center gap-2 bg-card border border-border rounded-xl p-2 focus-within:border-primary/50 transition-colors duration-300">
          <Search className="ml-3 h-5 w-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (pasted && isValidYouTubeUrl(pasted.trim())) {
                setTimeout(() => onSubmit(pasted.trim(), autoDownload), 50);
              }
            }}
            placeholder="Cole o link do YouTube aqui..."
            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-base py-2 px-1"
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePaste}
            className="text-xs text-muted-foreground hover:text-foreground h-9 px-2.5 hidden sm:flex items-center gap-1.5"
            title="Colar da área de transferência"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                <span>Colado!</span>
              </>
            ) : (
              <>
                <Clipboard className="h-3.5 w-3.5" />
                <span>Colar</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="hero"
            size="lg"
            onClick={(e) => handleSubmit(e, true)}
            disabled={!url.trim() || isLoading || isDownloading}
            className="gap-2 font-semibold shadow-md shadow-primary/25"
          >
            {isLoading || isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Baixar Agora</span>
            <span className="sm:hidden">Baixar</span>
          </Button>
        </div>
      </form>

      {/* Auto-download preference switch */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer select-none hover:text-foreground transition-colors">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(e) => setAutoDownload(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary/25 h-3.5 w-3.5 accent-primary cursor-pointer"
          />
          <span>Iniciar download automaticamente ao colar link</span>
        </label>
        <span className="flex items-center gap-1 text-primary/80">
          <Sparkles className="h-3 w-3" />
          Suporta vídeos normais, Shorts e lives
        </span>
      </div>
    </motion.div>
  );
};

export default UrlInput;
