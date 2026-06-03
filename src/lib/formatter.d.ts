import type { Config, CheckResult } from '../types/config.js';
export declare class Formatter {
    private config;
    constructor(config: Config);
    format(result: CheckResult): string;
    private formatJson;
    private formatSummary;
    private formatTable;
    private formatText;
    formatVerbose(result: CheckResult): string;
}
//# sourceMappingURL=formatter.d.ts.map