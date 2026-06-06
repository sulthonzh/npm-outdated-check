import { readFile } from 'fs/promises';
import { join } from 'path';
import { coerce, parse } from 'semver';
export class OutdatedChecker {
    config;
    basePath;
    constructor(config, basePath = process.cwd()) {
        this.config = config;
        this.basePath = basePath;
    }
    async check() {
        const packageJson = await this.readPackageJson();
        const packageInfo = await this.getPackageInfo(packageJson);
        const violations = [];
        for (const pkg of packageInfo) {
            if (this.isExcluded(pkg.name))
                continue;
            const diff = this.calculateVersionDiff(pkg);
            if (diff.isViolation) {
                violations.push(diff);
            }
        }
        return { violations, totalChecked: packageInfo.length };
    }
    async readPackageJson() {
        const packagePath = join(this.basePath, 'package.json');
        const content = await readFile(packagePath, 'utf-8');
        return JSON.parse(content);
    }
    async getPackageInfo(packageJson) {
        const packages = [];
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
    async getLatestVersion(packageName) {
        try {
            // Fetch only dist-tags from the registry — no query param tricks,
            // the Accept header alone is enough to get abbreviated metadata.
            const url = `${this.config.registry}/${packageName}`;
            const response = await fetch(url, {
                headers: { Accept: 'application/vnd.npm.install-v1+json' },
                signal: AbortSignal.timeout(30_000), // prevent CI hangs
            });
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            return data['dist-tags']?.latest || null;
        }
        catch {
            return null;
        }
    }
    calculateVersionDiff(pkg) {
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
        const isViolation = majorDiff > this.config.maxMajor ||
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
    isExcluded(packageName) {
        return this.config.exclude.some((pattern) => {
            if (!pattern.includes('*')) {
                return pattern === packageName;
            }
            // Convert glob pattern to regex: @types/* → ^@types/[^/]+$ 
            const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$';
            return new RegExp(regexStr).test(packageName);
        });
    }
    getExitCode(violations) {
        if (violations.length > 0) {
            return 1;
        }
        return 0;
    }
}
//# sourceMappingURL=checker.js.map