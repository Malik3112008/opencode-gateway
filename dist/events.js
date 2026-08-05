"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.events = void 0;
const fs = require("fs");
const { gatewayConfig } = require("./gateway-config");
const MAX_EVENTS = 10;
function log(entry) {
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry));
    try {
        fs.appendFileSync(gatewayConfig.eventsFile, line + "\n");
    }
    catch (e) {
        console.error("[events] append:", e.message);
    }
}
function readRecent() {
    try {
        const raw = fs.readFileSync(gatewayConfig.eventsFile, "utf8");
        const lines = raw.split("\n").filter(Boolean).slice(-MAX_EVENTS);
        return lines.map((l) => {
            try {
                return JSON.parse(l);
            }
            catch (_a) {
                return null;
            }
        }).filter(Boolean);
    }
    catch (_b) {
        return [];
    }
}
module.exports = { events: { log, readRecent } };
