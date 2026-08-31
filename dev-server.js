/**
 * 로컬 개발 서버 — `node dev-server.js` (기본 포트 8788)
 *
 * wrangler dev 는 Node 22 이상을 요구하므로, 그보다 낮은 환경에서도 로컬에서
 * 백테스트를 실제로 돌려볼 수 있도록 worker.js 의 두 가지 동작만 그대로 흉내냅니다.
 *   1) /api/proxy?url=... → yahoo.com 화이트리스트 프록시
 *   2) 그 외 모든 경로   → 이 폴더의 정적 파일
 * 배포에는 쓰지 않습니다. 프록시 규칙을 고칠 때는 worker.js 와 같이 고쳐주세요.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8788);
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

async function handleProxy(req, res, url) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
        return res.end();
    }
    const target = url.searchParams.get('url');
    const json = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(obj));
    };
    if (!target) return json(400, { error: 'Missing url parameter' });

    let decoded;
    try {
        decoded = decodeURIComponent(target);
        new URL(decoded);
    } catch {
        return json(400, { error: 'Invalid URL' });
    }
    if (!new URL(decoded).hostname.endsWith('yahoo.com')) return json(403, { error: 'Domain not allowed' });

    try {
        const upstream = await fetch(decoded, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, */*',
            },
        });
        const body = await upstream.text();
        res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60',
        });
        res.end(body);
    } catch (err) {
        json(502, { error: err.message });
    }
}

function serveStatic(res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    // 폴더 밖으로 나가는 경로 차단
    if (!file.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            // 배포 환경과 같은 404 페이지를 보여줍니다
            fs.readFile(path.join(ROOT, '404.html'), (e, page) => {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(e ? 'Not found' : page);
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
}

http.createServer((req, res) => {
    let url;
    try {
        // Host 헤더가 없는 요청도 들어오므로 기본값을 둡니다
        url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    } catch {
        res.writeHead(400).end('Bad request');
        return;
    }
    if (url.pathname === '/api/proxy') return handleProxy(req, res, url);
    serveStatic(res, url.pathname);
}).on('clientError', (err, socket) => {
    socket.destroy();
}).listen(PORT, () => {
    console.log(`금융 도구 개발 서버: http://localhost:${PORT}/  (Ctrl+C 로 종료)`);
});
