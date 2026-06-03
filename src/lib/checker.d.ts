import type { VersionDiff, Config, ExitCode } from '../types/config.js';
export declare class OutdatedChecker {
    private config;
    private basePath;
    constructor(config: Config, basePath?: string);
    check(): Promise<{
        violations: VersionDiff[];
        totalChecked: number;
        skipped: number;
    }>;
    private readPackageJson;
    private isIgnoredRange;
    private getPackageInfo;
    private getLatestVersion;
    private calculateVersionDiff;
    private isExcluded;
    getExitCode(violations: VersionDiff[]): ExitCode;
}
//# sourceMappingURL=checker.d.ts.map