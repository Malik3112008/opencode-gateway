export declare const config: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    port: number;
    rateLimit: {
        enabled: boolean;
        windowMs: number;
        maxRequests: number;
    };
};
export declare const ALL_MODELS: string[];
export declare const NO_VISION: Set<string>;
export declare function getModelEndpoint(model: string): string;
export declare function isAnthropicNativeModel(model: string): boolean;
//# sourceMappingURL=config.d.ts.map