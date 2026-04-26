const http      = require("http");
const https     = require("https");
const fs        = require("fs");
const path      = require("path");
const httpProxy = require("http-proxy");

const HTTP_PORT  = Number(process.env.HTTP_PORT  || 80);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);

const ROOT = __dirname;
const CERT_DIR = path.join(ROOT, "certs");

// ──────────────────────────────
// 1. SERVER CONFIG & FILE SERVE
// ──────────────────────────────

// Unified site config: domain, dir, port
const SITES = [
  { domain: "burapaphitak.ac.th",   dir: "burapaphitak",   port: 8080 },
  { domain: "srisilpasart.ac.th",   dir: "srisilpasart",   port: 8081 },
  { domain: "tcas-sim.com",         dir: "tcas-simulator", port: 8082 },
];

// Map hostnames to local directories
const VHOSTS = {};
for (const { domain, dir } of SITES) {
  VHOSTS[domain] = path.join(ROOT, dir);
  VHOSTS["www." + domain] = path.join(ROOT, dir);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function serveFilesFromRoot(req, res, siteRoot) {
  let pathname = req.url || "/";
  if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  const rawPath  = decodeURIComponent(pathname.split("?")[0]);
  const filePath = path.join(siteRoot, rawPath === "/" ? "index.html" : rawPath);

  if (!filePath.startsWith(siteRoot)) { send(res, 403, "Forbidden"); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, err.code === "ENOENT" ? 404 : 500,
           err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const mime = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, data, mime);
  });
}

function serveFiles(req, res) {
  const hostname = (req.headers.host || "").split(":")[0].toLowerCase();
  const siteRoot = VHOSTS[hostname];

  if (!siteRoot) {
    send(res, 404, [
      "Unknown host: " + hostname,
      "",
      "Available hosts:",
      ...Object.keys(VHOSTS).filter((_, i) => i % 2 === 0).map(h => "  " + h),
    ].join("\n"));
    return;
  }

  serveFilesFromRoot(req, res, siteRoot);
}

// ── Dev HTTP servers — one per site for independent tunnel forwarding ─────────
console.log("Domain groups:");
for (const site of SITES) {
  http.createServer((req, res) => {
    // In tunnel mode the Host header is the tunnel URL, serve the site directly
    const hostname = (req.headers.host || "").split(":")[0].toLowerCase();
    const root = VHOSTS[hostname] ?? path.join(ROOT, site.dir);
    serveFilesFromRoot(req, res, root);
  }).listen(site.port, "0.0.0.0", () => {
    const group = [`https://${site.domain}`, `https://www.${site.domain}`].join(", ");
    // Align port for pretty output
    const portStr = site.port.toString().padEnd(5, ' ');
    console.log(`Dev  :${portStr}${group}`);
  }).on("error", err => {
    console.warn(`Dev   :${site.port} → skipped (${err.code})`);
  });
}
console.log("");

// ── Production HTTP → redirect to HTTPS ───────────────────────────────────────
http.createServer((req, res) => {
  const hostname = (req.headers.host || "").split(":")[0];
  res.writeHead(301, { Location: `https://${hostname}${req.url}` });
  res.end();
}).listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP  :${HTTP_PORT}  → redirects to HTTPS`);
}).on("error", err => {
  console.warn(`HTTP  :${HTTP_PORT}  → skipped (${err.code})`);
});


// ── Production HTTPS ───────────────────────────────────────────────────────────
const certKey  = path.join(CERT_DIR, "www.burapaphitak.ac.th+5-key.pem"); // for server
const certFile = path.join(CERT_DIR, "www.burapaphitak.ac.th+5.pem");

if (fs.existsSync(certKey) && fs.existsSync(certFile)) {
  const TLS = { key: fs.readFileSync(certKey), cert: fs.readFileSync(certFile) };
  https.createServer(TLS, serveFiles)
    .listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(`HTTPS :${HTTPS_PORT} → https file server`);
    }).on("error", err => {
      console.warn(`HTTPS :${HTTPS_PORT} → skipped (${err.code})`);
    });
} else {
  console.log(`HTTPS :${HTTPS_PORT} → skipped (certs not found)\n`);
}

// ──────────────────────────────
// 2. PROXY CONFIG & LOGIC
// ──────────────────────────────

// ── Proxy server (port 8888) — routes by hostname to dev servers ──────────────
const proxy = httpProxy.createProxyServer({});

const PROXY_TARGETS = {};
for (const site of SITES) {
  const target = `http://127.0.0.1:${site.port}`;
  PROXY_TARGETS["www." + site.domain] = target;
  PROXY_TARGETS[site.domain] = target;
}




