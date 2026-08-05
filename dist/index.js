"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto = require("crypto");
const config_1 = require("./config");
const logger_1 = require("./logger");
const translate_1 = require("./translate");
const stream_1 = require("./stream");
const opencode_1 = require("./opencode");
const { gatewayConfig } = require("./gateway-config");
const { keys } = require("./keys");
const { tor } = require("./tor");
const { usage } = require("./usage");
const { events } = require("./events");
const { history } = require("./history");
const { renderDashboard } = require("./dashboard");
const { renderDocsPage, renderDocsIndex } = require("./docs");
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: false }));

// ── Init ────────────────────────────────────────────────────────────
const startedAt = Date.now();
const poolKey = keys.init();
usage.init();
if (poolKey) {
    (0, logger_1.log)('🔑 POOL', `Active key ...${poolKey.slice(-6)} (${keys.getAll().length} keys in pool)`, logger_1.COLORS.green);
} else {
    (0, logger_1.log)('🔑 POOL', 'No keys found in pool!', logger_1.COLORS.red);
}

// ── Rate Limiter ───────────────────────────────────────────────────
const requestTimestamps = [];
const modelLastRequest = new Map();
const MODEL_MIN_INTERVAL_MS = 2000;
function rateLimitMiddleware(req, res, next) {
    if (!config_1.config.rateLimit.enabled)
        return next();
    const now = Date.now();
    const windowStart = now - config_1.config.rateLimit.windowMs;
    while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
        requestTimestamps.shift();
    }
    if (requestTimestamps.length >= config_1.config.rateLimit.maxRequests) {
        const retryAfter = Math.ceil((requestTimestamps[0] + config_1.config.rateLimit.windowMs - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: { type: 'rate_limit_error', message: `Rate limit exceeded. Try again in ${retryAfter}s.` },
        });
    }
    requestTimestamps.push(now);
    next();
}
// ── Per-model rate limiter ──────────────────────────────────────────
async function enforceModelRateLimit(model) {
    const now = Date.now();
    const lastReq = modelLastRequest.get(model) || 0;
    const elapsed = now - lastReq;
    if (elapsed < MODEL_MIN_INTERVAL_MS) {
        const waitMs = MODEL_MIN_INTERVAL_MS - elapsed;
        (0, logger_1.log)('⏳ MODEL RATE', `${model} waiting ${waitMs}ms`, logger_1.COLORS.yellow);
        await new Promise((r) => setTimeout(r, waitMs));
    }
    modelLastRequest.set(model, Date.now());
}
// ── Logging Middleware ─────────────────────────────────────────────
function loggingMiddleware(req, _res, next) {
    const method = req.method;
    const url = req.url;
    const headers = {
        'content-type': req.headers['content-type'],
        'x-api-key': req.headers['x-api-key'] ? '***' + req.headers['x-api-key'].slice(-4) : undefined,
        authorization: req.headers['authorization'] ? 'Bearer ***' : undefined,
    };
    (0, logger_1.log)('← REQUEST', `${method} ${url}`, logger_1.COLORS.cyan);
    (0, logger_1.log)('  HEADERS', JSON.stringify(headers), logger_1.COLORS.dim);
    if (req.body && Object.keys(req.body).length > 0) {
        (0, logger_1.log)('  BODY', (0, logger_1.formatBody)(req.body), logger_1.COLORS.dim);
    }
    next();
}
app.use(loggingMiddleware);
// ── Admin session (cookie) ─────────────────────────────────────────
const SESSIONS = new Map();
const SESSION_COOKIE = 'gw_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function parseCookies(hdr) {
    const out = {};
    if (!hdr)
        return out;
    for (const part of hdr.split(';')) {
        const i = part.indexOf('=');
        if (i === -1)
            continue;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}
