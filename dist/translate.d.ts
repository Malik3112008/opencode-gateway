import type { AnthropicRequest, OpenAIMessage, OpenAIRequest, OpenAIResponse, OpenAITool } from './types';
export declare function extractSystemMessage(request: AnthropicRequest): string;
export declare function convertToOpenAIMessages(request: AnthropicRequest, model: string): OpenAIMessage[];
export declare function convertToOpenAITools(tools: AnthropicRequest['tools']): OpenAITool[] | undefined;
export declare function convertToolChoice(toolChoice: AnthropicRequest['tool_choice']): OpenAIRequest['tool_choice'];
export declare function buildOpenAIRequest(request: AnthropicRequest, upstreamModel?: string): OpenAIRequest;
export declare function convertToAnthropicResponse(openAIResponse: OpenAIResponse, requestModel: string): Record<string, unknown>;
//# sourceMappingURL=translate.d.ts.map