export interface PackageInfo {
  name: string;
  current: string;
  latest: string;
  wanted: string;
  type: 'prod' | 'dev';
  direct: boolean;
}

export interface VersionDiff {
  name: string;
  current: string;
  latest: string;
  type: 'prod' | 'dev';
  majorDiff: number;
  minorDiff: number;
  patchDiff: number;
  isViolation: boolean;
}

export interface Config {
  maxMajor: number;
  maxMinor: number;
  maxPatch: number;
  include: ('prod' | 'dev')[];
  exclude: string[];
  registry: string;
  format: 'text' | 'json' | 'table' | 'markdown';
  failOnAny: boolean;
  verbose: boolean;
  onlyViolations: boolean;
}

export interface CheckResult {
  violations: VersionDiff[];
  totalChecked: number;
  passed: boolean;
  config: Config;
}

export interface NpmPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface NpmRegistryInfo {
  name: string;
  'dist-tags': {
    latest: string;
  };
  versions: Record<string, unknown>;
}

export type ExitCode = 0 | 1 | 2 | 3;