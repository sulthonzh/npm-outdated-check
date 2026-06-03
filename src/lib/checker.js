import { readFile } from 'fs/promises';
import { join } from 'path';
import { coerce, parse } from 'semver';
import { IGNORED_RANGES } from '../types/config.js';
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
        let skipped = 0;
        for (const pkg of packageInfo) {
            if (this.isExcluded(pkg.name)) {
                skipped++;
                continue;
            }
            if (this.config.ignoreRanges && this.isIgnoredRange(pkg.current)) {
                skipped++;
                continue;
            }
            const diffResult = this.calculateVersionDiff(pkg);
            if (diffResult.isViolation) {
                violations.push(diffResult);
            }
        }
        return { violations, totalChecked: packageInfo.length, skipped };
    }
    async readPackageJson() {
        const packagePath = join(this.basePath, 'package.json');
        const content = await readFile(packagePath, 'utf-8');
        return JSON.parse(content);
    }
    isIgnoredRange(version) {
        const v = version.trim();
        return IGNORED_RANGES.some((pattern) => {
            // Prefix-match patterns that end with ':' or '+' (e.g. 'file:', 'git+')
            if (pattern.endsWith(':') || pattern.endsWith('+'))
                return v.startsWith(pattern);
            return v === pattern;
        });
    }
    async getPackageInfo(packageJson) {
        const packages = [];
        const depTypes = [
            { deps: packageJson.dependencies, type: 'prod' },
            { deps: packageJson.devDependencies, type: 'dev' },
            { deps: packageJson.peerDependencies, type: 'peer' },
            { deps: packageJson.optionalDependencies, type: 'optional' },
        ];
        for (const { deps, type } of depTypes) {
            if (!deps || !this.config.include.includes(type))
                continue;
            for (const [name, version] of Object.entries(deps)) {
                const latest = await this.getLatestVersion(name);
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
        }
        return packages;
    }
    async getLatestVersion(packageName) {
        try {
            const url = `${this.config.registry}/${packageName}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
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
                severity: 'none',
            };
        }
        const majorDiff = latest.major - current.major;
        const minorDiff = latest.minor - current.minor;
        const patchDiff = latest.patch - current.patch;
        const isViolation = majorDiff > this.config.maxMajor ||
            minorDiff > this.config.maxMinor ||
            patchDiff > this.config.maxPatch;
        let severity = 'none';
        if (majorDiff > 0)
            severity = 'major';
        else if (minorDiff > 0)
            severity = 'minor';
        else if (patchDiff > 0)
            severity = 'patch';
        const suggestedBump = isViolation ? `^${latest.version}` : undefined;
        return {
            name: pkg.name,
            current: pkg.current,
            latest: pkg.latest,
            type: pkg.type,
            majorDiff: Math.max(0, majorDiff),
            minorDiff: Math.max(0, minorDiff),
            patchDiff: Math.max(0, patchDiff),
            isViolation,
            severity,
            suggestedBump,
        };
    }
    isExcluded(packageName) {
        if (this.config.exclude.includes(packageName))
            return true;
        for (const pattern of this.config.excludePatterns) {
            try {
                const regex = new RegExp(pattern);
                if (regex.test(packageName))
                    return true;
            }
            catch {
                // Invalid regex pattern, skip
            }
        }
        return false;
    }
    getExitCode(violations, totalChecked) {
        if (this.config.failOnAny && totalChecked > 0 && violations.length > 0) {
            return 1;
        }
        if (!this.config.failOnAny && violations.length > 0) {
            return 1;
        }
        return 0;
    }
}
//# sourceMappingURL=checker.js.map