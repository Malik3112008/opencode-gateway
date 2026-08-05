"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSystemMessage = extractSystemMessage;
exports.convertToOpenAIMessages = convertToOpenAIMessages;
exports.sanitizeOpenAIMessages = sanitizeOpenAIMessages;
exports.convertToOpenAITools = convertToOpenAITools;
exports.convertToolChoice = convertToolChoice;
exports.buildOpenAIRequest = buildOpenAIRequest;
exports.convertToAnthropicResponse = convertToAnthropicResponse;
const config_1 = require("./config");
const MAX_TOOL_RESULT_CHARS = 2000;
const MAX_HISTORY_TURNS = 20;
const SYSTEM_PROMPT_MAX_CHARS = 4000;
function truncateToolResult(content) {
    if (typeof content !== 'string')
        return content;
    if (content.length <= MAX_TOOL_RESULT_CHARS)
        return content;
    return content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated: ' + content.length + ' chars → ' + MAX_TOOL_RESULT_CHARS + ' chars]';
}
function compressSystemPrompt(prompt) {
    if (!prompt || prompt.length <= SYSTEM_PROMPT_MAX_CHARS)
        return prompt;
    const lines = prompt.split('\n');
    const important = [];
    const skipPatterns = ['# Example', '# Example:', '## Example', '```bash', '```sh', '```shell', '```console', '```', '<example>', '</example>'];
    let inSkipBlock = false;
    for (const line of lines) {
        if (skipPatterns.some(p => line.trim().startsWith(p))) {
            inSkipBlock = !inSkipBlock || line.trim() === '```';
            continue;
        }
        if (inSkipBlock)
            continue;
        important.push(line);
    }
    const compressed = important.join('\n');
    if (compressed.length <= SYSTEM_PROMPT_MAX_CHARS)
        return compressed;
    return compressed.slice(0, SYSTEM_PROMPT_MAX_CHARS) + '\n... [system prompt compressed from ' + prompt.length + ' to ' + SYSTEM_PROMPT_MAX_CHARS + ' chars]';
}
function limitHistoryMessages(messages) {
    if (messages.length <= MAX_HISTORY_TURNS)
        return messages;
    const systemMsgs = messages.filter(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');
    const recentMsgs = nonSystemMsgs.slice(-MAX_HISTORY_TURNS * 2);
    return sanitizeOpenAIMessages([...systemMsgs, ...recentMsgs]);
}
function sanitizeOpenAIMessages(messages) {
    const result = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const prev = result[result.length - 1];
        if (msg.role === 'tool') {
            const hasMatchingToolCall = prev &&
                prev.role === 'assistant' &&
                prev.tool_calls &&
                prev.tool_calls.some(tc => tc.id === msg.tool_call_id);
            if (!hasMatchingToolCall) {
                continue;
            }
        }
        result.push(msg);
    }
    return result;
}
// ── Request: Anthropic → OpenAI ────────────────────────────────────
function extractSystemMessage(request) {
    const parts = [];
    if (request.system) {
        if (typeof request.system === 'string') {
            parts.push(request.system);
        }
        else {
            for (const s of request.system) {
                if (s.type === 'text' && s.text) {
                    parts.push(s.text);
                }
            }
        }
    }
    for (const msg of request.messages) {
        if (msg.role === 'system') {
            if (typeof msg.content === 'string') {
                parts.push(msg.content);
            }
        }
    }
    return parts.join('\n');
}
function convertContentBlocks(blocks, model) {
    const supportsVision = !config_1.NO_VISION.has(model);
    const hasImage = blocks.some((b) => b.type === 'image');
    const parts = [];
    for (const block of blocks) {
        if (block.type === 'text' && block.text) {
            parts.push({ type: 'text', text: block.text });
        }
        else if (block.type === 'thinking') {
            parts.push({ type: 'text', text: block.thinking || '' });
        }
        else if (block.type === 'image' && block.source) {
            if (supportsVision) {
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${block.source.media_type || 'image/jpeg'};base64,${block.source.data}`,
                    },
                });
            }
            else {
                parts.push({
                    type: 'text',
                    text: 'ERROR: Image input is not supported for the selected model. Please choose a vision-capable model.',
                });
            }
        }
    }
    if (hasImage)
        return parts;
    return parts.map((p) => p.text).join('\n\n');
}
function convertToOpenAIMessages(request, model) {
    let messages = [];
    const systemMessage = extractSystemMessage(request);
    if (systemMessage) {
        messages.push({ role: 'system', content: compressSystemPrompt(systemMessage) });
    }
    for (const msg of request.messages) {
        if (msg.role === 'system')
            continue;
        // Assistant: tool_use → tool_calls, thinking → reasoning_content
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const textBlocks = [];
            const thinkingBlocks = [];
            const toolCalls = [];
            for (const block of msg.content) {
                switch (block.type) {
                    case 'text':
                        if (block.text)
                            textBlocks.push(block.text);
                        break;
                    case 'thinking':
                        thinkingBlocks.push(block.thinking || '');
                        break;
                    case 'tool_use':
                        toolCalls.push({
                            id: block.id,
                            type: 'function',
                            function: {
                                name: block.name,
                                arguments: JSON.stringify(block.input ?? {}),
                            },
                        });
                        break;
                }
            }
            const combinedThinking = thinkingBlocks.join('\n\n');
            messages.push({
                role: 'assistant',
                content: toolCalls.length > 0 ? (textBlocks.join('\n\n') || null) : (textBlocks.join('\n\n') || ''),
                reasoning_content: combinedThinking,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            });
            continue;
        }
        // User: tool_result blocks → role:tool messages
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            const toolResultBlocks = [];
            const otherBlocks = [];
            for (const block of msg.content) {
                if (block.type === 'tool_result') {
                    toolResultBlocks.push({
                        tool_use_id: block.tool_use_id,
                        content: truncateToolResult(block.content ?? ''),
                    });
                }
                else {
                    otherBlocks.push(block);
                }
            }
            // tool_results must come first (protocol: tool_use → tool_result → user)
            for (const tr of toolResultBlocks) {
                messages.push({
                    role: 'tool',
                    tool_call_id: tr.tool_use_id,
                    content: tr.content,
                });
            }
            if (otherBlocks.length > 0) {
                messages.push({
                    role: 'user',
                    content: convertContentBlocks(otherBlocks, model),
                });
            }
            continue;
        }
        // Plain string content
        if (typeof msg.content === 'string') {
            messages.push({ role: msg.role, content: msg.content });
            continue;
        }
        // Array content (text/image only, no tool blocks)
        const convertedContent = convertContentBlocks(msg.content, model);
        const msgObj = {
            role: msg.role,
            content: convertedContent,
        };
        if (msg.role === 'assistant' && typeof convertedContent === 'string') {
            msgObj.reasoning_content = '';
        }
        messages.push(msgObj);
    }
    messages = sanitizeOpenAIMessages(messages);
    messages = limitHistoryMessages(messages);
    return messages;
}
function convertToOpenAITools(tools) {
    if (!tools || tools.length === 0)
        return undefined;
    return tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        },
    }));
}
function convertToolChoice(toolChoice) {
    if (!toolChoice)
        return undefined;
    switch (toolChoice.type) {
        case 'auto':
            return 'auto';
        case 'any':
            return 'required';
        case 'tool':
            if (toolChoice.name) {
                return { type: 'function', function: { name: toolChoice.name } };
            }
            return undefined;
        case 'none':
            return 'none';
        default:
            return undefined;
    }
}
function buildOpenAIRequest(request, upstreamModel) {
    const model = upstreamModel || request.model;
    const openAIRequest = {
        model,
        messages: convertToOpenAIMessages(request, model),
        stream: request.stream,
    };
    // DeepSeek requires reasoning_content to be present when enable_thinking is true.
    // For non-DeepSeek models or when client explicitly requests thinking, enable it.
    // For DeepSeek without prior reasoning history, skip enable_thinking to avoid
    // "reasoning_content must be passed back" errors on first-turn requests.
    const hasReasoningHistory = openAIRequest.messages.some((m) => m.reasoning_content);
    if (request.thinking?.type === 'enabled' || (model.toLowerCase().includes('deepseek') && hasReasoningHistory)) {
        openAIRequest.enable_thinking = true;
    }
    if (request.max_tokens)
        openAIRequest.max_tokens = request.max_tokens;
    if (request.temperature !== undefined)
        openAIRequest.temperature = request.temperature;
    if (request.top_p !== undefined)
        openAIRequest.top_p = request.top_p;
    if (request.top_k !== undefined)
        openAIRequest.top_k = request.top_k;
    if (request.stop_sequences)
        openAIRequest.stop = request.stop_sequences;
    if (request.metadata?.user_id)
        openAIRequest.user = request.metadata.user_id;
    if (request.tools)
        openAIRequest.tools = convertToOpenAITools(request.tools);
    if (request.tool_choice)
        openAIRequest.tool_choice = convertToolChoice(request.tool_choice);
    return openAIRequest;
}
// ── Response: OpenAI → Anthropic (non-streaming) ───────────────────
function convertToAnthropicResponse(openAIResponse, requestModel) {
    const choice = openAIResponse.choices[0];
    const content = choice?.message?.content || '';
    const reasoningContent = choice?.message?.reasoning_content || '';
    const contentBlocks = [];
    if (reasoningContent) {
        contentBlocks.push({ type: 'thinking', thinking: reasoningContent });
    }
    if (content) {
        contentBlocks.push({ type: 'text', text: content });
    }
    if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
            contentBlocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || '{}'),
            });
        }
    }
    const finishReason = choice?.finish_reason;
    let stopReason = 'end_turn';
    if (finishReason === 'tool_calls')
        stopReason = 'tool_use';
    else if (finishReason === 'length')
        stopReason = 'max_tokens';
    else if (finishReason === 'stop')
        stopReason = 'end_turn';
    const promptTokens = openAIResponse.usage?.prompt_tokens ?? 0;
    const cachedTokens = openAIResponse.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const usage = {
        input_tokens: promptTokens - cachedTokens,
        output_tokens: openAIResponse.usage?.completion_tokens ?? 0,
    };
    if (cachedTokens > 0) {
        usage.cache_read_input_tokens = cachedTokens;
    }
    return {
        id: openAIResponse.id,
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: requestModel,
        stop_reason: stopReason,
        stop_sequence: null,
        usage,
    };
}
//# sourceMappingURL=translate.js.map