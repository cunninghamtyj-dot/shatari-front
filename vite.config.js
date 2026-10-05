import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

const removeCSPInDev = {
    name: 'remove-csp-in-dev',
    apply: 'serve',   // only runs during dev server, not build
    transformIndexHtml(html) {
        return html.replace(/<meta[^>]*Content-Security-Policy[^>]*>\s*/i, '');
    }
};

const serveJsonDir = {
    name: 'serve-json-dir',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use('/json', (req, res, next) => {
            const filePath = path.join(process.cwd(), 'json', req.url ?? '');

            // Prevent path traversal outside the json dir
            const jsonRoot = path.join(process.cwd(), 'json');
            if (!filePath.startsWith(jsonRoot)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('Not Found');
                    return;
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
            });
        });
    }
};

// Serve /data from the local back end's data directory (the `data` symlink), like nginx does in production.
// Last-Modified matters: the front end uses it to detect new snapshots.
const serveDataDir = {
    name: 'serve-data-dir',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use('/data', (req, res, next) => {
            const dataRoot = path.join(process.cwd(), 'data');
            // /data/cached/... is the same data under a separately-cached path (used for other-realm lookups).
            const urlPath = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/cached\//, '/');
            const filePath = path.join(dataRoot, urlPath);

            // Prevent path traversal outside the data dir
            if (!filePath.startsWith(dataRoot + path.sep)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('Not Found');
                    return;
                }
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end('Read error');
                        return;
                    }
                    res.setHeader('Content-Type', 'application/octet-stream');
                    res.setHeader('Last-Modified', stats.mtime.toUTCString());
                    res.setHeader('Cache-Control', 'no-cache');
                    // The back end stores data files gzipped; let the browser inflate them.
                    if (data[0] === 0x1f && data[1] === 0x8b) {
                        res.setHeader('Content-Encoding', 'gzip');
                    }
                    res.end(data);
                });
            });
        });
    }
};

export default defineConfig({
    plugins: [removeCSPInDev, serveJsonDir, serveDataDir],
    publicDir: 'public',
    build: {
        outDir: 'dist',
        sourcemap: true,
        emptyOutDir: true
    }
});