// ── Unified HTTP/HTTPS Proxy (port 8888) ──
const net = require("net");
const certKeyProxy  = path.join(CERT_DIR, "www.burapaphitak.ac.th+5-key.pem"); // for proxy
const certFileProxy = path.join(CERT_DIR, "www.burapaphitak.ac.th+5.pem");

let server8888;
if (fs.existsSync(certKeyProxy) && fs.existsSync(certFileProxy)) {
  const TLS_PROXY = { key: fs.readFileSync(certKeyProxy), cert: fs.readFileSync(certFileProxy) };
  server8888 = http.createServer((req, res) => {
    const hostname = (req.headers.host || "").split(":")[0].toLowerCase();
    const target = PROXY_TARGETS[hostname] || `${req.connection.encrypted ? 'https' : 'http'}://${hostname}`;
    proxy.web(req, res, { target, secure: false }, (err) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Proxy error: " + (err && err.message));
    });
  });

  // Handle HTTPS tunneling (CONNECT)
  server8888.on('connect', (req, clientSocket, head) => {
    const [host, port] = req.url.split(":");
    const serverPort = port || 443;
    const serverSocket = net.connect(serverPort, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on('error', (err) => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });
  });

  server8888.listen(8888, "0.0.0.0", () => {
    console.log("Proxy :8888  → HTTP/HTTPS proxy to dev servers & external sites");
    console.log("  (set proxy to http://<your-mac-ip>:8888 and install cert for HTTPS sniffing)");
  }).on("error", err => {
    console.warn(`Proxy :8888  → skipped (${err.code})`);
  });
} else {
  // Fallback: no certs, only HTTP proxy (no HTTPS sniffing)
  server8888 = http.createServer((req, res) => {
    const hostname = (req.headers.host || "").split(":")[0].toLowerCase();
    const target = PROXY_TARGETS[hostname] || `${req.connection.encrypted ? 'https' : 'http'}://${hostname}`;
    proxy.web(req, res, { target, secure: false }, (err) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Proxy error: " + (err && err.message));
    });
  });
  server8888.on('connect', (req, clientSocket, head) => {
    const [host, port] = req.url.split(":");
    const serverPort = port || 443;
    const serverSocket = net.connect(serverPort, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on('error', (err) => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });
  });
  server8888.listen(8888, "0.0.0.0", () => {
    console.log("Proxy :8888  → HTTP/HTTPS tunnel proxy (no certs, no sniffing)");
  }).on("error", err => {
    console.warn(`Proxy :8888  → skipped (${err.code})`);
  });
}
console.log("");

// ── Production HTTP → redirect to HTTPS ───────────────────────────────────────
http.createServer((req, res) => {
  const hostname = (req.headers.host || "").split(":")[0];
  res.writeHead(301, { Location: `https://${hostname}${req.url}` });
  res.end();
}).listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP  :${HTTP_PORT}  → redirects to HTTPS`);
}).on("error", err => {
  console.warn(`HTTP  :${HTTP_PORT}  → skipped (${err.code})`);
});

// ── Production HTTPS ───────────────────────────────────────────────────────────


if (fs.existsSync(certKey) && fs.existsSync(certFile)) {
  const TLS = { key: fs.readFileSync(certKey), cert: fs.readFileSync(certFile) };
  https.createServer(TLS, serveFiles)
    .listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(`HTTPS :${HTTPS_PORT} → https file server`);
    }).on("error", err => {
      console.warn(`HTTPS :${HTTPS_PORT} → skipped (${err.code})`);
    });
} else {
  console.log(`HTTPS :${HTTPS_PORT} → skipped (certs not found)\n`);
}
//~/Library/Application Support/mkcert
