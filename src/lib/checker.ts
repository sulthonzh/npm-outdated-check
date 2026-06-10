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

  async checkWithTransitive(): Promise<{ violations: VersionDiff[]; totalChecked: number }> {
    const packageJson = await this.readPackageJson();
    const allPackageInfo = await this.getAllPackageInfoWithTransitive(packageJson);
    const violations: VersionDiff[] = [];

    for (const pkg of allPackageInfo) {
      if (this.isExcluded(pkg.name)) continue;

      const diff = this.calculateVersionDiff(pkg);
      if (diff.isViolation) {
        violations.push(diff);
      }
    }

    return { violations, totalChecked: allPackageInfo.length };
  }

  private async readPackageJson(): Promise<NpmPackageJson> {
    const packagePath = join(this.basePath, 'package.json');
    const content = await readFile(packagePath, 'utf-8');
    return JSON.parse(content);
  }

  private async readPackageLockJson(): Promise<any> {
    const lockPath = join(this.basePath, 'package-lock.json');
    try {
      const content = await readFile(lockPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async getAllPackageInfoWithTransitive(packageJson: NpmPackageJson): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    const seen = new Set<string>();
    
    // Start with direct dependencies
    const directPackages = await this.getPackageInfo(packageJson);
    for (const pkg of directPackages) {
      if (!seen.has(pkg.name)) {
        seen.add(pkg.name);
        packages.push(pkg);
      }
    }
    
    // If we want to include transitive dependencies, read package-lock.json
    if (this.config.transitive !== false) {
      const lockJson = await this.readPackageLockJson();
      if (lockJson) {
        const transitivePackages = await this.getTransitivePackages(lockJson, seen);
        packages.push(...transitivePackages);
      }
    }
    
    return packages;
  }

  private async getTransitivePackages(lockJson: any, seen: Set<string>): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    
    const processDependencies = (dependencies: Record<string, any>, type: 'prod' | 'dev') => {
      for (const [name, info] of Object.entries(dependencies)) {
        if (seen.has(name)) continue;
        
        seen.add(name);
        
        // Extract version from package-lock.json structure
        const version = info.version || info;
        const latest = lockJson?.versions?.[name]?.dist?.tags?.latest || 'latest';
        
        packages.push({
          name,
          current: version,
          latest,
          wanted: version,
          type,
          direct: false,
        });
      }
    };
    
    if (lockJson.dependencies) {
      processDependencies(lockJson.dependencies, 'prod');
    }
    if (lockJson.devDependencies) {
      processDependencies(lockJson.devDependencies, 'dev');
    }
    
    return packages;
  }

  private async getPackageInfo(packageJson: NpmPackageJson): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    const allPackages: [string, string, 'prod' | 'dev'][] = [];
    
    if (this.config.include.includes('prod')) {
      for (const [name, version] of Object.entries(deps)) {
        allPackages.push([name, version, 'prod']);
      }
    }

    if (this.config.include.includes('dev')) {
      for (const [name, version] of Object.entries(devDeps)) {
        allPackages.push([name, version, 'dev']);
      }
    }

    // Fetch latest versions in parallel for better performance
    const latestVersions = await this.fetchLatestVersionsConcurrent(allPackages.map(([name]) => name));
    
    for (const [name, version, type] of allPackages) {
      const latest = latestVersions.get(name);
      if (latest) {
        packages.push({
          name,
          current: version,
          latest,
          wanted: version,
          type,
          direct: true,
        });
      }
    }

    return packages;
  }



  private async fetchLatestVersionWithRetry(packageName: string, maxRetries: number): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchLatestVersionOnce(packageName);
      } catch (error) {
        if (attempt === maxRetries) {
          if (this.config.verbose) {
            console.warn(`Failed to fetch latest version for ${packageName} after ${maxRetries} attempts: ${error}`);
          }
          return null;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  }

  private async fetchLatestVersionOnce(packageName: string): Promise<string | null> {
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
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Package not found - this is a common case for invalid package names
        return null;
      }
      throw new Error(`Registry request failed for ${packageName}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { 'dist-tags': { latest?: string } };
    const latest = data['dist-tags']?.latest;
    
    if (!latest) {
      throw new Error(`No latest version found for ${packageName}`);
    }
    
    return latest;
  }

  private async fetchLatestVersionsConcurrent(packageNames: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const failed = new Set<string>();
    
    // Process in batches to avoid overwhelming the registry
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < packageNames.length; i += batchSize) {
      batches.push(packageNames.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const promises = batch.map(async (name) => {
        try {
          const latest = await this.fetchLatestVersionWithRetry(name, 2);
          if (latest) {
            results.set(name, latest);
          } else {
            failed.add(name);
          }
        } catch (error) {
          if (this.config.verbose) {
            console.warn(`Failed to fetch ${name}: ${error}`);
          }
          failed.add(name);
        }
      });
      
      await Promise.allSettled(promises);
      
      // Small delay between batches to be respectful to the registry
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (this.config.verbose && failed.size > 0) {
      console.log(`Failed to fetch latest versions for ${failed.size} packages: ${Array.from(failed).slice(0, 5).join(', ')}${failed.size > 5 ? '...' : ''}`);
    }
    
    return results;
  }

  private calculateVersionDiff(pkg: PackageInfo): VersionDiff {
    // Optimize version parsing with memoization for common patterns
    const current = this.parseSemverWithRange(pkg.current);
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

    // Calculate wanted version more efficiently
    const wanted = this.calculateWantedVersion(pkg.current, current);

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

  private parseSemverWithRange(range: string): { major: number; minor: number; patch: number } | null {
    // Handle simple ranges more efficiently
    if (range.startsWith('^') || range.startsWith('~') || range.startsWith('>=') || range.startsWith('<=') || range.startsWith('>')) {
      // Extract version part from range
      const versionMatch = range.match(/^(>=|<=|>|<)?\s*(\d+\.\d+\.\d+)/);
      if (versionMatch && versionMatch[2]) {
        const version = parse(versionMatch[2]);
        if (version) {
          return { major: version.major, minor: version.minor, patch: version.patch };
        }
      }
    }
    
    // For exact versions or complex ranges, use coerce
    const coerced = coerce(range);
    if (coerced) {
      return { major: coerced.major, minor: coerced.minor, patch: coerced.patch };
    }
    
    return null;
  }

  private calculateWantedVersion(currentRange: string, parsedVersion: { major: number; minor: number; patch: number }): string {
    // Fast path for common patterns
    if (currentRange.startsWith('^')) {
      return `^${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
    }
    if (currentRange.startsWith('~')) {
      return `~${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
    }
    if (currentRange.startsWith('>=') || currentRange.startsWith('<=') || currentRange.startsWith('>') || currentRange.startsWith('<')) {
      const versionMatch = currentRange.match(/^(>=|<=|>|<)\s*(\d+\.\d+\.\d+)/);
      if (versionMatch && versionMatch[2] === `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`) {
        return currentRange;
      }
      return `>=${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
    }
    
    // For exact versions or complex ranges, return the original
    return currentRange;
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