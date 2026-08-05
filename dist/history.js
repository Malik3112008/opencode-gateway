"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.history = void 0;
const fs = require("fs");
const { gatewayConfig } = require("./gateway-config");
function log(entry) {
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n";
    try {
        fs.appendFileSync(gatewayConfig.historyFile, line);
        trimToMax();
    }
    catch (e) {
        console.error("[history] append:", e.message);
    }
}
let trimming = false;
function trimToMax() {
    const max = gatewayConfig.historyMax || 10000;
    if (trimming)
        return;
    try {
        const stat = fs.statSync(gatewayConfig.historyFile);
        if (stat.size < 2 * 1024 * 1024)
            return;
        trimming = true;
        const lines = fs.readFileSync(gatewayConfig.historyFile, "utf8").split("\n").filter(Boolean);
        if (lines.length > max) {
            fs.writeFileSync(gatewayConfig.historyFile, lines.slice(-max).join("\n") + "\n");
        }
        trimming = false;
    }
    catch (_a) {
        trimming = false;
    }
}
function readRecent(n) {
    try {
        const lines = fs.readFileSync(gatewayConfig.historyFile, "utf8").split("\n").filter(Boolean).slice(-(n || 200));
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
function hourlyBuckets(hours, now) {
    const recs = readRecent(gatewayConfig.historyMax);
    const start = now - hours * 3600 * 1000;
    const buckets = [];
    for (let i = 0; i < hours; i++) {
        const hStart = start + i * 3600 * 1000;
        buckets.push({ ts: new Date(hStart).toISOString(), req: 0, inTok: 0, outTok: 0 });
    }
    for (const r of recs) {
        const t = new Date(r.ts).getTime();
        if (t < start)
            continue;
        const idx = Math.min(hours - 1, Math.max(0, Math.floor((t - start) / (3600 * 1000))));
        buckets[idx].req += 1;
        buckets[idx].inTok += r.inTok || 0;
        buckets[idx].outTok += r.outTok || 0;
    }
    return buckets;
}
function dayBuckets(now) {
    const recs = readRecent(gatewayConfig.historyMax);
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const buckets = [];
    for (let i = 0; i < 24; i++) {
        const hStart = start + i * 3600 * 1000;
        buckets.push({ ts: new Date(hStart).toISOString(), req: 0, inTok: 0, outTok: 0 });
    }
    for (const r of recs) {
        const t = new Date(r.ts).getTime();
        if (t < start || t >= start + 24 * 3600 * 1000)
            continue;
        const idx = Math.floor((t - start) / (3600 * 1000));
        buckets[idx].req += 1;
        buckets[idx].inTok += r.inTok || 0;
        buckets[idx].outTok += r.outTok || 0;
    }
    return buckets;
}
function totals(now) {
    const recs = readRecent(gatewayConfig.historyMax);
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const dayStart = day.getTime();
    const t = { all: { req: 0, inTok: 0, outTok: 0 }, today: { req: 0, inTok: 0, outTok: 0 }, fail: 0 };
    for (const r of recs) {
        const ms = new Date(r.ts).getTime();
        t.all.req += 1;
        t.all.inTok += r.inTok || 0;
        t.all.outTok += r.outTok || 0;
        if (ms >= dayStart) {
            t.today.req += 1;
            t.today.inTok += r.inTok || 0;
            t.today.outTok += r.outTok || 0;
        }
        if (r.status && r.status >= 400)
            t.fail += 1;
    }
    return t;
}
module.exports = {
    history: {
        log,
        readRecent,
        hourlyBuckets,
        dayBuckets,
        totals,
        trim: trimToMax,
    },
};
