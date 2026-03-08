import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Zap, Shield, Globe } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import VideoPreview, { type VideoInfo } from "@/components/VideoPreview";
import FormatSelector from "@/components/FormatSelector";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import bearLogo from "@/assets/bear-logo.png";

const features = [
  { icon: Zap, title: "Rápido", desc: "Downloads em alta velocidade" },
  { icon: Shield, title: "Seguro", desc: "Sem vírus ou malware" },
  { icon: Globe, title: "Sem limites", desc: "Baixe quantos quiser" },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const { toast } = useToast();

  const handleSearch = async (url: string) => {
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
    setCurrentUrl(url);

    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]+)/);
    const videoId = videoIdMatch?.[1] || "dQw4w9WgXcQ";

    let title = "Vídeo do YouTube";
    let channel = "YouTube";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || title;
        channel = data.author_name || channel;
      }
    } catch {
      // fallback
    }

    setVideo({
      title,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: "",
      views: "",
      channel,
    });
    setIsLoading(false);
  };

  const handleDownload = async (format: string, quality: string) => {
    if (!currentUrl) return;

    setIsDownloading(true);
    toast({
      title: "Processando download...",
      description: "Extraindo link direto do YouTube. Aguarde...",
    });

    try {
      // Try streaming mode first (direct download)
      const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download`;
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: currentUrl, format, quality, mode: 'stream' }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `Erro ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.status === 'success' && data.downloadUrl) {
          toast({
            title: `Download em ${data.quality || 'auto'}`,
            description: "Baixando arquivo...",
          });
          const dlRes = await fetch(data.downloadUrl);
          const blob = await dlRes.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = data.filename || "download";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        } else {
          throw new Error(data?.error || 'Erro desconhecido');
        }
      } else {
        // Got file stream — direct download!
        toast({
          title: "Download pronto!",
          description: "Arquivo sendo baixado...",
        });
        const blob = await response.blob();
        const filename = response.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
          || `download.${format === 'audio' ? 'mp3' : 'mp4'}`;
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      console.error("Download error:", err);
      toast({
        title: "Erro no download",
        description: err.message || "Não foi possível processar. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero pointer-events-none" />

      <div className="relative z-10">
        <header className="flex items-center justify-center pt-6 pb-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <img src={bearLogo} alt="Bear Catch" className="h-5 w-auto" />
            <span className="font-medium">Bear Catch Downloader</span>
          </div>
        </header>

        <main className="container max-w-4xl mx-auto px-4 pt-12 pb-20 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-4"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={bearLogo} alt="Bear Catch Logo" className="h-16 w-auto" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground tracking-tight">
              <span className="text-gradient">Bear Catch</span>{" "}
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
              <FormatSelector onDownload={handleDownload} isDownloading={isDownloading} />
            </div>
          )}

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

        <footer className="text-center py-8 text-muted-foreground text-sm border-t border-border/50">
          <p>Bear Catch Downloader. Respeite os direitos autorais.</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
