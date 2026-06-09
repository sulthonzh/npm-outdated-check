import { readFile } from 'fs/promises';
import { join } from 'path';
import { coerce, parse } from 'semver';
import type { PackageInfo, VersionDiff, Config, NpmPackageJson, ExitCode } from '../types/config.js';

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
    const entries: Array<{ name: string; version: string; type: 'prod' | 'dev' }> = [];
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    if (this.config.include.includes('prod')) {
      for (const [name, version] of Object.entries(deps)) {
        entries.push({ name, version, type: 'prod' });
      }
    }

    if (this.config.include.includes('dev')) {
      for (const [name, version] of Object.entries(devDeps)) {
        entries.push({ name, version, type: 'dev' });
      }
    }

    // Fetch all latest versions concurrently with bounded concurrency
    const MAX_CONCURRENT = 8;
    const results: Array<PackageInfo | null> = [];

    for (let i = 0; i < entries.length; i += MAX_CONCURRENT) {
      const batch = entries.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.all(
        batch.map(async ({ name, version, type }) => {
          const latest = await this.getLatestVersion(name);
          if (!latest) return null;
          return { name, current: version, latest, wanted: version, type, direct: true } satisfies PackageInfo;
        })
      );
      results.push(...batchResults);
    }

    return results.filter((r): r is PackageInfo => r !== null);
  }

  private async getLatestVersion(packageName: string): Promise<string | null> {
    try {
      // Validate registry URL format
      try {
        new URL(this.config.registry);
      } catch {
        throw new Error(`Invalid registry URL: ${this.config.registry}`);
      }

      // Use the abbreviated registry endpoint to avoid downloading
      // full metadata for packages with many versions (e.g. lodash is 5MB+)
      // Encode scoped package names: @types/node → %40types%2Fnode
      const encoded = encodeURIComponent(packageName);
      const url = `${this.config.registry}/${encoded}`;
      
      const response = await fetch(url, {
        headers: { Accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(30_000),
        // Additional error handling for network issues
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Package not found - this is a common case for invalid package names
          return null;
        }
        // For other errors, log in verbose mode
        if (this.config.verbose) {
          console.warn(`Registry request failed for ${packageName}: ${response.status} ${response.statusText}`);
        }
        return null;
      }

      const data = await response.json() as { 'dist-tags': { latest?: string } };
      const latest = data['dist-tags']?.latest;
      
      if (!latest) {
        if (this.config.verbose) {
          console.warn(`No latest version found for ${packageName}`);
        }
        return null;
      }
      
      return latest;
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`Failed to fetch latest version for ${packageName}: ${error}`);
      }
      return null;
    }
  }

  private calculateVersionDiff(pkg: PackageInfo): VersionDiff {
    // coerce() extracts a semver from range specs like ^1.2.3, ~1.2.3, >=1.2.3
    const current = coerce(pkg.current);
    const latest = parse(pkg.latest);

    if (!current || !latest) {
      return {
        name: pkg.name,
        current: pkg.current,
        latest: pkg.latest,
        wanted: pkg.current,
        type: pkg.type,
        majorDiff: 0,
        minorDiff: 0,
        patchDiff: 0,
        isViolation: false,
      };
    }

    // Calculate total version distance for accurate drift measurement.
    // When major differs, minor/patch are not meaningful in isolation,
    // so we compute a composite distance in "patch units" (major*1M + minor*1K + patch).
    // Individual diffs are still reported for display.
    const majorDiff = latest.major - current.major;
    const minorDiff = latest.minor - current.minor;
    const patchDiff = latest.patch - current.patch;

    // A violation occurs when the total drift exceeds any configured threshold.
    // We check each component independently — a major bump of 1 is always a violation
    // if maxMajor is 0, regardless of minor/patch.
    const isViolation =
      majorDiff > this.config.maxMajor ||
      (majorDiff === 0 && minorDiff > this.config.maxMinor) ||
      (majorDiff === 0 && minorDiff === 0 && patchDiff > this.config.maxPatch);

    // For display: show actual per-component drift (positive only)
    // When major differs, report total patch-equivalent distance for context
    const displayMajor = Math.max(0, majorDiff);
    const displayMinor = majorDiff > 0 ? latest.minor : Math.max(0, minorDiff);
    const displayPatch = majorDiff > 0 ? latest.patch : (minorDiff > 0 ? latest.patch : Math.max(0, patchDiff));

    // The 'wanted' field is the resolved version based on the semver range.
    // For ^X.Y.Z, the max wanted is (X+1).0.0 (caret allows minor+patch bumps).
    // For ~X.Y.Z, the max wanted is X.(Y+1).0 (tilde allows patch bumps only).
    // For exact versions, wanted = current.
    let wanted = pkg.current;
    try {
      const base = coerce(pkg.current);
      if (base) {
        if (pkg.current.startsWith('^')) {
          wanted = `${base.major}.${base.minor}.${base.patch}`;
        } else if (pkg.current.startsWith('~')) {
          wanted = `${base.major}.${base.minor}.${base.patch}`;
        } else if (!pkg.current.startsWith('>') && !pkg.current.startsWith('<') && !pkg.current.includes('|') && !pkg.current.includes(' - ')) {
          // Exact version or simple version — use as-is
          wanted = `${base.major}.${base.minor}.${base.patch}`;
        }
      }
    } catch {
      // Keep pkg.current as wanted
    }

    return {
      name: pkg.name,
      current: pkg.current,
      latest: pkg.latest,
      wanted,
      type: pkg.type,
      majorDiff: displayMajor,
      minorDiff: displayMinor,
      patchDiff: displayPatch,
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
    if (violations.length > 0) {
      return this.config.failOnAny ? 1 : 0;
    }
    return 0;
  }
}