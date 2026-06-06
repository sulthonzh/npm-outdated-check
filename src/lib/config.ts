import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Config } from '../types/config.js';

const DEFAULT_CONFIG: Config = {
  maxMajor: 0,
  maxMinor: 2,
  maxPatch: 5,
  include: ['prod', 'dev'],
  exclude: [],
  registry: 'https://registry.npmjs.org',
  format: 'text',
  failOnAny: false,
  verbose: false,
  onlyViolations: false,
};

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
      try {
        const content = await readFile(join(process.cwd(), '.npm-outdated-check.json'), 'utf-8');
        userConfig = JSON.parse(content);
      } catch {
        // Config file is optional - use defaults if not found
      }
    }

    return { ...DEFAULT_CONFIG, ...userConfig };
  }

  static mergeWithCli(config: Config, cliOptions: Partial<Config>): Config {
    return { ...config, ...cliOptions };
  }

  static validate(config: Config): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Guard against NaN from parseInt on CLI input — NaN passes < 0 but
    // breaks every comparison in calculateVersionDiff, silently disabling checks.
    if (!Number.isFinite(config.maxMajor)) errors.push('maxMajor must be a valid number');
    if (!Number.isFinite(config.maxMinor)) errors.push('maxMinor must be a valid number');
    if (!Number.isFinite(config.maxPatch)) errors.push('maxPatch must be a valid number');

    if (config.maxMajor < 0) errors.push('maxMajor must be >= 0');
    if (config.maxMinor < 0) errors.push('maxMinor must be >= 0');
    if (config.maxPatch < 0) errors.push('maxPatch must be >= 0');

    if (config.include.length === 0) errors.push('include must have at least one type');

    if (!['text', 'json', 'table'].includes(config.format)) {
      errors.push('format must be text, json, or table');
    }

    try {
      new URL(config.registry);
    } catch {
      errors.push('registry must be a valid URL');
    }

    return { valid: errors.length === 0, errors };
  }
}