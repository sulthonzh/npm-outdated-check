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
      // Use the abbreviated registry endpoint to avoid downloading
      // full metadata for packages with many versions (e.g. lodash is 5MB+)
      const url = `${this.config.registry}/${packageName}?cached=true`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

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
    return this.config.exclude.includes(packageName);
  }

  getExitCode(violations: VersionDiff[]): ExitCode {
    if (violations.length > 0) {
      return 1;
    }
    return 0;
  }
}