'use strict';

/* global WebSocket */

/**
 * Serve a console dist with a runtime engine release beside it, and drive it
 * in headless Chrome over the DevTools protocol. No dependencies: Node's http
 * server and its global WebSocket (Node 22+).
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
];

function findChrome() {
    return process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/**
 * Serve `hostDist` as the console, the release folder at
 * /engines-dist/<name>/, the runtime manifest at
 * /~registry/v1/engines/runtime, and a 404 for every other API call.
 *
 * @param {Object} options
 * @param {string} options.hostDist console dist built without the engine
 * @param {string} options.releaseDir <out>/<name> from build-engine-release
 * @param {Function} options.runtimeManifest (origin) => runtime manifest payload
 * @param {string} [options.inject] script injected before the app bundle
 */
function serveConsole({ hostDist, releaseDir, runtimeManifest, inject }) {
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, 'manifest.json'), 'utf8'));
    const enginePrefix = `/engines-dist/${manifest.name}/`;
    const requests = [];

    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const origin = `http://${request.headers.host}`;
        requests.push(`${request.method} ${url.pathname}`);

        const send = (status, body, type = 'application/json; charset=utf-8') => {
            response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            response.end(body);
        };

        if (url.pathname === '/fleetbase.config.json') {
            return send(200, JSON.stringify({ API_HOST: origin }));
        }
        if (url.pathname === '/~registry/v1/engines/runtime') {
            return send(200, JSON.stringify(runtimeManifest(origin)));
        }

        const file = url.pathname.startsWith(enginePrefix) ? path.join(releaseDir, url.pathname.slice(enginePrefix.length)) : path.join(hostDist, url.pathname);
        const root = url.pathname.startsWith(enginePrefix) ? releaseDir : hostDist;
        const resolved = path.resolve(file);

        if (resolved.startsWith(path.resolve(root)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            if (path.basename(resolved) === 'index.html') {
                return send(200, injectScript(fs.readFileSync(resolved, 'utf8'), inject), CONTENT_TYPES['.html']);
            }
            response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(resolved)] ?? 'application/octet-stream' });
            return fs.createReadStream(resolved).pipe(response);
        }

        if (request.method === 'GET' && !path.extname(url.pathname) && (request.headers.accept ?? '').includes('text/html')) {
            return send(200, injectScript(fs.readFileSync(path.join(hostDist, 'index.html'), 'utf8'), inject), CONTENT_TYPES['.html']);
        }

        return send(404, JSON.stringify({ errors: ['Not found'] }));
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ origin: `http://127.0.0.1:${port}`, requests, close: () => new Promise((done) => server.close(done)) });
        });
    });
}

function injectScript(html, inject) {
    if (!inject) {
        return html;
    }

    const appScript = /<script[^>]+src="[^"]*\/assets\/@fleetbase\/console(-[0-9a-f]+)?\.js"[^>]*><\/script>/;
    if (!appScript.test(html)) {
        throw new Error('index.html has no @fleetbase/console app script to inject before');
    }

    return html.replace(appScript, (tag) => `<script>${inject.replace(/<\/script/gi, '<\\/script')}</script>\n${tag}`);
}

/**
 * Launch headless Chrome and open a DevTools session on its first page.
 */
async function launchChrome(chromePath) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-engines-chrome-'));
    const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions'];
    const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });

    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    const deadline = Date.now() + 30000;
    while (!fs.existsSync(portFile) || fs.readFileSync(portFile, 'utf8').split('\n').length < 2) {
        if (Date.now() > deadline) {
            chrome.kill();
            throw new Error('Chrome did not start');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    const session = await connect(page.webSocketDebuggerUrl);

    session.close = async () => {
        session.socket.close();
        chrome.kill();
        await new Promise((resolve) => chrome.once('exit', resolve));
        fs.rmSync(userDataDir, { recursive: true, force: true });
    };

    return session;
}

function connect(url) {
    const socket = new WebSocket(url);
    const pending = new Map();
    const events = [];
    let nextId = 1;

    socket.addEventListener('message', (message) => {
        const data = JSON.parse(message.data);
        if (data.id && pending.has(data.id)) {
            const { resolve, reject } = pending.get(data.id);
            pending.delete(data.id);
            data.error ? reject(new Error(data.error.message)) : resolve(data.result);
        } else if (data.method) {
            events.push(data);
        }
    });

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });

    const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        }
        return result.result.value;
    };

    const waitFor = async (expression, { timeout = 180000, interval = 500 } = {}) => {
        const deadline = Date.now() + timeout;
        let last;
        while (Date.now() < deadline) {
            last = await evaluate(expression).catch((error) => ({ error: error.message }));
            if (last?.ready) {
                return last;
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
        throw new Error(`Timed out waiting: ${JSON.stringify(last)}`);
    };

    /**
     * Console messages and uncaught exceptions seen so far, as text.
     */
    const logs = () =>
        events
            .map((event) => {
                if (event.method === 'Runtime.consoleAPICalled') {
                    return `${event.params.type}: ${event.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`;
                }
                if (event.method === 'Runtime.exceptionThrown') {
                    return `exception: ${event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text}`;
                }
                return null;
            })
            .filter(Boolean);

    return new Promise((resolve, reject) => {
        socket.addEventListener('open', async () => {
            await send('Runtime.enable');
            await send('Page.enable');
            resolve({ socket, send, evaluate, waitFor, logs, events });
        });
        socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)));
    });
}

/**
 * Transpile this checkout's runtime-engine sources to loader.js modules, for a
 * host dist built with an older ember-core. The script defines them before
 * the app bundle and then ignores the app bundle's own copies of the same
 * names, so the boot runs this checkout's code. Babel comes from the
 * console checkout's ember-cli-babel.
 *
 * @param {string} consoleDir console checkout with node_modules
 * @param {Object<string, string>} modules module name → source file
 * @returns {string}
 */
function buildSourceOverlay(consoleDir, modules) {
    const babelDir = fs.realpathSync(path.join(consoleDir, 'node_modules', 'ember-cli-babel'));
    const resolve = (name) => require.resolve(name, { paths: [babelDir] });
    const babel = require(resolve('@babel/core'));

    const compiled = Object.entries(modules).map(([moduleId, file]) => {
        const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
            filename: file,
            babelrc: false,
            configFile: false,
            moduleIds: true,
            moduleId,
            plugins: [
                [resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
                [resolve('@babel/plugin-transform-class-static-block')],
                [resolve('@babel/plugin-transform-class-properties'), { loose: true }],
                [resolve('@babel/plugin-transform-private-methods'), { loose: true }],
                [resolve('@babel/plugin-transform-modules-amd'), { noInterop: true }],
            ],
        });
        return code;
    });

    return `(function () {
  var originalDefine = window.define;
  ${compiled.join('\n')}
  var pinned = ${JSON.stringify(Object.keys(modules))};
  // A distinct name: a local \`var define\` would be hoisted over the modules above.
  var guardedDefine = function (name) {
    if (pinned.indexOf(name) !== -1) { return; }
    return originalDefine.apply(this, arguments);
  };
  Object.keys(originalDefine).forEach(function (key) { guardedDefine[key] = originalDefine[key]; });
  window.define = guardedDefine;
})();`;
}

module.exports = { findChrome, serveConsole, launchChrome, buildSourceOverlay };
