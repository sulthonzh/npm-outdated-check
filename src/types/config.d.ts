export interface PackageInfo {
    name: string;
    current: string;
    latest: string;
    wanted: string;
    type: 'prod' | 'dev' | 'peer' | 'optional';
    direct: boolean;
}
export interface VersionDiff {
    name: string;
    current: string;
    latest: string;
    type: 'prod' | 'dev' | 'peer' | 'optional';
    majorDiff: number;
    minorDiff: number;
    patchDiff: number;
    isViolation: boolean;
    severity: 'major' | 'minor' | 'patch' | 'none';
    suggestedBump?: string;
}
export interface Config {
    maxMajor: number;
    maxMinor: number;
    maxPatch: number;
    include: ('prod' | 'dev' | 'peer' | 'optional')[];
    exclude: string[];
    excludePatterns: string[];
    ignoreRanges: boolean;
    registry: string;
    format: 'text' | 'json' | 'table' | 'summary';
    failOnAny: boolean;
    verbose: boolean;
    showSuggestions: boolean;
}
export interface CheckResult {
    violations: VersionDiff[];
    totalChecked: number;
    skipped: number;
    passed: boolean;
    config: Config;
}
export interface NpmPackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}
export interface NpmRegistryInfo {
    name: string;
    'dist-tags': {
        latest: string;
    };
    versions: Record<string, unknown>;
}
export type ExitCode = 0 | 1 | 2 | 3;
export declare const IGNORED_RANGES: string[];
//# sourceMappingURL=config.d.ts.map