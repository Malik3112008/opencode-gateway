"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_VISION = exports.ALL_MODELS = exports.config = void 0;
exports.getModelEndpoint = getModelEndpoint;
exports.isAnthropicNativeModel = isAnthropicNativeModel;
const node_process_1 = __importDefault(require("node:process"));
exports.config = {
    apiKey: node_process_1.default.env.OPENCODE_GO_API_KEY || '',
    baseUrl: node_process_1.default.env.OPENCODE_GO_BASE_URL || 'https://opencode.ai/zen/v1',
    defaultModel: node_process_1.default.env.OPENCODE_MODEL || 'qwen3.6-plus',
    port: parseInt(node_process_1.default.env.PROXY_PORT || '4141', 10),
    rateLimit: {
        enabled: node_process_1.default.env.RATE_LIMIT_ENABLED === 'true',
        windowMs: parseInt(node_process_1.default.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(node_process_1.default.env.RATE_LIMIT_MAX || '30', 10),
    },
};
exports.ALL_MODELS = [
    'big-pickle',
    'deepseek-v4-flash-free',
    'laguna-s-2.1-free',
    'ling-3.0-flash-free',
    'mimo-v2.5-free',
    'nemotron-3-ultra-free',
    'north-mini-code-free',
];
const ANTHROPIC_NATIVE = new Set(['minimax-m2.7', 'minimax-m2.5']);
// Models that do NOT support vision/image input. Add new text-only models here.
exports.NO_VISION = new Set([
    'deepseek-v4-pro',
    'deepseek-v4-flash',
]);
function getModelEndpoint(model) {
    if (ANTHROPIC_NATIVE.has(model)) {
        return `${exports.config.baseUrl}/messages`;
    }
    return `${exports.config.baseUrl}/chat/completions`;
}
function isAnthropicNativeModel(model) {
    return ANTHROPIC_NATIVE.has(model);
}
//# sourceMappingURL=config.js.map