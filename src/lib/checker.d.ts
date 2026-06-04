import type { VersionDiff, Config, ExitCode } from '../types/config.js';
export declare class OutdatedChecker {
    private config;
    private basePath;
    constructor(config: Config, basePath?: string);
    check(): Promise<{
        violations: VersionDiff[];
        totalChecked: number;
    }>;
    private readPackageJson;
    private getPackageInfo;
    private getLatestVersion;
    private calculateVersionDiff;
    private isExcluded;
    getExitCode(violations: VersionDiff[]): ExitCode;
}
//# sourceMappingURL=checker.d.ts.map