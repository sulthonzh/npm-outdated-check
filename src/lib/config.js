import { readFile } from 'fs/promises';
import { join } from 'path';
const DEFAULT_CONFIG = {
    maxMajor: 0,
    maxMinor: 2,
    maxPatch: 5,
    include: ['prod', 'dev'],
    exclude: [],
    excludePatterns: [],
    ignoreRanges: false,
    registry: 'https://registry.npmjs.org',
    format: 'text',
    failOnAny: false,
    verbose: false,
    showSuggestions: false,
};
const CONFIG_FILENAMES = [
    '.npm-outdated-check.json',
    '.npmoutdatedrc',
    '.npm-outdatedrc.json',
];
export class ConfigLoader {
    static async load(configPath) {
        let userConfig = {};
        if (configPath) {
            try {
                const content = await readFile(configPath, 'utf-8');
                userConfig = JSON.parse(content);
            }
            catch (error) {
                throw new Error(`Failed to load config from ${configPath}: ${error}`);
            }
        }
        else {
            for (const filename of CONFIG_FILENAMES) {
                try {
                    const content = await readFile(join(process.cwd(), filename), 'utf-8');
                    userConfig = JSON.parse(content);
                    break;
                }
                catch {
                    // Config file is optional - try next
                }
            }
        }
        return { ...DEFAULT_CONFIG, ...userConfig };
    }
    static mergeWithCli(config, cliOptions) {
        return { ...config, ...cliOptions };
    }
    static validate(config) {
        const errors = [];
        if (config.maxMajor < 0)
            errors.push('maxMajor must be >= 0');
        if (config.maxMinor < 0)
            errors.push('maxMinor must be >= 0');
        if (config.maxPatch < 0)
            errors.push('maxPatch must be >= 0');
        if (config.include.length === 0)
            errors.push('include must have at least one type');
        const validTypes = ['prod', 'dev', 'peer', 'optional'];
        for (const t of config.include) {
            if (!validTypes.includes(t)) {
                errors.push(`include type "${t}" is not valid (valid: ${validTypes.join(', ')})`);
            }
        }
        if (!['text', 'json', 'table', 'summary'].includes(config.format)) {
            errors.push('format must be text, json, table, or summary');
        }
        for (const pattern of config.excludePatterns) {
            try {
                new RegExp(pattern);
            }
            catch {
                errors.push(`excludePatterns contains invalid regex: "${pattern}"`);
            }
        }
        return { valid: errors.length === 0, errors };
    }
}
//# sourceMappingURL=config.js.map