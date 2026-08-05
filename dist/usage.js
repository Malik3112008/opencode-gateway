"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usage = void 0;
const fs = require("fs");
const path = require("path");
const { gatewayConfig } = require("./gateway-config");
function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}
const EMPTY_STATE = () => ({
    day: todayStr(),
    keys: {},
    models: {},
    modelCooldowns: {},
    updated: null,
    keyHealth: {},
});
let state = EMPTY_STATE();
let saveTimer = null;
let dirty = false;
const SAVE_DEBOUNCE_MS = 1000;
const CIRCUIT_BREAKER_FAILURES = 3;
const CIRCUIT_BREAKER_TRIP_SEC = 300;
const GLOBAL_COOLDOWN_MAX_SEC = 300;
let globalCooldownUntil = 0;
function save(flush) {
    state.updated = new Date().toISOString();
    dirty = true;
    if (flush) {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        writeFile();
        return;
    }
    if (saveTimer)
        return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        writeFile();
    }, SAVE_DEBOUNCE_MS);
}
function writeFile() {
    if (!dirty)
        return;
    dirty = false;
    try {
        const tmp = gatewayConfig.usageFile + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
        fs.renameSync(tmp, gatewayConfig.usageFile);
    }
    catch (e) {
        dirty = true;
        console.error("[usage] save:", e.message);
    }
}
process.on('exit', () => save(true));
process.on('SIGINT', () => { save(true); process.exit(0); });
process.on('SIGTERM', () => { save(true); process.exit(0); });
function load() {
    try {
        const raw = fs.readFileSync(gatewayConfig.usageFile, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === todayStr() && parsed.keys) {
            state = parsed;
            if (!state.modelCooldowns) state.modelCooldowns = {};
        }
        else if (parsed && parsed.day !== todayStr()) {
            state = EMPTY_STATE();
            state.day = todayStr();
        }
        else {
            state = EMPTY_STATE();
        }
    }
    catch (_a) {
        state = EMPTY_STATE();
    }
}
function keyInfo(key) {
    if (!state.keys[key]) {
        state.keys[key] = {
            status: "active",
            retryAfter: 0,
            requestsToday: 0,
            tokensToday: 0,
            lastUsed: null,
            lastPromptTokens: 0,
        };
    }
    return state.keys[key];
}
function getMarginalInput(key, inTokens) {
    const info = keyInfo(key);
    const inTok = inTokens || 0;
    const last = info.lastPromptTokens || 0;
    info.lastPromptTokens = inTok;
    save();
    if (last > 0 && inTok > last) {
        return inTok - last;
    }
    return inTok;
}
function healthInfo(key) {
    if (!state.keyHealth)
        state.keyHealth = {};
    if (!state.keyHealth[key]) {
        state.keyHealth[key] = {
            consecutiveFailures: 0,
            trippedUntil: 0,
            totalFailures: 0,
        };
    }
    return state.keyHealth[key];
}
function recordKeySuccess(key) {
    const h = healthInfo(key);
    h.consecutiveFailures = 0;
    h.trippedUntil = 0;
    save();
}
function recordKeyFailure(key) {
    const h = healthInfo(key);
    h.consecutiveFailures += 1;
    h.totalFailures += 1;
    if (h.consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
        h.trippedUntil = Math.floor(Date.now() / 1000) + CIRCUIT_BREAKER_TRIP_SEC;
    }
    save();
}
function isKeyTripped(key) {
    const h = state.keyHealth && state.keyHealth[key];
    if (!h)
        return false;
    if (h.trippedUntil > 0) {
        return Date.now() / 1000 < h.trippedUntil;
    }
    return false;
}
function resetKeyHealth(key) {
    if (state.keyHealth && state.keyHealth[key]) {
        state.keyHealth[key].consecutiveFailures = 0;
        state.keyHealth[key].trippedUntil = 0;
    }
    save();
}
function clearAllTrippedKeys() {
    if (!state.keyHealth)
        return;
    for (const key of Object.keys(state.keyHealth)) {
        resetKeyHealth(key);
    }
}
function markGlobalCooldown(retryAfterSec) {
    const max = gatewayConfig.maxCooldownSec || GLOBAL_COOLDOWN_MAX_SEC;
    const sec = Math.min(retryAfterSec || 3600, Math.min(max, GLOBAL_COOLDOWN_MAX_SEC));
    globalCooldownUntil = Math.floor(Date.now() / 1000) + sec;
}
function isGlobalCooldown() {
    return Date.now() / 1000 < globalCooldownUntil;
}
function getGlobalCooldownRemainingSec() {
    return Math.max(0, Math.floor(globalCooldownUntil - Date.now() / 1000));
}
function recordRequest(key, model) {
    const info = keyInfo(key);
    info.requestsToday += 1;
    info.lastUsed = new Date().toISOString();
    if (model) {
        state.models[model] = state.models[model] || {};
        state.models[model][key] = state.models[model][key] || {
            requests: 0,
            inTokens: 0,
            outTokens: 0,
            lastUsed: null,
        };
        const m = state.models[model][key];
        m.requests += 1;
        m.lastUsed = info.lastUsed;
    }
    save();
}
function recordTokens(key, model, inTokens, outTokens) {
    const info = keyInfo(key);
    info.tokensToday += (inTokens || 0) + (outTokens || 0);
    if (model && state.models[model] && state.models[model][key]) {
        const m = state.models[model][key];
        m.inTokens += inTokens || 0;
        m.outTokens += outTokens || 0;
    }
    save();
}
function markCooldown(key, retryAfterSec) {
    const info = keyInfo(key);
    info.status = "cooldown";
    const max = gatewayConfig.maxCooldownSec || 300;
    const sec = Math.min(retryAfterSec || 3600, max);
    info.retryAfter = Math.floor(Date.now() / 1000) + sec;
    save();
}
function clearCooldown(key) {
    const info = keyInfo(key);
    info.status = "active";
    info.retryAfter = 0;
    save();
}
function isCooldown(key) {
    const info = state.keys[key];
    if (!info || info.status !== "cooldown")
        return false;
    return Date.now() / 1000 < info.retryAfter;
}
function getKeyCooldownInfo(key) {
    return state.keys[key] || null;
}
function markModelCooldown(model, retryAfterSec) {
    const max = gatewayConfig.maxCooldownSec || 300;
    const sec = Math.min(retryAfterSec || 3600, max);
    state.modelCooldowns[model] = {
        retryAfter: Math.floor(Date.now() / 1000) + sec,
        model: model
    };
    save();
}
function clearModelCooldown(model) {
    delete state.modelCooldowns[model];
    save();
}
function isModelCooldown(model) {
    const info = state.modelCooldowns[model];
    if (!info)
        return false;
    return Date.now() / 1000 < info.retryAfter;
}
function getModelCooldown(model) {
    return state.modelCooldowns[model] || null;
}
function getModelCooldownRemainingSec(model) {
    const info = state.modelCooldowns[model];
    if (!info)
        return 0;
    return Math.max(0, Math.floor(info.retryAfter - Date.now() / 1000));
}
function getState() {
    return JSON.parse(JSON.stringify(state));
}
module.exports = {
    usage: {
        init: load,
        todayStr,
        recordRequest,
        recordTokens,
        getMarginalInput,
        markCooldown,
        clearCooldown,
        isCooldown,
        getKeyCooldownInfo,
        markModelCooldown,
        clearModelCooldown,
        isModelCooldown,
        getModelCooldown,
        getModelCooldownRemainingSec,
        getState,
        recordKeySuccess,
        recordKeyFailure,
        isKeyTripped,
        resetKeyHealth,
        clearAllTrippedKeys,
        markGlobalCooldown,
        isGlobalCooldown,
        getGlobalCooldownRemainingSec,
    },
};
