import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Zap, Shield, Globe } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import VideoPreview, { type VideoInfo } from "@/components/VideoPreview";
import FormatSelector from "@/components/FormatSelector";
import { useToast } from "@/hooks/use-toast";
import bearLogo from "@/assets/bear-logo.png";

const MOCK_VIDEO: VideoInfo = {
  title: "Big Buck Bunny - Exemplo de vídeo para demonstração",
  thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  duration: "10:35",
  views: "1.2M visualizações",
  channel: "Canal Exemplo",
};

const features = [
  { icon: Zap, title: "Rápido", desc: "Downloads em alta velocidade" },
  { icon: Shield, title: "Seguro", desc: "Sem vírus ou malware" },
  { icon: Globe, title: "Sem limites", desc: "Baixe quantos quiser" },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const { toast } = useToast();

  const handleSearch = async (url: string) => {
    // Validate YouTube URL
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/;
    if (!ytRegex.test(url)) {
      toast({
        title: "URL inválida",
        description: "Por favor, insira um link válido do YouTube.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500));

    // Extract video ID for thumbnail
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
    const videoId = videoIdMatch?.[1] || "dQw4w9WgXcQ";

    setVideo({
      ...MOCK_VIDEO,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    });
    setIsLoading(false);
  };

  const handleDownload = (format: string, quality: string) => {
    toast({
      title: "Download iniciado!",
      description: `Baixando ${format === "video" ? "vídeo" : "áudio"} em ${quality}...`,
    });
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute inset-0 gradient-hero pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-center pt-6 pb-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <img src={bearLogo} alt="Cath Bear" className="h-5 w-auto" />
            <span className="font-medium">Cath Bear Downloader</span>
          </div>
        </header>

        {/* Hero */}
        <main className="container max-w-4xl mx-auto px-4 pt-12 pb-20 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-4"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={bearLogo} alt="Cath Bear Logo" className="h-16 w-auto" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground tracking-tight">
              <span className="text-gradient">Cath Bear</span>{" "}
              Downloader
            </h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Cole o link, escolha o formato e baixe. Simples assim.
            </p>
          </motion.div>

          <UrlInput onSubmit={handleSearch} isLoading={isLoading} />

          {video && (
            <div className="space-y-6">
              <VideoPreview video={video} />
              <FormatSelector onDownload={handleDownload} />
            </div>
          )}

          {/* Features */}
          {!video && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8"
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                  className="flex flex-col items-center text-center p-6 bg-card/50 border border-border/50 rounded-xl"
                >
                  <div className="p-2.5 bg-primary/10 rounded-xl mb-3">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </main>

        {/* Footer */}
        <footer className="text-center py-8 text-muted-foreground text-sm border-t border-border/50">
          <p>Este serviço utiliza yt-dlp. Respeite os direitos autorais.</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