function pruneSessions() {
    const now = Date.now();
    for (const [t, s] of SESSIONS)
        if (s.exp <= now)
            SESSIONS.delete(t);
}
function sessionToken(req) {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}
function validSession(req) {
    pruneSessions();
    const tok = sessionToken(req);
    return !!(tok && SESSIONS.has(tok));
}
function createSession() {
    const tok = crypto.randomBytes(24).toString('hex');
    SESSIONS.set(tok, { exp: Date.now() + SESSION_TTL_MS });
    return tok;
}
function destroySession(req, res) {
    const tok = sessionToken(req);
    if (tok)
        SESSIONS.delete(tok);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
}
function requireSession(req, res, next) {
    if (validSession(req)) {
        const tok = sessionToken(req);
        SESSIONS.get(tok).exp = Date.now() + SESSION_TTL_MS;
        return next();
    }
    if (req.path === '/dashboard')
        return res.redirect('/login');
    return res.status(401).json({ error: { type: 'authentication_error', message: 'Login required.' } });
}
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login - Gateway</title>
<style>
  :root { color-scheme: dark; --bg:#0d1117; --card:#161b22; --border:#30363d; --fg:#c9d1d9; --muted:#8b949e; --accent:#58a6ff; --err:#da3633; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--bg); color: var(--fg); margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .box { background: var(--card); border:1px solid var(--border); border-radius:10px; padding:28px; width:320px; }
  h1 { font-size:16px; color:var(--accent); margin:0 0 4px; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 18px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input { width:100%; padding:9px 10px; border:1px solid var(--border); border-radius:6px; background:#0d1117; color:var(--fg); font-size:13px; outline:none; }
  input:focus { border-color: var(--accent); }
  button { width:100%; margin-top:18px; padding:10px; border:0; border-radius:6px; background:var(--accent); color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
  button:hover { filter: brightness(1.1); }
  .err { color:var(--err); font-size:12px; margin-top:12px; text-align:center; }
</style>
</head>
<body>
  <form class="box" method="post" action="/login">
    <h1>OpenCode Zen Gateway</h1>
    <p class="sub">Masuk untuk membuka dashboard</p>
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autofocus required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Masuk</button>
    {{ERROR}}
  </form>
</body>
</html>`;
function loginHtml(error) {
    return LOGIN_HTML.replace('{{ERROR}}', error ? '<div class="err">Username atau password salah.</div>' : '');
}
app.get('/login', (req, res) => {
    if (validSession(req))
        return res.redirect('/dashboard');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(loginHtml(req.query.error === '1'));
});
app.post('/login', (req, res) => {
    const u = String(req.body.username || '').trim();
    const p = String(req.body.password || '');
    if (u === gatewayConfig.adminUser && p === gatewayConfig.adminPass) {
        res.cookie(SESSION_COOKIE, createSession(), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS });
        return res.redirect('/dashboard');
    }
    return res.redirect('/login?error=1');
});
app.get('/logout', (req, res) => {
    destroySession(req, res);
    res.redirect('/login');
});
// ── Auth Middleware ─────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    // Skip auth for public & admin endpoints (admin handled by adminAuth on the route)
    if (req.method === 'GET' && (req.path === '/health' || req.path === '/v1/models' || req.path === '/usage' || req.path === '/stats' || req.path === '/dashboard' || req.path.startsWith('/docs')))
        return next();
    const apiKey = req.headers['x-api-key'] ||
        req.headers['authorization']?.replace('Bearer ', '') ||
        config_1.config.apiKey;
    if (!apiKey) {
        return res.status(401).json({
            error: { type: 'authentication_error', message: 'API key required. Set x-api-key header or OPENCODE_GO_API_KEY env var.' },
        });
    }
    // Store resolved key for downstream use
    req.resolvedApiKey = apiKey;
    next();
}
app.use(authMiddleware);
// ── Docs Routes ──────────────────────────────────────────────────────
app.get('/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDocsIndex());
});
app.get('/docs/:docKey', (_req, res) => {
    const docKey = _req.params.docKey;
    const html = renderDocsPage(`/docs/${docKey}`, docKey);
    if (html === null)
        return res.status(404).send('<h2 style="color:#da3633">Dokumentasi tidak ditemukan</h2>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});
// ── SSE Helpers ────────────────────────────────────────────────────
function writeSSE(res, eventType, data) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}
async function translateAndStreamOpenAI(req, upstream, res, model, usedKey) {
    const t0 = Date.now();
    (0, logger_1.log)('← OPENCODE', `Upstream status: ${upstream.status}, content-type: ${upstream.headers.get('content-type')}`, logger_1.COLORS.dim);
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aborted = false;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const state = {
        messageStartSent: false,
        contentBlockIndex: 0,
        contentBlockOpen: false,
        finished: false,
        toolCalls: {},
    };
    let usedIn = 0;
    let usedOut = 0;
    let rawLineCount = 0;
    const cleanup = () => {
        if (!aborted) {
            aborted = true;
            reader.cancel().catch(() => { /* ignore */ });
        }
    };
    req.on('close', cleanup);
    try {
        while (!aborted) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                rawLineCount++;
                if (rawLineCount <= 15) {
                    (0, logger_1.log)('← RAW', trimmed.slice(0, 200), logger_1.COLORS.dim);
                }
                if (!trimmed.startsWith('data: '))
                    continue;
                const dataStr = trimmed.slice(6);
                if (dataStr === '[DONE]') {
                    (0, logger_1.log)('← RAW', 'stream: [DONE]', logger_1.COLORS.green);
                    if (!state.finished) {
                        if (state.contentBlockOpen) {
                            writeSSE(res, 'content_block_stop', { type: 'content_block_stop', index: state.contentBlockIndex });
                        }
                        if (state.messageStartSent) {
                            writeSSE(res, 'message_delta', {
                                type: 'message_delta',
                                delta: { stop_reason: 'end_turn', stop_sequence: null },
                                usage: { output_tokens: usedOut },
                            });
                            writeSSE(res, 'message_stop', { type: 'message_stop' });
                        }
                    }
                    res.end();
                    return;
                }
                try {
                    const chunk = JSON.parse(dataStr);
                    if (chunk.usage) {
                        if (chunk.usage.prompt_tokens)
                            usedIn = chunk.usage.prompt_tokens;
                        if (chunk.usage.completion_tokens)
                            usedOut = chunk.usage.completion_tokens;
                    }
                    const events_ = (0, stream_1.translateOpenAIChunkToAnthropicEvents)(chunk, state);
                    for (const evt of events_) {
                        const detail = evt.type === 'content_block_delta' ? ' ' + JSON.stringify(evt.delta) : '';
                        (0, logger_1.log)('→ SSE', `${evt.type}${detail}`, logger_1.COLORS.cyan);
                        writeSSE(res, evt.type, evt);
                    }
                }
                catch {
                    // Parse error, skip
                }
            }
        }
        // Stream ended without [DONE]
        if (!aborted) {
            if (state.messageStartSent && !state.finished) {
                (0, logger_1.log)('← OPENCODE', 'Stream ended (no [DONE]), closing', logger_1.COLORS.yellow);
                if (state.contentBlockOpen) {
                    writeSSE(res, 'content_block_stop', { type: 'content_block_stop', index: state.contentBlockIndex });
                }
                writeSSE(res, 'message_delta', {
                    type: 'message_delta',
                    delta: { stop_reason: 'end_turn', stop_sequence: null },
                    usage: { output_tokens: usedOut },
                });
                writeSSE(res, 'message_stop', { type: 'message_stop' });
            }
            else if (!state.messageStartSent) {
                (0, logger_1.log)('← OPENCODE', 'Stream ended without any parseable events', logger_1.COLORS.red);
                // Close content block if open before error
                if (state.contentBlockOpen) {
                    writeSSE(res, 'content_block_stop', { type: 'content_block_stop', index: state.contentBlockIndex });
                }
                writeSSE(res, 'error', { type: 'error', error: { type: 'api_error', message: 'Upstream returned empty stream' } });
            }
            res.end();
        }
    }
    catch (err) {
        if (aborted)
            return;
        (0, logger_1.log)('← OPENCODE', `Stream error: ${err}`, logger_1.COLORS.red);
        // Ensure content block is closed before error
        if (state.contentBlockOpen) {
            writeSSE(res, 'content_block_stop', { type: 'content_block_stop', index: state.contentBlockIndex });
        }
        if (state.messageStartSent) {
            writeSSE(res, 'error', { type: 'error', error: { type: 'api_error', message: 'Stream error' } });
        }
        res.end();
    }
    finally {
        req.removeListener('close', cleanup);
        reader.releaseLock();
        const um5 = recordUsage(usedKey, model, usedIn, usedOut);
        recordHistory(model, usedKey, upstream, t0, true, '/v1/messages', um5.in, um5.out);
    }
}
function pipeSSEStream(req, upstream, res, onDone) {
    if (!upstream || !upstream.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        writeSSE(res, 'error', { type: 'error', error: { type: 'api_error', message: 'No response stream available' } });
        res.end();
        return;
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usedIn = 0;
    let usedOut = 0;
    let aborted = false;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const cleanup = () => {
        if (!aborted) {
            aborted = true;
            reader.cancel().catch(() => { /* ignore */ });
        }
    };
    req.on('close', cleanup);
    const finish = () => {
        if (!aborted) {
            if (onDone)
                onDone(usedIn, usedOut);
            res.end();
        }
    };
    const read = () => {
        reader.read().then(({ done, value }) => {
            if (aborted)
                return;
            if (done) {
                if (buffer.trim()) {
                    res.write(buffer + '\n');
                }
                finish();
                return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            let output = '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const dataStr = trimmed.slice(6);
                    if (dataStr !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(dataStr);
                            if (parsed && typeof parsed === 'object') {
                                if (parsed.type === 'message_start' && parsed.message && parsed.message.usage) {
                                    usedIn = parsed.message.usage.input_tokens || 0;
                                }
                                else if (parsed.type === 'message_delta' && parsed.usage) {
                                    usedOut = parsed.usage.output_tokens || 0;
                                }
                                else if (parsed.usage) {
                                    if (parsed.usage.prompt_tokens)
                                        usedIn = parsed.usage.prompt_tokens;
                                    if (parsed.usage.completion_tokens)
                                        usedOut = parsed.usage.completion_tokens;
                                }
                            }
                        }
                        catch {
                            // not JSON, skip
                        }
                    }
                }
                output += line + '\n';
            }
            if (output && !aborted) {
                res.write(output);
            }
            if (!aborted)
                read();
        }).catch((err) => {
            if (!aborted) {
                (0, logger_1.log)('← OPENCODE', `Stream error: ${err.message}`, logger_1.COLORS.red);
                finish();
            }
        });
    };
    read();
}
// ── Helpers ────────────────────────────────────────────────────────
function shortKey(k) {
    return k && k.length > 6 ? k.slice(-6) : (k || '');
}
function isModelAllowed(model) {
    if (!gatewayConfig.allowedModels || gatewayConfig.allowedModels.length === 0)
        return true;
    return gatewayConfig.allowedModels.includes(model);
}
function rejectModel(res, model) {
    return res.status(400).json({
        error: {
            type: 'invalid_request_error',
            message: `Model '${model}' tidak diizinkan. Hanya model free Zen: ${gatewayConfig.allowedModels.join(', ')}`,
        },
    });
}
function getApiKey(_req) {
    return keys.getCurrent() || config_1.config.apiKey;
}
function recordUsage(key, model, inTokens, outTokens) {
    if (!key)
        return { in: 0, out: 0 };
    const marginalIn = usage.getMarginalInput(key, inTokens);
    usage.recordRequest(key, model);
    if (inTokens !== undefined || outTokens !== undefined) {
        usage.recordTokens(key, model, marginalIn, outTokens || 0);
    }
    return { in: marginalIn, out: outTokens || 0 };
}
function recordHistory(model, usedKey, response, t0, isStream, path, inTok, outTok) {
    history.log({
        key: shortKey(usedKey),
        model,
        status: response && response.status ? response.status : 500,
        inTok: inTok || 0,
        outTok: outTok || 0,
        ms: Math.round(Date.now() - t0),
        stream: !!isStream,
        path,
    });
}
function isLimitResponse(response) {
    return response.status === 429;
}
function isAuthError(response) {
    return response.status === 401 || response.status === 403;
}
function getRetryAfter(response) {
    let ra = null;
    if (response && response.headers && typeof response.headers.get === 'function') {
        ra = response.headers.get('retry-after');
    }
    if (ra && /^\d+$/.test(ra))
        return parseInt(ra, 10);
    return 3600;
}
async function withFailover(callFn, model) {
    const maxAttempts = Math.max(1, gatewayConfig.retries);
    let last = null;
    let lastKey = "";
    let lastModel = model;
    let lastError = null;
    let currentModel = model;
    if (usage.isGlobalCooldown()) {
        const remaining = usage.getGlobalCooldownRemainingSec();
        (0, logger_1.log)('⏳ GLOBAL COOLDOWN', `IP rate-limited, waiting ${remaining}s`, logger_1.COLORS.yellow);
        await new Promise((r) => setTimeout(r, Math.min(remaining * 1000, 5000)));
    }
    const triedKeys = new Set();
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Skip keys that are tripped and advance past them
        while (usage.isKeyTripped(keys.getCurrent())) {
            if (triedKeys.size >= keys.getCount())
                break;
            triedKeys.add(keys.getCurrent());
            const next = await keys.advance();
            if (!next)
                break;
        }
        if (triedKeys.size >= keys.getCount()) {
            break;
        }
        if (usage.isModelCooldown(currentModel)) {
            const remaining = usage.getModelCooldownRemainingSec(currentModel);
            (0, logger_1.log)('⚠️ MODEL COOLDOWN', `${currentModel} cooling down for ${remaining}s`, logger_1.COLORS.yellow);
            currentModel = keys.getNextModel();
            continue;
        }
        const key = keys.getCurrent();
        const response = await callFn(key, currentModel);
        lastKey = key;
        lastModel = currentModel;
        triedKeys.add(key);
        if (!isLimitResponse(response) && !isAuthError(response)) {
            usage.recordKeySuccess(key);
            return { response, usedKey: key, usedModel: currentModel };
        }
        if (isAuthError(response)) {
            usage.recordKeyFailure(key);
            usage.markCooldown(key, 300);
            events.log({ type: 'auth_fail', key: shortKey(key), model: currentModel, status: response.status });
        }
        else {
            const retryAfterSec = getRetryAfter(response);
            usage.markCooldown(key, retryAfterSec);
            usage.markModelCooldown(currentModel, retryAfterSec);
            usage.markGlobalCooldown(retryAfterSec);
            events.log({ type: 'limit', key: shortKey(key), model: currentModel, status: response.status, retryAfterSec });
        }
        lastError = response;
        last = response;
        if (attempt < maxAttempts - 1 && !usage.isKeyTripped(key)) {
            try { await response.text(); } catch { /* drain */ }
            const next = await keys.advance();
            currentModel = keys.getNextModel();
            events.log({ type: 'failover', from: shortKey(key), to: shortKey(next), model: currentModel });
            if (isAuthError(response)) {
                await new Promise((r) => setTimeout(r, 500));
            }
            else if (gatewayConfig.restartTorOnFailover || gatewayConfig.newnymScript) {
                (0, logger_1.log)('🔄 TOR ROTATION', 'Rotating Tor IP', logger_1.COLORS.yellow);
                try {
                    if (gatewayConfig.newnymScript) {
                        await tor.renewIpAndWait();
                    }
                    else {
                        await tor.restartAndWait();
                    }
                    (0, logger_1.log)('🔄 TOR ROTATION', 'IP rotated successfully', logger_1.COLORS.green);
                }
                catch (e) {
                    (0, logger_1.log)('🔄 TOR ROTATION', `Rotation failed: ${e.message}`, logger_1.COLORS.red);
                }
            }
            else {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }
    if (!last && !lastError) {
        return { response: null, usedKey: lastKey, usedModel: lastModel, error: null };
    }
    return { response: last || lastError, usedKey: lastKey, usedModel: lastModel, error: lastError };
}
async function handleUpstreamError(res, response, ctx) {
    if (!response)
        return false;
    const isWrapper = typeof response === 'object' && 'response' in response;
    const upstreamResp = isWrapper ? response.response : response;
    if (!upstreamResp || upstreamResp.ok)
        return false;
    let errorText;
    try {
        errorText = await upstreamResp.text();
    } catch (e) {
        errorText = 'Unknown error';
    }
    const status = upstreamResp.status || (isWrapper && response.error ? response.error.status : 500);
    (0, logger_1.log)('← OPENCODE', `Error ${status}: ${errorText}`, logger_1.COLORS.red);
    let anthropicError;
    try {
        const parsed = JSON.parse(errorText);
        const openAIError = parsed?.error || parsed;
        if (typeof openAIError === 'object' && openAIError.message) {
            anthropicError = {
                type: translateErrorType(openAIError.type || openAIError.code || 'api_error'),
                message: openAIError.message,
            };
        }
        else {
            throw new Error('not a structured error');
        }
    }
    catch {
        anthropicError = { type: 'api_error', message: errorText };
    }
    if (ctx) {
        history.log({
            key: shortKey(ctx.usedKey),
            model: ctx.model,
            status: status,
            inTok: 0,
            outTok: 0,
            ms: Math.round(Date.now() - ctx.t0),
            stream: !!ctx.isStream,
            path: ctx.path,
            error: anthropicError.message.slice(0, 200),
        });
    }
    res.status(status).json({ error: anthropicError });
    return true;
}
function translateErrorType(openAIErrorType) {
    const map = {
        'invalid_request_error': 'invalid_request_error',
        'authentication_error': 'authentication_error',
        'permission_error': 'permission_error',
        'not_found': 'not_found',
        'rate_limit_error': 'rate_limit_error',
        'rate_limit': 'rate_limit_error',
        'insufficient_quota': 'permission_error',
        'server_error': 'api_error',
        'api_error': 'api_error',
        'context_length_exceeded': 'invalid_request_error',
    };
    return map[openAIErrorType] || 'api_error';
}
// ── POST /v1/messages ──────────────────────────────────────────────
app.post('/v1/messages', rateLimitMiddleware, async (req, res) => {
    try {
        const request = req.body;
        if (!request.messages || request.messages.length === 0) {
            return res.status(400).json({
                error: { type: 'invalid_request_error', message: 'messages is required' },
            });
        }
        let requestedModel = request.model || config_1.config.defaultModel;
        const { model: upstreamModel, isAnthropic } = (0, opencode_1.getUpstreamModel)(requestedModel);
        let model = upstreamModel;
        if (!request.model || request.model === config_1.config.defaultModel) {
            const roundRobinModel = keys.getNextModel();
            request.model = roundRobinModel;
            model = roundRobinModel;
        }
        if (!isModelAllowed(model))
            return rejectModel(res, model);
        const isStream = request.stream;
        await enforceModelRateLimit(model);
        const t0 = Date.now();
        (0, logger_1.log)('⚙️  ROUTE', `Model: ${model}, Stream: ${isStream}, API: ${isAnthropic ? 'Anthropic' : 'OpenAI'} (round-robin)`, logger_1.COLORS.yellow);
        if (isAnthropic) {
            if (isStream) {
                const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGoAnthropicStream)({ ...request, stream: true }, m, k), model);
                if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/messages' }))
                    return;
                const response = result.response;
                if (!response)
                    return;
                if (!response.body) {
                    return res.status(500).json({ error: { type: 'api_error', message: 'No response body' } });
                }
                (0, logger_1.log)('← OPENCODE', 'Streaming started (Anthropic passthrough)', logger_1.COLORS.green);
                return pipeSSEStream(req, response, res, (i, o) => {
                    const m = recordUsage(result.usedKey, model, i, o);
                    recordHistory(model, result.usedKey, response, t0, true, '/v1/messages', m.in, m.out);
                });
            }
            else {
                const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGoAnthropic)(request, m, k), model);
                if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/messages' }))
                    return;
                const response = result.response;
                if (!response)
                    return;
                const data = await response.json();
                (0, logger_1.log)('← OPENCODE', `Status: ${response.status}`, logger_1.COLORS.green);
                (0, logger_1.log)('  RESPONSE', (0, logger_1.formatBody)(data), logger_1.COLORS.green);
                const um = recordUsage(result.usedKey, model, data.usage?.input_tokens, data.usage?.output_tokens);
                recordHistory(model, result.usedKey, response, t0, false, '/v1/messages', um.in, um.out);
                return res.json(data);
            }
        }
        else {
            const openAIRequest = (0, translate_1.buildOpenAIRequest)(request, model);
            if (isStream) {
                const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGoStream)({ ...openAIRequest, stream: true }, m, k), model);
                if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/messages' }))
                    return;
                const response = result.response;
                if (!response)
                    return;
                if (!response.body) {
                    return res.status(500).json({ error: { type: 'api_error', message: 'No response body' } });
                }
                (0, logger_1.log)('← OPENCODE', 'Streaming started (translating OpenAI→Anthropic)', logger_1.COLORS.green);
                return await translateAndStreamOpenAI(req, response, res, model, result.usedKey);
            }
            else {
                const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGo)(openAIRequest, m, k), model);
                if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/messages' }))
                    return;
                const response = result.response;
                if (!response)
                    return;
                const openAIResponse = (await response.json());
                const anthropicResponse = (0, translate_1.convertToAnthropicResponse)(openAIResponse, request.model || config_1.config.defaultModel);
                (0, logger_1.log)('← OPENCODE', `Status: ${response.status}`, logger_1.COLORS.green);
                (0, logger_1.log)('  RESPONSE', (0, logger_1.formatBody)(anthropicResponse), logger_1.COLORS.green);
                const um2 = recordUsage(result.usedKey, model, openAIResponse.usage?.prompt_tokens, openAIResponse.usage?.completion_tokens);
                recordHistory(model, result.usedKey, response, t0, false, '/v1/messages', um2.in, um2.out);
                return res.json(anthropicResponse);
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: { type: 'api_error', message: error instanceof Error ? error.message : 'Internal server error' },
            });
        }
    }
});
// ── POST /v1/chat/completions (OpenAI-compatible) ──────────────────
app.post('/v1/chat/completions', rateLimitMiddleware, async (req, res) => {
    try {
        const openAIRequest = req.body;
        if (!openAIRequest.messages || openAIRequest.messages.length === 0) {
            return res.status(400).json({
                error: { type: 'invalid_request_error', message: 'messages is required' },
            });
        }
        let requestedModel = openAIRequest.model || config_1.config.defaultModel;
        const { model: upstreamModel } = (0, opencode_1.getUpstreamModel)(requestedModel);
        let model = upstreamModel;
        if (!openAIRequest.model || openAIRequest.model === config_1.config.defaultModel) {
            const roundRobinModel = keys.getNextModel();
            openAIRequest.model = roundRobinModel;
            model = roundRobinModel;
        }
        if (!isModelAllowed(model))
            return rejectModel(res, model);
        const isStream = openAIRequest.stream;
        await enforceModelRateLimit(model);
        const t0 = Date.now();
        (0, logger_1.log)('⚙️  ROUTE', `[OpenAI] Model: ${model}, Stream: ${isStream} (round-robin)`, logger_1.COLORS.yellow);
        if (isStream) {
            const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGoStream)({ ...openAIRequest, stream: true }, m, k), model);
            if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/chat/completions' }))
                return;
            const response = result.response;
            if (!response)
                return;
            if (!response.body) {
                return res.status(500).json({ error: { type: 'api_error', message: 'No response body' } });
            }
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let usedIn = 0;
            let usedOut = 0;
            let aborted = false;
            const cleanup = () => {
                if (!aborted) {
                    aborted = true;
                    reader.cancel().catch(() => { /* ignore */ });
                }
            };
            req.on('close', cleanup);
            try {
                while (!aborted) {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.trim()) {
                            res.write(buffer + '\n');
                        }
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (aborted)
                            break;
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const dataStr = trimmed.slice(6);
                            if (dataStr !== '[DONE]') {
                                try {
                                    const chunk = JSON.parse(dataStr);
                                    if (chunk && chunk.usage) {
                                        if (chunk.usage.prompt_tokens)
                                            usedIn = chunk.usage.prompt_tokens;
                                        if (chunk.usage.completion_tokens)
                                            usedOut = chunk.usage.completion_tokens;
                                    }
                                }
                                catch {
                                    // skip
                                }
                            }
                        }
                        res.write(line + '\n');
                    }
                }
            }
            catch (err) {
                if (!aborted) {
                    (0, logger_1.log)('← OPENCODE', `Stream error: ${err.message}`, logger_1.COLORS.red);
                }
            }
            finally {
                req.removeListener('close', cleanup);
                if (!res.writableEnded)
                    res.end();
                const um3 = recordUsage(result.usedKey, model, usedIn, usedOut);
                recordHistory(model, result.usedKey, response, t0, true, '/v1/chat/completions', um3.in, um3.out);
            }
        }
        else {
            const result = await withFailover((k, m) => (0, opencode_1.callOpenCodeGo)(openAIRequest, m, k), model);
            if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream, path: '/v1/chat/completions' }))
                return;
            const response = result.response;
            if (!response)
                return;
            const data = await response.json();
            (0, logger_1.log)('← OPENCODE', `Status: ${response.status}`, logger_1.COLORS.green);
            const um4 = recordUsage(result.usedKey, model, data.usage?.prompt_tokens, data.usage?.completion_tokens);
            recordHistory(model, result.usedKey, response, t0, false, '/v1/chat/completions', um4.in, um4.out);
            return res.json(data);
        }
    }
    catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: { type: 'api_error', message: error instanceof Error ? error.message : 'Internal server error' },
            });
        }
    }
});
// ── POST /v1/embeddings ────────────────────────────────────────────
app.post('/v1/embeddings', rateLimitMiddleware, async (req, res) => {
    try {
        const { model } = (0, opencode_1.getUpstreamModel)(req.body?.model || config_1.config.defaultModel);
        if (!isModelAllowed(model))
            return rejectModel(res, model);
        await enforceModelRateLimit(model);
        const t0 = Date.now();
        const endpoint = `${config_1.config.baseUrl}/embeddings`;
        (0, logger_1.log)('→ OPENCODE', `POST ${endpoint} [Model: ${model}]`, logger_1.COLORS.magenta);
        const result = await withFailover((k, m) => fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${k}`,
            },
            body: JSON.stringify({ ...req.body, model: m }),
        }), model);
        if (await handleUpstreamError(res, result, { model, usedKey: result.usedKey, t0, isStream: false, path: '/v1/embeddings' }))
            return;
        const response = result.response;
        if (!response)
            return;
        if (!response.ok) {
            const errorText = await response.text();
            (0, logger_1.log)('← OPENCODE', `Embedding error ${response.status}: ${errorText}`, logger_1.COLORS.red);
            recordHistory(model, result.usedKey, response, t0, false, '/v1/embeddings', 0, 0);
            return res.status(response.status).json({ error: { type: 'api_error', message: errorText } });
        }
        const data = await response.json();
        const um6 = recordUsage(result.usedKey, model, data.usage?.prompt_tokens, undefined);
        recordHistory(model, result.usedKey, response, t0, false, '/v1/embeddings', um6.in, 0);
        return res.json(data);
    }
    catch (error) {
        console.error('Embedding error:', error);
        if (!res.headersSent) {
            return res.status(500).json({
                error: { type: 'api_error', message: error instanceof Error ? error.message : 'Internal server error' },
            });
        }
    }
});
// ── GET /v1/models ─────────────────────────────────────────────────
app.get('/v1/models', (_req, res) => {
    return res.json({
        object: 'list',
        data: config_1.ALL_MODELS.map((id) => ({ id, object: 'model' })),
    });
});
// ── GET /usage ─────────────────────────────────────────────────────
app.get('/usage', requireSession, (_req, res) => {
    const state = usage.getState();
    const nowSec = Math.floor(Date.now() / 1000);
    // Ensure all pool keys are in state.keys
    const allPoolKeys = keys.getAll();
    for (const k of allPoolKeys) {
        if (!state.keys[k]) {
            state.keys[k] = {
                status: 'active',
                retryAfter: 0,
                requestsToday: 0,
                tokensToday: 0,
                lastUsed: null,
            };
        }
    }
    const safeKeys = {};
    for (const [k, info] of Object.entries(state.keys)) {
        info.isCurrent = k === keys.getCurrent();
        info.cooldownRemainingSec = info.status === 'cooldown' ? Math.max(0, info.retryAfter - nowSec) : 0;
        const s = shortKey(k);
        safeKeys[s] = Object.assign(Object.assign({}, info), { short: s });
        delete safeKeys[s].short;
    }
    return res.json({
        day: state.day,
        currentKey: shortKey(keys.getCurrent()),
        currentShort: shortKey(keys.getCurrent()),
        poolSize: keys.getAll().length,
        allowance: gatewayConfig.dailyAllowance,
        keys: safeKeys,
        models: state.models,
        events: events.readRecent(),
        updated: state.updated,
    });
});
// ── GET /stats ─────────────────────────────────────────────────────
app.get('/stats', requireSession, async (_req, res) => {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const state = usage.getState();
    const recentEvents = events.readRecent();
    const evtKeys = new Set();
    // Ensure all pool keys are in state.keys
    const allPoolKeys = keys.getAll();
    for (const k of allPoolKeys) {
        if (!state.keys[k]) {
            state.keys[k] = {
                status: 'active',
                retryAfter: 0,
                requestsToday: 0,
                tokensToday: 0,
                lastUsed: null,
            };
        }
    }
    for (const [k, info] of Object.entries(state.keys)) {
        info.isCurrent = k === keys.getCurrent();
        info.cooldownRemainingSec = info.status === 'cooldown' ? Math.max(0, info.retryAfter - nowSec) : 0;
        info.cooldownEndsAt = info.status === 'cooldown' ? new Date(info.retryAfter * 1000).toISOString() : null;
        info.short = shortKey(k);
        info.avgTokPerReq = info.requestsToday > 0 ? Math.round(info.tokensToday / info.requestsToday) : 0;
        info.eventCount = 0;
        evtKeys.add(shortKey(k));
    }
    let failoverToday = 0;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    for (const e of recentEvents) {
        if (e.type === 'failover' && new Date(e.ts) >= dayStart)
            failoverToday += 1;
        const short = e.key || e.from || e.to;
        if (short && state.keys[short] !== undefined) {
            state.keys[short].eventCount = (state.keys[short].eventCount || 0) + 1;
        }
    }
    const perModel = {};
    let totalTokAll = 0;
    for (const [model, mkeys] of Object.entries(state.models)) {
        let req = 0, inTok = 0, outTok = 0;
        for (const [k, v] of Object.entries(mkeys)) {
            req += v.requests; inTok += v.inTokens; outTok += v.outTokens;
        }
        const tok = inTok + outTok;
        totalTokAll += tok;
        perModel[model] = { requests: req, inTokens: inTok, outTokens: outTok, tokens: tok, keys: Object.keys(mkeys).map(shortKey) };
    }
    for (const m of Object.keys(perModel)) {
        perModel[m].share = totalTokAll > 0 ? Math.round((perModel[m].tokens / totalTokAll) * 1000) / 10 : 0;
    }
    const tot = history.totals(now);
    const totalsHistory = history.readRecent(10);
    const safeKeys = {};
    for (const [k, info] of Object.entries(state.keys)) {
        const s = info.short;
        safeKeys[s] = Object.assign(Object.assign({}, info), { short: s });
        delete safeKeys[s].short;
    }
    return res.json({
        day: state.day,
        now: new Date(now).toISOString(),
        serviceInfo: {
            startTime: new Date(startedAt).toISOString(),
            uptimeSec: Math.round((now - startedAt) / 1000),
            port,
            baseUrl: config_1.config.baseUrl,
            defaultModel: config_1.config.defaultModel,
            poolSize: keys.getAll().length,
            currentKey: shortKey(keys.getCurrent()),
            retries: gatewayConfig.retries,
            restartTorOnFailover: gatewayConfig.restartTorOnFailover,
            probeIntervalMs: gatewayConfig.probeIntervalMs,
            historyMax: gatewayConfig.historyMax,
            allowedModels: gatewayConfig.allowedModels,
            dailyAllowance: gatewayConfig.dailyAllowance,
        },
        tor: await tor.getExitIp(),
        totals: tot,
        failoverToday,
        hourly: {
            h24: history.dayBuckets(now),
            h168: history.hourlyBuckets(168, now),
        },
        keys: safeKeys,
        models: perModel,
        activity: totalsHistory,
        events: recentEvents,
        updated: state.updated,
    });
});
// ── GET /dashboard ─────────────────────────────────────────────────
app.get('/dashboard', requireSession, (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDashboard());
});
// ── GET /health ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        opencode_go_url: config_1.config.baseUrl,
        default_model: config_1.config.defaultModel,
        pool_size: keys.getAll().length,
        current_key: shortKey(keys.getCurrent()),
        timestamp: new Date().toISOString(),
    });
});
// ── Key recovery probe ─────────────────────────────────────────────
async function probeKeys() {
    const state = usage.getState();
    // Probe key cooldowns
    for (const [key, info] of Object.entries(state.keys)) {
        if (info.status !== 'cooldown')
            continue;
        try {
            (0, logger_1.log)('🔍 PROBE', `Testing ...${shortKey(key)} for recovery`, logger_1.COLORS.dim);
            const resp = await fetch(`${config_1.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model: gatewayConfig.defaultModel,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: gatewayConfig.probeMaxTokens,
                }),
            });
            if (resp.ok) {
                usage.clearCooldown(key);
                events.log({ type: 'recovered', key: shortKey(key) });
                (0, logger_1.log)('🔍 PROBE', `...${shortKey(key)} recovered`, logger_1.COLORS.green);
            }
            else {
                (0, logger_1.log)('🔍 PROBE', `...${shortKey(key)} still limited (${resp.status})`, logger_1.COLORS.yellow);
            }
        }
        catch (e) {
            (0, logger_1.log)('🔍 PROBE', `...${shortKey(key)} probe error: ${e.message}`, logger_1.COLORS.red);
        }
    }
    // Probe model cooldowns - test each model in pool
    const modelPool = keys.getModelPool();
    for (const model of modelPool) {
        if (!usage.isModelCooldown(model))
            continue;
        try {
            (0, logger_1.log)('🔍 PROBE', `Testing model ${model} for recovery`, logger_1.COLORS.dim);
            const key = keys.getCurrent();
            const resp = await fetch(`${config_1.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: gatewayConfig.probeMaxTokens,
                }),
            });
            if (resp.ok) {
                usage.clearModelCooldown(model);
                events.log({ type: 'model_recovered', model });
                (0, logger_1.log)('🔍 PROBE', `Model ${model} recovered`, logger_1.COLORS.green);
            }
            else {
                (0, logger_1.log)('🔍 PROBE', `Model ${model} still limited (${resp.status})`, logger_1.COLORS.yellow);
            }
        }
        catch (e) {
            (0, logger_1.log)('🔍 PROBE', `Model ${model} probe error: ${e.message}`, logger_1.COLORS.red);
        }
    }
}
setTimeout(probeKeys, 5000);
setInterval(probeKeys, gatewayConfig.probeIntervalMs).unref();
// ── Start Server ───────────────────────────────────────────────────
const cliPort = process.argv.indexOf('--port') !== -1
    ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
    : undefined;
const port = cliPort || gatewayConfig.port;
const HOST = '0.0.0.0';
app.listen(port, HOST, () => {
    console.log(`\n${logger_1.COLORS.bold}${logger_1.COLORS.cyan}OpenCode Smart Gateway running on ${HOST}:${port}${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.cyan}OpenCode Go API: ${config_1.config.baseUrl}${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.cyan}Default model: ${config_1.config.defaultModel}${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.cyan}Active key: ...${shortKey(keys.getCurrent())} (${keys.getAll().length} in pool)${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.cyan}Dashboard (LAN): http://<this-ip>:${port}/dashboard${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.yellow}Dashboard protected (Basic Auth, see gateway.config.json)${logger_1.COLORS.reset}`);
    console.log(`${logger_1.COLORS.cyan}Health check: http://localhost:${port}/health${logger_1.COLORS.reset}`);
    if (config_1.config.rateLimit.enabled) {
        console.log(`${logger_1.COLORS.yellow}Rate limit: ${config_1.config.rateLimit.maxRequests} req / ${config_1.config.rateLimit.windowMs}ms${logger_1.COLORS.reset}`);
    }
    console.log('');
});
//# sourceMappingURL=index.js.map
