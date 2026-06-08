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
    const packages: PackageInfo[] = [];
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    if (this.config.include.includes('prod')) {
      for (const [name, version] of Object.entries(deps)) {
        const latest = await this.getLatestVersion(name);
        if (latest) {
          packages.push({
            name,
            current: version,
            latest,
            wanted: version,
            type: 'prod',
            direct: true,
          });
        }
      }
    }

    if (this.config.include.includes('dev')) {
      for (const [name, version] of Object.entries(devDeps)) {
        const latest = await this.getLatestVersion(name);
        if (latest) {
          packages.push({
            name,
            current: version,
            latest,
            wanted: version,
            type: 'dev',
            direct: true,
          });
        }
      }
    }

    return packages;
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
    // This gives us the floor version for comparison against latest.
    // Note: for complex ranges like ">=16 || >=18", coerce picks the first match,
    // which may not reflect the actual installed version.
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

    const majorDiff = latest.major - current.major;
    const minorDiff = latest.minor - current.minor;
    const patchDiff = latest.patch - current.patch;

    const isViolation =
      majorDiff > this.config.maxMajor ||
      minorDiff > this.config.maxMinor ||
      patchDiff > this.config.maxPatch;

    // Try to determine the 'wanted' version based on the current semver range
    let wanted = pkg.current;
    try {
      // For simple ranges like ^1.2.3, ~2.1.0, we can calculate a more accurate wanted version
      if (pkg.current.startsWith('^')) {
        const base = pkg.current.slice(1);
        const baseVersion = parse(base);
        if (baseVersion) {
          wanted = `^${baseVersion.major}.${baseVersion.minor}.${baseVersion.patch}`;
        }
      } else if (pkg.current.startsWith('~')) {
        const base = pkg.current.slice(1);
        const baseVersion = parse(base);
        if (baseVersion) {
          wanted = `~${baseVersion.major}.${baseVersion.minor}.${baseVersion.patch}`;
        }
      } else if (pkg.current.startsWith('>=')) {
        const version = pkg.current.slice(2).trim();
        const minVersion = parse(version);
        if (minVersion) {
          wanted = `>=${minVersion.major}.${minVersion.minor}.${minVersion.patch}`;
        }
      }
    } catch {
      // If we can't parse the range, keep the current version as wanted
    }

    return {
      name: pkg.name,
      current: pkg.current,
      latest: pkg.latest,
      wanted,
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
    if (violations.length > 0) {
      return this.config.failOnAny ? 1 : 0;
    }
    return 0;
  }
}