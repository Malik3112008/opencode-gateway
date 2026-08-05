"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const DEFAULTS = {
    port: 4143,
    baseUrl: "https://opencode.ai/zen/v1",
    defaultModel: "deepseek-v4-flash-free",
    keyFile: "/home/someone/Documents/malik/API-KEY",
    authFile: "/home/someone/.local/share/opencode/auth.json",
    usageFile: path.join(__dirname, "..", "usage.json"),
    eventsFile: path.join(__dirname, "..", "events.jsonl"),
    historyFile: path.join(__dirname, "..", "history.jsonl"),
    historyMax: 10000,
    torIpUrl: "https://api.ipify.org",
    torIpRefreshMs: 60000,
    statsHours: 24,
    retries: 3,
    restartTorOnFailover: false,
    torRestartCommand: "systemctl restart tor",
    newnymScript: "bin/tor.newnym.sh",
    allowedModels: [],
    dailyAllowance: { requests: 200, tokens: 1000000 },
    maxCooldownSec: 300,
    probeIntervalMs: 120000,
    probeMaxTokens: 4,
    adminUser: "admin",
    adminPass: "change-me",
};
function sanitizeConfig(cfg) {
    const valid = Object.assign(Object.assign({}, DEFAULTS), cfg);
    valid.port = typeof valid.port === "number" && valid.port > 0 && valid.port < 65536 ? Math.floor(valid.port) : DEFAULTS.port;
    valid.retries = typeof valid.retries === "number" && valid.retries > 0 ? Math.floor(valid.retries) : DEFAULTS.retries;
    valid.maxCooldownSec = typeof valid.maxCooldownSec === "number" && valid.maxCooldownSec > 0 ? Math.floor(valid.maxCooldownSec) : DEFAULTS.maxCooldownSec;
    valid.probeIntervalMs = typeof valid.probeIntervalMs === "number" && valid.probeIntervalMs > 1000 ? Math.floor(valid.probeIntervalMs) : DEFAULTS.probeIntervalMs;
    valid.probeMaxTokens = typeof valid.probeMaxTokens === "number" && valid.probeMaxTokens > 0 ? Math.floor(valid.probeMaxTokens) : DEFAULTS.probeMaxTokens;
    valid.torIpRefreshMs = typeof valid.torIpRefreshMs === "number" && valid.torIpRefreshMs > 1000 ? Math.floor(valid.torIpRefreshMs) : DEFAULTS.torIpRefreshMs;
    valid.statsHours = typeof valid.statsHours === "number" && valid.statsHours > 0 ? Math.floor(valid.statsHours) : DEFAULTS.statsHours;
    valid.historyMax = typeof valid.historyMax === "number" && valid.historyMax > 100 ? Math.floor(valid.historyMax) : DEFAULTS.historyMax;
    valid.restartTorOnFailover = valid.restartTorOnFailover === true || valid.restartTorOnFailover === "true";
    valid.torRestartCommand = typeof valid.torRestartCommand === "string" && valid.torRestartCommand.trim() ? valid.torRestartCommand : DEFAULTS.torRestartCommand;
    valid.newnymScript = typeof valid.newnymScript === "string" && valid.newnymScript.trim() ? valid.newnymScript : "";
    valid.baseUrl = typeof valid.baseUrl === "string" && /^https?:\/\//.test(valid.baseUrl) ? valid.baseUrl : DEFAULTS.baseUrl;
    valid.defaultModel = typeof valid.defaultModel === "string" && valid.defaultModel.trim() ? valid.defaultModel : DEFAULTS.defaultModel;
    valid.allowedModels = Array.isArray(valid.allowedModels) ? valid.allowedModels.filter((m) => typeof m === "string") : [];
    valid.dailyAllowance = {
        requests: typeof (valid.dailyAllowance && valid.dailyAllowance.requests) === "number" && valid.dailyAllowance.requests > 0 ? Math.floor(valid.dailyAllowance.requests) : DEFAULTS.dailyAllowance.requests,
        tokens: typeof (valid.dailyAllowance && valid.dailyAllowance.tokens) === "number" && valid.dailyAllowance.tokens > 0 ? Math.floor(valid.dailyAllowance.tokens) : DEFAULTS.dailyAllowance.tokens,
    };
    valid.adminUser = typeof valid.adminUser === "string" ? valid.adminUser : DEFAULTS.adminUser;
    valid.adminPass = typeof valid.adminPass === "string" ? valid.adminPass : DEFAULTS.adminPass;
    return valid;
}
function loadGatewayConfig() {
    const confPath = path.join(__dirname, "..", "gateway.config.json");
    let file = {};
    try {
        file = JSON.parse(fs.readFileSync(confPath, "utf8"));
    }
    catch (_a) {
        console.warn("[gateway] gateway.config.json not readable, using defaults");
    }
    const cfg = sanitizeConfig(file);
    if (process.env.PROXY_PORT)
        cfg.port = parseInt(process.env.PROXY_PORT, 10);
    if (process.env.OPENCODE_GO_BASE_URL)
        cfg.baseUrl = process.env.OPENCODE_GO_BASE_URL;
    if (process.env.OPENCODE_MODEL)
        cfg.defaultModel = process.env.OPENCODE_MODEL;
    return cfg;
}
const gatewayConfig = loadGatewayConfig();
module.exports = { loadGatewayConfig, gatewayConfig };
