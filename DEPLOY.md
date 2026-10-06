# 🚀 Guia Completo de Publicação e Deploy — Bear Catch Downloader

Este guia ensina como colocar o **Bear Catch Downloader** no ar de três formas diferentes:

1. **[Nuvem Completa e Grátis (Render)](#1-nuvem-completa-e-grátis-render)** *(Recomendado para usar como site online)*
2. **[Site no GitHub Pages](#2-site-no-github-pages)** *(Interface web hospedada pelo GitHub)*
3. **[Aplicativo Desktop Windows (.exe)](#3-aplicativo-windows-exe-pelo-github)** *(Download para você e seus amigos usarem no PC)*

---

## 1. Nuvem Completa e Grátis (Render)
> **Por que esta é a melhor opção para um site online?**  
> O YouTube Downloader precisa de ferramentas de sistema como `yt-dlp` e `ffmpeg`. No [Render.com](https://render.com), tudo roda dentro de um container Docker gratuito com Python, FFmpeg e Node.js juntos em um único link seguro HTTPS.

### Passo a passo rápido:
1. Crie uma conta gratuita em [render.com](https://render.com) (pode entrar com sua conta do GitHub).
2. Clique no botão azul **"New +"** no topo direito e escolha **"Blueprint"** (ou "Web Service").
3. Conecte o seu repositório `bearcathdownloader`.
4. O Render detectará automaticamente o arquivo [`render.yaml`](render.yaml) e [`Dockerfile`](Dockerfile) que já deixamos configurados!
5. Clique em **"Apply"** / **"Create Web Service"**.
6. Aguarde alguns minutos enquanto o Render baixa as dependências e compila o sistema.
7. **Pronto!** Você receberá um link público (exemplo: `https://bearcathdownloader.onrender.com`) com o site e o sistema de downloads funcionando 100%!

---

## 2. Site no GitHub Pages

O repositório já inclui a automação [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Toda vez que você enviar código para o GitHub (`git push`), ele publica o site sozinho!

### Como ativar no seu GitHub:
1. No seu repositório no GitHub, clique na aba **Settings** (Configurações).
2. No menu lateral esquerdo, clique em **Pages**.
3. Na seção **Build and deployment**, em **Source**, selecione:  
   👉 **GitHub Actions**
4. Faça um push ou vá até a aba **Actions** e execute o fluxo **Deploy to GitHub Pages**.
5. Em instantes, o seu site estará no ar no endereço:  
   `https://seu-usuario.github.io/bearcathdownloader/`

> **Nota importante para GitHub Pages:**  
> O GitHub Pages hospeda apenas arquivos estáticos (HTML/CSS/JS). Para os downloads funcionarem através do GitHub Pages, aponte a variável `VITE_API_URL` para o endereço do seu backend no Render (ex: `https://seu-app.onrender.com`).

---

## 3. Aplicativo Windows (.exe) pelo GitHub

Você pode gerar um instalador `.exe` e versão portátil sem precisar instalar nada pesado no seu PC, usando os servidores da nuvem do GitHub Actions!

### Gerando o `.exe` pelo GitHub Actions:
1. Vá até o seu repositório no GitHub e clique na aba **Actions**.
2. Na lista lateral esquerda, clique em **Build and Release Windows App (.exe)**.
3. No canto direito, clique em **Run workflow**.
4. Digite a versão desejada (ex: `v1.0.0`) e confirme em **Run workflow**.
5. O GitHub iniciará uma máquina virtual Windows, compilará o aplicativo e criará um **Release** na página inicial do repositório contendo o arquivo `.exe` pronto para download!

### Gerando o `.exe` localmente no seu PC:
Se preferir gerar no seu próprio computador Windows:
```bash
# 1. Instale o electron e electron-builder (caso ainda não tenha instalado)
npm install --save-dev electron electron-builder

# 2. Gere o executável
npm run electron:build
```
Os arquivos instalador e portátil serão gerados dentro da pasta `dist-electron/`.

---

## 🛠️ Resumo dos Arquivos Criados:
- [`Dockerfile`](Dockerfile): Configuração do container Linux com Node 20, Python 3, FFmpeg e yt-dlp.
- [`render.yaml`](render.yaml): Blueprint de 1 clique para o Render.
- [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): Publicação contínua no GitHub Pages.
- [`.github/workflows/release-exe.yml`](.github/workflows/release-exe.yml): Compilador automatizado de `.exe` no GitHub Actions.
- [`electron/main.cjs`](electron/main.cjs): Inicializador nativo do aplicativo desktop para Windows.
- [`src/lib/api.ts`](src/lib/api.ts): Conector de API universal (funciona tanto local quanto remoto).
