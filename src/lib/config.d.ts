import type { Config } from '../types/config.js';
export declare class ConfigLoader {
    static load(configPath?: string): Promise<Config>;
    static mergeWithCli(config: Config, cliOptions: Partial<Config>): Config;
    static validate(config: Config): {
        valid: boolean;
        errors: string[];
    };
}
//# sourceMappingURL=config.d.ts.map