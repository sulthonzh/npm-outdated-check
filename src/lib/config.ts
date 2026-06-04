import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Config } from '../types/config.js';

const DEFAULT_CONFIG: Config = {
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
  static async load(configPath?: string): Promise<Config> {
    let userConfig: Partial<Config> = {};

    if (configPath) {
      try {
        const content = await readFile(configPath, 'utf-8');
        userConfig = JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
      }
    } else {
      for (const filename of CONFIG_FILENAMES) {
        try {
          const content = await readFile(join(process.cwd(), filename), 'utf-8');
          userConfig = JSON.parse(content);
          break;
        } catch {
          // Config file is optional - try next
        }
      }
    }

    return { ...DEFAULT_CONFIG, ...userConfig };
  }

  static mergeWithCli(config: Config, cliOptions: Partial<Config>): Config {
    return { ...config, ...cliOptions };
  }

  static validate(config: Config): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof config.maxMajor !== 'number' || isNaN(config.maxMajor) || config.maxMajor < 0) errors.push('maxMajor must be a number >= 0');
    if (typeof config.maxMinor !== 'number' || isNaN(config.maxMinor) || config.maxMinor < 0) errors.push('maxMinor must be a number >= 0');
    if (typeof config.maxPatch !== 'number' || isNaN(config.maxPatch) || config.maxPatch < 0) errors.push('maxPatch must be a number >= 0');

    if (config.include.length === 0) errors.push('include must have at least one type');

    const validTypes = ['prod', 'dev', 'peer', 'optional'];
    for (const t of config.include) {
      if (!validTypes.includes(t)) {
        errors.push(`include type "${t}" is not valid (valid: ${validTypes.join(', ')})`);
      }
    }

    if (!['text', 'json', 'table', 'summary'].includes(config.format)) {
      errors.push('format must be text, json, table, or summary');
    }

    try {
      new URL(config.registry);
    } catch {
      errors.push(`registry must be a valid URL: "${config.registry}"`);
    }

    for (const pattern of config.excludePatterns) {
      try {
        new RegExp(pattern);
      } catch {
        errors.push(`excludePatterns contains invalid regex: "${pattern}"`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
