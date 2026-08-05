import type { AnthropicRequest, OpenAIRequest } from './types';
export declare function callOpenCodeGo(requestBody: OpenAIRequest, model: string, apiKey?: string): Promise<Response>;
export declare function callOpenCodeGoAnthropic(requestBody: AnthropicRequest, model: string, apiKey?: string): Promise<Response>;
export declare function callOpenCodeGoStream(requestBody: OpenAIRequest & {
    stream: true;
}, model: string, apiKey?: string): Promise<globalThis.Response>;
export declare function callOpenCodeGoAnthropicStream(requestBody: AnthropicRequest & {
    stream: true;
}, model: string, apiKey?: string): Promise<globalThis.Response>;
export declare function getUpstreamModel(model: string): {
    model: string;
    isAnthropic: boolean;
};
//# sourceMappingURL=opencode.d.ts.map