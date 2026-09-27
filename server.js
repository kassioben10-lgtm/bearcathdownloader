import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createApiMiddleware } from "./server/apiMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const distDir = path.join(__dirname, "dist");
const apiMiddleware = createApiMiddleware();

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  // Let API middleware handle /api/
  if (req.url && req.url.startsWith("/api/")) {
    apiMiddleware(req, res);
    return;
  }

  // Serve static files from dist
  let filePath = path.join(distDir, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, "index.html");
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Build de produção não encontrado. Execute 'npm run build' primeiro.");
  }
});

server.listen(PORT, () => {
  console.log(`Bear Catch Downloader rodando em http://localhost:${PORT}`);
});
