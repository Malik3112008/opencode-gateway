"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tor = void 0;
const { execFile } = require("child_process");
const net = require("net");
const { gatewayConfig } = require("./gateway-config");
const PROXY_PORT = 9050;
const TOR_WAIT_MS = 20000;
function restartTor() {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = gatewayConfig.torRestartCommand.split(" ");
        const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
        const exe = isRoot ? cmd : 'sudo';
        const exeArgs = isRoot ? args : ['-n', cmd, ...args];
        execFile(exe, exeArgs, { timeout: 30000 }, (err) => {
            if (err) {
                console.error("[tor] restart failed:", err.message);
                reject(err);
            }
            else {
                resolve(true);
            }
        });
    });
}
function waitForTor(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || TOR_WAIT_MS);
    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            const sock = net.connect({ host: "127.0.0.1", port: PROXY_PORT });
            const timeout = setTimeout(() => {
                sock.destroy();
                reject(new Error("Tor connection timeout"));
            }, Math.max(1000, deadline - Date.now()));
            sock.once("connect", () => {
                clearTimeout(timeout);
                sock.destroy();
                resolve(true);
            });
            sock.once("error", () => {
                clearTimeout(timeout);
                sock.destroy();
                if (Date.now() > deadline) {
                    reject(new Error("Tor did not become ready within timeout"));
                }
                else {
                    setTimeout(tryConnect, 400);
                }
            });
        };
        tryConnect();
    });
}
async function restartAndWait() {
    const ok = await restartTor();
    await waitForTor(gatewayConfig.torWaitMs || 20000);
    const health = await getExitIp(true);
    if (!health || !health.ok) {
        throw new Error("Tor restart completed but health check failed");
    }
    ipCache = null;
    return true;
}
async function renewTorIp() {
    if (!gatewayConfig.newnymScript) {
        throw new Error("newnymScript not configured");
    }
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = gatewayConfig.newnymScript.split(" ");
        const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
        const exe = isRoot ? cmd : 'sudo';
        const exeArgs = isRoot ? args : ['-n', cmd, ...args];
        execFile(exe, exeArgs, { timeout: 15000 }, (err) => {
            if (err) {
                console.error("[tor] newnym failed:", err.message);
                reject(err);
            }
            else {
                resolve(true);
            }
        });
    });
}
async function renewIpAndWait() {
    await renewTorIp();
    // newnym script already waits ~5s for the circuit. Skip waitForTor here:
    // the gateway runs inside torsocks, so a direct connect() to the local
    // SOCKS port (127.0.0.1:9050) is itself routed through Tor and never
    // succeeds. Best-effort IP verification instead.
    const health = await getExitIp(true);
    ipCache = null;
    return health && health.ok ? health.ip : null;
}
let ipCache = null;
async function getExitIp(force) {
    if (!force && ipCache && Date.now() - ipCache.at < (gatewayConfig.torIpRefreshMs || 60000)) {
        return ipCache;
    }
    let ctrl = null;
    try {
        ctrl = new AbortController();
        const t = setTimeout(() => {
            if (ctrl) ctrl.abort();
        }, 10000);
        const resp = await fetch(gatewayConfig.torIpUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!resp.ok)
            throw new Error('HTTP ' + resp.status);
        const text = (await resp.text()).trim();
        ipCache = { ip: text, ok: true, at: Date.now() };
        return ipCache;
    }
    catch (e) {
        if (ctrl)
            ctrl.abort();
        ipCache = { ip: null, ok: false, error: e.message, at: Date.now() };
        return ipCache;
    }
}
module.exports = { tor: { restartTor, waitForTor, restartAndWait, renewTorIp, renewIpAndWait, getExitIp } };
