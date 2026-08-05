"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keys = void 0;
const fs = require("fs");
const { gatewayConfig } = require("./gateway-config");
const { usage } = require("./usage");
let pool = [];
let current = "";
let modelIndex = 0;
const MODEL_POOL = gatewayConfig.modelPool || [
    'deepseek-v4-flash-free',
    'big-pickle',
    'nemotron-3-ultra-free',
    'mimo-v2.5-free',
    'laguna-s-2.1-free',
    'ling-3.0-flash-free',
    'north-mini-code-free',
];
let advanceLock = null;
function readPool() {
    const raw = fs.readFileSync(gatewayConfig.keyFile, "utf8");
    pool = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith("sk-"));
    return pool;
}
function readAuthKey() {
    try {
        const cfg = JSON.parse(fs.readFileSync(gatewayConfig.authFile, "utf8"));
        const key = cfg && cfg.opencode && cfg.opencode.key;
        return typeof key === "string" && key ? key : "";
    }
    catch (_a) {
        return "";
    }
}
function writeAuthKey(key) {
    try {
        let cfg = {};
        try {
            cfg = JSON.parse(fs.readFileSync(gatewayConfig.authFile, "utf8"));
        }
        catch (_b) {
            cfg = {};
        }
        cfg.opencode = cfg.opencode || {};
        cfg.opencode.type = "api";
        cfg.opencode.key = key;
        fs.writeFileSync(gatewayConfig.authFile, JSON.stringify(cfg, null, 2));
    }
    catch (e) {
        console.error("[keys] writeAuthKey:", e.message);
    }
}
let watcher = null;
function startWatcher() {
    try {
        watcher = fs.watch(gatewayConfig.keyFile, { persistent: false }, (eventType) => {
            if (eventType !== 'change') return;
            const oldPool = pool.slice();
            readPool();
            const added = pool.filter((k) => !oldPool.includes(k));
            const removed = oldPool.filter((k) => !pool.includes(k));
            if (added.length || removed.length) {
                console.log(`[keys] Pool updated: +${added.length} added, -${removed.length} removed (total: ${pool.length})`);
                if (removed.includes(current) || (!pool.includes(current) && pool.length > 0)) {
                    current = pool[0] || "";
                    if (current) writeAuthKey(current);
                    console.log(`[keys] Active key changed to ...${current.slice(-6)}`);
                }
            }
        });
        watcher.on('error', (e) => {
            console.error('[keys] Watcher error:', e.message);
        });
    } catch (e) {
        console.error('[keys] Failed to start watcher:', e.message);
    }
}
function init() {
    readPool();
    const auth = readAuthKey();
    current = pool.includes(auth) ? auth : pool[0] || "";
    if (current)
        writeAuthKey(current);
    startWatcher();
    return current;
}
function getCurrent() {
    return current;
}
function getAll() {
    return pool;
}
async function withAdvanceLock(fn) {
    while (advanceLock) {
        await advanceLock;
    }
    let resolveLock;
    advanceLock = new Promise((resolve) => (resolveLock = resolve));
    try {
        return await fn();
    }
    finally {
        advanceLock = null;
        if (resolveLock)
            resolveLock();
    }
}
async function advance() {
    return withAdvanceLock(() => {
        if (pool.length === 0)
            return null;
        const idx = pool.indexOf(current);
        const start = (idx + 1) % pool.length;
        let i = start;
        while (i !== idx) {
            const candidate = pool[i];
            if (!usage.isCooldown(candidate) && !usage.isKeyTripped(candidate)) {
                current = candidate;
                writeAuthKey(current);
                return current;
            }
            i = (i + 1) % pool.length;
        }
        // All keys in cooldown or tripped - pick the one with earliest cooldown end
        let best = pool[start];
        let bestRetry = Infinity;
        for (const k of pool) {
            const info = usage.getKeyCooldownInfo ? usage.getKeyCooldownInfo(k) : null;
            if (info && info.retryAfter && info.retryAfter < bestRetry) {
                bestRetry = info.retryAfter;
                best = k;
            }
        }
        current = best;
        writeAuthKey(current);
        return current;
    });
}
async function advanceTo(key) {
    return withAdvanceLock(() => {
        if (!key || !pool.includes(key)) {
            return advance();
        }
        current = key;
        writeAuthKey(current);
        return current;
    });
}
function getNextModel() {
    return gatewayConfig.defaultModel || MODEL_POOL[0];
}
function getModelPool() {
    return MODEL_POOL;
}
function getModelIndex() {
    return modelIndex;
}
function getCount() {
    return pool.length;
}
module.exports = {
    keys: {
        init,
        getCurrent,
        getAll,
        getCount,
        advance,
        advanceTo,
        readPool,
        writeAuthKey,
        getNextModel,
        getModelPool,
        getModelIndex,
    },
};
