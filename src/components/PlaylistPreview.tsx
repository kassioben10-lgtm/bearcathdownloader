import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListMusic,
  Music,
  Film,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  User,
  Clock,
  Check,
  ChevronDown,
  FolderArchive,
  Search,
  CheckSquare,
  Square,
  Layers,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type PlaylistInfo, type PlaylistEntry } from "@/lib/youtube";
import { getApiUrl } from "@/lib/api";

interface PlaylistPreviewProps {
  playlist: PlaylistInfo;
  onDownloadPlaylist: (
    format: "video" | "audio",
    quality: string,
    selectedIds: string[],
    selectedIndices?: number[]
  ) => void;
  onDownloadSingleTrack?: (track: PlaylistEntry) => void;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadSpeed?: string;
  downloadEta?: string;
  downloadMessage?: string;
  downloadError?: string | null;
  downloadReadyFile?: { jobId: string; filename: string } | null;
}

const videoQualities = ["1080p (Full HD)", "720p (HD)", "480p", "360p"];
const audioQualities = [
  "320kbps (Melhor Qualidade)",
  "256kbps (Alta Qualidade)",
  "192kbps (Padrão)",
  "128kbps (Econômico)",
];

const PlaylistPreview = ({
  playlist,
  onDownloadPlaylist,
  onDownloadSingleTrack,
  isDownloading = false,
  downloadProgress = 0,
  downloadSpeed = "",
  downloadEta = "",
  downloadMessage = "",
  downloadError = null,
  downloadReadyFile = null,
}: PlaylistPreviewProps) => {
  const [format, setFormat] = useState<"video" | "audio">("audio");
  const [quality, setQuality] = useState(audioQualities[0]);
  const [showQualities, setShowQualities] = useState(false);

  // Selected tracks IDs (all selected by default)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(playlist.entries.map((e) => e.id))
  );

  // Search filter inside the playlist
  const [searchQuery, setSearchQuery] = useState("");

  const qualities = format === "video" ? videoQualities : audioQualities;

  const handleFormatChange = (newFormat: "video" | "audio") => {
    setFormat(newFormat);
    setQuality(newFormat === "video" ? videoQualities[0] : audioQualities[0]);
    setShowQualities(false);
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return playlist.entries;
    const q = searchQuery.toLowerCase();
    return playlist.entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.artist && e.artist.toLowerCase().includes(q)) ||
        (e.rawTitle && e.rawTitle.toLowerCase().includes(q))
    );
  }, [playlist.entries, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIds.size === playlist.entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(playlist.entries.map((e) => e.id)));
    }
  };

  const toggleTrack = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedCount = selectedIds.size;
  const isAllSelected = selectedCount === playlist.entries.length && playlist.entries.length > 0;

  const handleStartDownload = () => {
    if (selectedCount === 0 || isDownloading) return;
    const chosenIds = Array.from(selectedIds);
    const chosenIndices = playlist.entries
      .filter((e) => selectedIds.has(e.id))
      .map((e) => e.index);
    onDownloadPlaylist(format, quality, chosenIds, chosenIndices);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto space-y-5"
    >
      {/* Playlist Header Card */}
      <div className="bg-card/85 backdrop-blur-md border border-border/80 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative w-full sm:w-44 aspect-video sm:aspect-square rounded-xl overflow-hidden bg-muted shrink-0 group border border-border/60">
            <img
              src={playlist.thumbnail || (playlist.entries[0]?.thumbnail ?? "")}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-white/10">
                <ListMusic className="h-3.5 w-3.5 text-primary" />
                Playlist
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="h-3 w-3" />
                Playlist do YouTube
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {playlist.itemCount} {playlist.itemCount === 1 ? "música" : "músicas"}
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground leading-snug line-clamp-2">
              {playlist.title}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {playlist.uploader && (
                <span className="flex items-center gap-1.5 font-medium text-foreground/85">
                  <User className="h-3.5 w-3.5 text-primary" />
                  {playlist.uploader}
                </span>
              )}
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <FolderArchive className="h-3 w-3" />
                Download em arquivo ZIP
              </span>
            </div>
          </div>
        </div>

        {/* Format Selector */}
        <div className="pt-2 border-t border-border/50 space-y-3">
          <div className="flex items-center gap-2 bg-background/60 border border-border rounded-xl p-1.5">
            <button
              type="button"
              onClick={() => handleFormatChange("audio")}
              disabled={isDownloading}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-300 ${
                format === "audio"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Music className="h-4 w-4" />
              Todas em MP3 (Capa HD + Tags)
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("video")}
              disabled={isDownloading}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-300 ${
                format === "video"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="h-4 w-4" />
              Todas em Vídeo MP4
            </button>
          </div>

          {/* Quality Selector */}
          <div className="relative">
            <button
              type="button"
              disabled={isDownloading}
              onClick={() => setShowQualities(!showQualities)}
              className="w-full flex items-center justify-between bg-background/70 border border-border rounded-xl px-4 py-2.5 text-foreground text-xs sm:text-sm hover:border-primary/40 transition-colors disabled:opacity-60"
            >
              <span>
                Qualidade do lote: <span className="font-semibold text-primary">{quality}</span>
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
                className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden z-20 shadow-xl"
              >
                {qualities.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setQuality(q);
                      setShowQualities(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs sm:text-sm transition-colors ${
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
        </div>
      </div>

      {/* Tracklist Card */}
      <div className="bg-card/85 backdrop-blur-md border border-border/80 rounded-2xl p-5 shadow-lg space-y-3.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">
              Músicas da Playlist
            </h3>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {selectedCount} de {playlist.entries.length} selecionadas
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={isDownloading}
              className="text-xs text-primary hover:underline font-medium flex items-center gap-1.5 transition-colors"
            >
              {isAllSelected ? (
                <>
                  <Square className="h-3.5 w-3.5" /> Desmarcar Todas
                </>
              ) : (
                <>
                  <CheckSquare className="h-3.5 w-3.5" /> Selecionar Todas
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Filter Search Input */}
        {playlist.entries.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar faixas pelo título ou artista..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background/70 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        )}

        {/* Scrollable Tracks List */}
        <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1.5 scrollbar-thin scrollbar-thumb-border">
          {filteredEntries.map((track, idx) => {
            const isSelected = selectedIds.has(track.id);
            return (
              <div
                key={track.id || idx}
                onClick={() => !isDownloading && toggleTrack(track.id)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "bg-primary/5 border-primary/30 hover:border-primary/50"
                    : "bg-background/40 border-border/50 opacity-60 hover:opacity-90"
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  disabled={isDownloading}
                  className="rounded border-border text-primary focus:ring-primary/25 h-4 w-4 accent-primary cursor-pointer shrink-0"
                />

                {/* Index */}
                <span className="font-mono text-xs text-muted-foreground w-6 text-center shrink-0">
                  {String(track.index || idx + 1).padStart(2, "0")}
                </span>

                {/* Thumbnail */}
                <div className="w-12 h-8 rounded-md bg-muted overflow-hidden shrink-0 relative border border-border/40">
                  {track.thumbnail ? (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <Music className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-medium text-foreground truncate">
                    {track.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {track.artist || track.channel || "Artista"}
                  </p>
                </div>

                {/* Duration */}
                {track.duration && (
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 hidden xs:inline">
                    {track.duration}
                  </span>
                )}

                {/* Quick single download action */}
                {onDownloadSingleTrack && !isDownloading && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadSingleTrack(track);
                    }}
                    title="Baixar somente esta música"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {filteredEntries.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              Nenhuma faixa encontrada com o termo "{searchQuery}".
            </div>
          )}
        </div>
      </div>

      {/* Real-time Progress Card */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-card/90 border border-primary/40 rounded-xl space-y-3 backdrop-blur-md shadow-md"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {downloadMessage || "Baixando playlist..."}
              </span>
              <span className="font-bold text-primary font-mono text-base">
                {Math.round(downloadProgress)}%
              </span>
            </div>

            <Progress value={downloadProgress} className="h-2.5 bg-secondary overflow-hidden" />

            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>{downloadSpeed ? `Velocidade: ${downloadSpeed}` : "Processando faixas..."}</span>
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
          className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-center gap-2.5 text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Playlist baixada com sucesso!</p>
              <p className="text-xs text-emerald-400/80">
                Arquivo: <span className="font-bold">{downloadReadyFile.filename}</span>
              </p>
            </div>
          </div>
          <a
            href={getApiUrl(`/api/file?jobId=${downloadReadyFile.jobId}`)}
            download={downloadReadyFile.filename}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar ZIP Novamente
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

      {/* Big Main Download Button */}
      <Button
        variant="glow"
        size="lg"
        className="w-full text-base py-6 shadow-xl shadow-primary/20 gap-2 font-semibold"
        onClick={handleStartDownload}
        disabled={isDownloading || selectedCount === 0}
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Baixando Playlist... ({Math.round(downloadProgress)}%)
          </>
        ) : (
          <>
            <FolderArchive className="h-5 w-5" />
            {format === "audio"
              ? `Baixar Playlist Completa (${selectedCount} faixas em MP3 ZIP)`
              : `Baixar Playlist Completa (${selectedCount} vídeos em MP4 ZIP)`}
          </>
        )}
      </Button>
    </motion.div>
  );
};

export default PlaylistPreview;
