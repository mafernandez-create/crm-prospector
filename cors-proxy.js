#!/usr/bin/env node
// ============================================================
// CORS Proxy local para CRM Prospector GPF
// Uso: node cors-proxy.js
// Puerto: 3001
// ============================================================
// Añade automáticamente Access-Control-Allow-Origin: *
// para que el browser pueda recibir las respuestas desde
// http://localhost:8765
// ============================================================

const http = require('http');
const https = require('https');
const urlModule = require('url');

const PORT = 3001;

http.createServer((req, res) => {
    // CORS headers en TODAS las respuestas
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // La URL destino viene como path: /https://target.com/path
    const rawPath = req.url.startsWith('/') ? req.url.slice(1) : req.url;
    const targetUrl = decodeURIComponent(rawPath);

    if (!targetUrl.startsWith('http')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'URL destino inválida: ' + targetUrl }));
        return;
    }

    const parsed = urlModule.parse(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.path,
        method: req.method || 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
            'Cache-Control': 'no-cache'
        },
        timeout: 15000
    };

    const proxyReq = lib.request(options, (proxyRes) => {
        const statusCode = proxyRes.statusCode;
        const contentType = proxyRes.headers['content-type'] || 'text/html; charset=utf-8';

        res.writeHead(statusCode, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'X-Proxied-From': parsed.hostname
        });

        proxyReq.on('error', () => {}); // ignorar errores tardíos
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(408);
            res.end('Timeout');
        }
    });

    proxyReq.on('error', (e) => {
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Proxy error: ' + e.message);
        }
    });

    proxyReq.end();

}).listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('✅ CORS Proxy arrancado en http://localhost:' + PORT);
    console.log('   Uso en CRM: fetch("http://localhost:3001/" + encodeURIComponent(url))');
    console.log('   Ctrl+C para detener');
    console.log('');
});
