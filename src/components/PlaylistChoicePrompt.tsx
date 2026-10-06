import { motion } from "framer-motion";
import { Music, ListMusic, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaylistChoicePromptProps {
  onChooseSingle: () => void;
  onChoosePlaylist: () => void;
  playlistItemCount?: number;
  videoTitle?: string;
}

const PlaylistChoicePrompt = ({
  onChooseSingle,
  onChoosePlaylist,
  playlistItemCount,
  videoTitle,
}: PlaylistChoicePromptProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -10 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-2xl mx-auto p-5 bg-card/90 border border-primary/40 rounded-2xl shadow-xl backdrop-blur-md space-y-4 glow-primary"
    >
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-display font-bold text-foreground">
            Música com Playlist Detectada!
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground">
            Este link aponta para uma música específica, mas também faz parte de uma playlist. O que você gostaria de baixar?
          </p>
        </div>
      </div>

      {videoTitle && (
        <div className="p-2.5 rounded-lg bg-background/50 border border-border text-xs text-muted-foreground truncate">
          Faixa atual: <span className="font-semibold text-foreground">{videoTitle}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Option 1: Single Music */}
        <button
          type="button"
          onClick={onChooseSingle}
          className="flex flex-col items-start p-4 rounded-xl bg-background/60 border border-border/80 hover:border-primary/60 hover:bg-primary/5 transition-all duration-200 group text-left shadow-sm"
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Music className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              Selecionar <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <h4 className="font-semibold text-sm text-foreground mb-1 group-hover:text-primary transition-colors">
            Baixar Somente Esta Música
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Download individual da faixa com capa HD embutida e metadados ID3 editáveis (MP3 320k ou MP4).
          </p>
        </button>

        {/* Option 2: Full Playlist */}
        <button
          type="button"
          onClick={onChoosePlaylist}
          className="flex flex-col items-start p-4 rounded-xl bg-background/60 border border-primary/30 hover:border-primary hover:bg-primary/5 transition-all duration-200 group text-left shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
              COMPLETA
            </span>
          </div>

          <div className="flex items-center justify-between w-full mb-2">
            <div className="p-2 rounded-lg bg-primary/20 text-primary group-hover:scale-110 transition-transform">
              <ListMusic className="h-4 w-4" />
            </div>
          </div>
          <h4 className="font-semibold text-sm text-foreground mb-1 group-hover:text-primary transition-colors">
            Baixar a Playlist Inteira
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {playlistItemCount
              ? `Baixa todas as ${playlistItemCount} músicas organizadas em um arquivo ZIP único.`
              : "Baixa todas as faixas da playlist organizadas e compactadas em um único arquivo ZIP."}
          </p>
        </button>
      </div>
    </motion.div>
  );
};

export default PlaylistChoicePrompt;
