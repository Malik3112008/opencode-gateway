"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callOpenCodeGo = callOpenCodeGo;
exports.callOpenCodeGoAnthropic = callOpenCodeGoAnthropic;
exports.callOpenCodeGoStream = callOpenCodeGoStream;
exports.callOpenCodeGoAnthropicStream = callOpenCodeGoAnthropicStream;
exports.getUpstreamModel = getUpstreamModel;
const config_1 = require("./config");
const logger_1 = require("./logger");
async function apiFetch(endpoint, body, model, isAnthropic, apiKey) {
    const key = apiKey || config_1.config.apiKey;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'x-api-key': key,
        'x-anthropic-version': '2023-06-01',
    };
    const maskedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
        if (k === 'Authorization') {
            maskedHeaders[k] = 'Bearer ***' + v.slice(-4);
        }
        else if (k === 'x-api-key') {
            maskedHeaders[k] = '***' + v.slice(-4);
        }
        else {
            maskedHeaders[k] = v;
        }
    }
    (0, logger_1.log)('→ OPENCODE', `POST ${endpoint}`, logger_1.COLORS.magenta);
    (0, logger_1.log)('  MODEL', `${model} (isAnthropic: ${isAnthropic})`, logger_1.COLORS.magenta);
    (0, logger_1.log)('  HEADERS', JSON.stringify(maskedHeaders), logger_1.COLORS.dim);
    (0, logger_1.log)('  BODY', (0, logger_1.formatBody)(body), logger_1.COLORS.dim);
    return fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}
async function callOpenCodeGo(requestBody, model, apiKey) {
    const endpoint = (0, config_1.getModelEndpoint)(model);
    return apiFetch(endpoint, requestBody, model, false, apiKey);
}
async function callOpenCodeGoAnthropic(requestBody, model, apiKey) {
    const endpoint = (0, config_1.getModelEndpoint)(model);
    return apiFetch(endpoint, requestBody, model, true, apiKey);
}
async function callOpenCodeGoStream(requestBody, model, apiKey) {
    const endpoint = (0, config_1.getModelEndpoint)(model);
    return apiFetch(endpoint, requestBody, model, false, apiKey);
}
async function callOpenCodeGoAnthropicStream(requestBody, model, apiKey) {
    const endpoint = (0, config_1.getModelEndpoint)(model);
    return apiFetch(endpoint, requestBody, model, true, apiKey);
}
function getUpstreamModel(model) {
    return { model, isAnthropic: (0, config_1.isAnthropicNativeModel)(model) };
}
//# sourceMappingURL=opencode.js.map