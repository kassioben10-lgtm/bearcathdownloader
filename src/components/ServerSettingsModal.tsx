import { useState, useEffect } from "react";
import {
  Server,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Laptop,
  Save,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl, setCustomApiUrl, isStaticGitHubPages } from "@/lib/api";

interface ServerSettingsModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export default function ServerSettingsModal({
  open,
  onOpenChange,
  trigger,
}: ServerSettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const { toast } = useToast();

  const isControlled = open !== undefined;
  const show = isControlled ? open : isOpen;
  const setShow = isControlled ? onOpenChange! : setIsOpen;

  useEffect(() => {
    setUrlInput(getApiBaseUrl());
  }, [show]);

  const handleTestAndSave = async () => {
    const clean = urlInput.trim().replace(/\/+$/, "");
    if (!clean) {
      setCustomApiUrl("");
      setTestResult(null);
      toast({
        title: "Padrão restaurado",
        description: "Usando caminho relativo padrão da API.",
      });
      setShow(false);
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${clean}/api/health`, { method: "GET" });
      if (res.ok) {
        setCustomApiUrl(clean);
        setTestResult("success");
        toast({
          title: "Servidor Conectado!",
          description: "Conexão com o backend estabelecida com sucesso.",
        });
        setTimeout(() => {
          setShow(false);
        }, 800);
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err: any) {
      setTestResult("error");
      toast({
        title: "Falha na conexão",
        description: "Não foi possível conectar a esta URL. Verifique se o servidor está ativo no Render.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleForceSave = () => {
    setCustomApiUrl(urlInput.trim());
    toast({
      title: "URL salva",
      description: "A URL do backend foi configurada para as próximas requisições.",
    });
    setShow(false);
  };

  const isStatic = isStaticGitHubPages();

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-primary mb-1">
            <Server className="h-5 w-5" />
            <DialogTitle>Configurar Servidor de Download</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
            O GitHub Pages é um servidor estático que não roda Python ou FFmpeg. Para baixar vídeos pela Web, conecte sua URL do Render ou use o app Windows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isStatic && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Modo Estático do GitHub Pages Ativo</p>
                <p className="text-amber-300/80 mt-0.5">
                  Downloads diretos darão <strong>Erro 405</strong> até que um backend seja conectado ou você use o aplicativo para Windows.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>URL do Backend (Render ou Local)</span>
              {getApiBaseUrl() && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-normal">
                  <CheckCircle2 className="h-3 w-3" /> Configurado
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="https://seu-app.onrender.com"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setTestResult(null);
                }}
                className="text-xs font-mono h-9"
              />
              <Button
                size="sm"
                onClick={handleTestAndSave}
                disabled={testing}
                className="shrink-0 h-9"
              >
                {testing ? "Testando..." : "Salvar"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exemplo: <code className="text-primary font-mono">https://bearcathdownloader.onrender.com</code>
            </p>
          </div>

          <div className="p-3 rounded-xl bg-card border border-border/60 space-y-2.5 text-xs">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Opções Gratuitas para Download:
            </p>

            <a
              href="https://render.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-2 rounded-lg bg-background hover:bg-muted/50 border border-border/40 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                <span>
                  <strong>Criar servidor no Render</strong> (Grátis, leva 2 min)
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>

            <a
              href="https://github.com/kassioben10-lgtm/bearcathdownloader/actions"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-2 rounded-lg bg-background hover:bg-muted/50 border border-border/40 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-emerald-400" />
                <span>
                  <strong>Baixar Aplicativo Windows (.exe)</strong> (Já vem com tudo)
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-400 transition-colors" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
