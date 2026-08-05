"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLORS = void 0;
exports.log = log;
exports.formatBody = formatBody;
const COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    bold: '\x1b[1m',
};
exports.COLORS = COLORS;
function log(tag, msg, color = COLORS.reset) {
    const time = new Date().toLocaleTimeString();
    console.log(`${COLORS.dim}[${time}]${COLORS.reset} ${color}${tag}${COLORS.reset} ${msg}`);
}
function formatBody(body, maxLength = 50000) {
    const str = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    if (str.length > maxLength) {
        return str.slice(0, maxLength) + '...';
    }
    return str;
}
//# sourceMappingURL=logger.js.map