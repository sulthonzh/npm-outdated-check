import { readFile } from 'fs/promises';
import { join } from 'path';
import { coerce, parse } from 'semver';
import type { PackageInfo, VersionDiff, Config, NpmPackageJson, ExitCode } from '../types/config.js';

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 8;

export class OutdatedChecker {
  private config: Config;
  private basePath: string;

  constructor(config: Config, basePath: string = process.cwd()) {
    this.config = config;
    this.basePath = basePath;
  }

  async check(): Promise<{ violations: VersionDiff[]; totalChecked: number }> {
    const packageJson = await this.readPackageJson();
    const packageInfo = await this.getPackageInfo(packageJson);
    const violations: VersionDiff[] = [];

    for (const pkg of packageInfo) {
      if (this.isExcluded(pkg.name)) continue;

      const diff = this.calculateVersionDiff(pkg);
      if (diff.isViolation) {
        violations.push(diff);
      }
    }

    return { violations, totalChecked: packageInfo.length };
  }

  private async readPackageJson(): Promise<NpmPackageJson> {
    const packagePath = join(this.basePath, 'package.json');
    const content = await readFile(packagePath, 'utf-8');
    return JSON.parse(content);
  }

  private async getPackageInfo(packageJson: NpmPackageJson): Promise<PackageInfo[]> {
    const entries: Array<[string, string, 'prod' | 'dev']> = [];

    for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
      entries.push([name, version, 'prod']);
    }

    if (this.config.include.includes('dev')) {
      for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
        entries.push([name, version, 'dev']);
      }
    }

    // Fetch in parallel batches to avoid overwhelming the registry
    const results: PackageInfo[] = [];
    for (let i = 0; i < entries.length; i += FETCH_CONCURRENCY) {
      const batch = entries.slice(i, i + FETCH_CONCURRENCY);
      const resolved = await Promise.all(
        batch.map(async ([name, version, type]) => {
          const latest = await this.getLatestVersion(name);
          if (latest) {
            return { name, current: version, latest, wanted: version, type, direct: true } as PackageInfo;
          }
          return null;
        }),
      );
      for (const r of resolved) {
        if (r) results.push(r);
      }
    }

    return results;
  }

  private async getLatestVersion(packageName: string): Promise<string | null> {
    try {
      const encodedName = packageName.replace(/^@/, '%40').replace(/\//g, '%2F');
      const url = `${this.config.registry}/${encodedName}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { 'dist-tags': { latest?: string } };
      return data['dist-tags']?.latest || null;
    } catch {
      return null;
    }
  }

  private calculateVersionDiff(pkg: PackageInfo): VersionDiff {
    const current = coerce(pkg.current);
    const latest = parse(pkg.latest);

    if (!current || !latest) {
      return {
        name: pkg.name,
        current: pkg.current,
        latest: pkg.latest,
        type: pkg.type,
        majorDiff: 0,
        minorDiff: 0,
        patchDiff: 0,
        isViolation: false,
      };
    }

    const majorDiff = latest.major - current.major;
    const minorDiff = latest.minor - current.minor;
    const patchDiff = latest.patch - current.patch;

    const isViolation =
      majorDiff > this.config.maxMajor ||
      minorDiff > this.config.maxMinor ||
      patchDiff > this.config.maxPatch;

    return {
      name: pkg.name,
      current: pkg.current,
      latest: pkg.latest,
      type: pkg.type,
      majorDiff: Math.max(0, majorDiff),
      minorDiff: Math.max(0, minorDiff),
      patchDiff: Math.max(0, patchDiff),
      isViolation,
    };
  }

  private isExcluded(packageName: string): boolean {
    return this.config.exclude.some((pattern) => {
      if (!pattern.includes('*')) {
        return pattern === packageName;
      }
      // Convert glob pattern to regex: @types/* → ^@types/[^/]+$ 
      const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$';
      return new RegExp(regexStr).test(packageName);
    });
  }

  getExitCode(violations: VersionDiff[]): ExitCode {
    if (this.config.failOnAny && violations.length > 0) {
      return 1;
    }
    if (!this.config.failOnAny && violations.length === 0) {
      return 0;
    }
    return violations.length > 0 ? 1 : 0;
  }
}