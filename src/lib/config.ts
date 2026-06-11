import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Config } from '../types/config.js';

// Valid npm package name regex (simplified for security)
const PACKAGE_NAME_REGEX = /^(@[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]|[a-zA-Z0-9][\w.-]*[a-zA-Z0-9])$/;

// Allowed registry domains for security
const ALLOWED_REGISTRY_DOMAINS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'npm.pkg.github.com',
  'localhost',
  '127.0.0.1',
  '[::1]'
];

const DEFAULT_CONFIG: Config = {
  maxMajor: 0,
  maxMinor: 2,
  maxPatch: 5,
  include: ['prod', 'dev'],
  exclude: [],
  registry: 'https://registry.npmjs.org',
  format: 'text',
  failOnAny: true,
  verbose: false,
  onlyViolations: false,
  transitive: true,
  cacheTTL: 3600000, // 1 hour default cache
};

export class ConfigLoader {
  static async load(configPath?: string): Promise<Config> {
    let userConfig: Partial<Config> = {};

    if (configPath) {
      try {
        const content = await readFile(configPath, 'utf-8');
        userConfig = JSON.parse(content);
        
        // Validate user config structure
        this.validateUserConfig(userConfig);
      } catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
      }
    } else {
      try {
        const content = await readFile(join(process.cwd(), '.npm-outdated-check.json'), 'utf-8');
        userConfig = JSON.parse(content);
        
        // Validate user config structure
        this.validateUserConfig(userConfig);
      } catch {
        // Config file is optional - use defaults if not found
      }
    }

    return this.mergeConfig(DEFAULT_CONFIG, userConfig);
  }

  private static validateUserConfig(userConfig: Partial<Config>): void {
    // Validate package names in exclude list
    if (userConfig.exclude) {
      for (const packageName of userConfig.exclude) {
        if (typeof packageName === 'string' && !this.validatePackageName(packageName)) {
          throw new Error(`Invalid package name in exclude list: ${packageName}`);
        }
      }
    }

    // Validate registry URL if provided
    if (userConfig.registry) {
      try {
        const url = new URL(userConfig.registry);
        const hostname = url.hostname;
        
        // Check if hostname is allowed for security
        const isAllowed = ALLOWED_REGISTRY_DOMAINS.some(domain => 
          hostname === domain || hostname.endsWith(`.${domain}`)
        );
        
        if (!isAllowed) {
          throw new Error(`Registry hostname not allowed for security: ${hostname}`);
        }
        
        // Prevent SSRF attacks by blocking IP addresses in hostname
        if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || hostname.startsWith('[')) {
          throw new Error('Registry IP addresses are not allowed for security');
        }
      } catch (error) {
        if (error instanceof Error && !error.message.includes('Registry hostname not allowed') && !error.message.includes('Registry IP addresses are not allowed')) {
          throw new Error(`Invalid registry URL: ${userConfig.registry}`);
        }
        throw error;
      }
    }
  }

  private static validatePackageName(name: string): boolean {
    if (typeof name !== 'string' || name.length === 0 || name.length > 214) {
      return false;
    }
    return PACKAGE_NAME_REGEX.test(name);
  }

  private static mergeConfig(defaultConfig: Config, userConfig: Partial<Config>): Config {
    const merged = { ...defaultConfig };
    
    // Deep merge for nested objects
    for (const [key, value] of Object.entries(userConfig)) {
      if (key === 'exclude' && Array.isArray(value)) {
        merged.exclude = value;
      } else if (key === 'include' && Array.isArray(value) && value.every(item => ['prod', 'dev'].includes(item as string))) {
        merged.include = value as ('prod' | 'dev')[];
      } else if (key === 'registry' && typeof value === 'string') {
        merged.registry = value;
      } else if (key === 'format' && typeof value === 'string' && ['text', 'json', 'table', 'markdown'].includes(value)) {
        merged.format = value as 'text' | 'json' | 'table' | 'markdown';
      } else if (key === 'failOnAny' && typeof value === 'boolean') {
        merged.failOnAny = value;
      } else if (key === 'verbose' && typeof value === 'boolean') {
        merged.verbose = value;
      } else if (key === 'onlyViolations' && typeof value === 'boolean') {
        merged.onlyViolations = value;
      } else if (key === 'transitive' && typeof value === 'boolean') {
        merged.transitive = value;
      } else if (key === 'maxMajor' && typeof value === 'number') {
        merged.maxMajor = value;
      } else if (key === 'maxMinor' && typeof value === 'number') {
        merged.maxMinor = value;
      } else if (key === 'maxPatch' && typeof value === 'number') {
        merged.maxPatch = value;
      } else if (key === 'cacheTTL' && typeof value === 'number') {
        merged.cacheTTL = value;
      }
    }
    
    return merged;
  }

  static mergeWithCli(config: Config, cliOptions: Partial<Config>): Config {
    return { ...config, ...cliOptions };
  }

  static validate(config: Config): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.maxMajor < 0) errors.push('maxMajor must be >= 0');
    if (config.maxMinor < 0) errors.push('maxMinor must be >= 0');
    if (config.maxPatch < 0) errors.push('maxPatch must be >= 0');

    if (config.include.length === 0) errors.push('include must have at least one type');
    if (!config.include.every(type => ['prod', 'dev'].includes(type))) {
      errors.push('include must only contain "prod" and/or "dev"');
    }

    if (!['text', 'json', 'table', 'markdown'].includes(config.format)) {
      errors.push('format must be text, json, table, or markdown');
    }

    // Validate registry URL format and security
    try {
      const url = new URL(config.registry);
      const hostname = url.hostname;
      
      // Check if hostname is allowed for security
      const isAllowed = ALLOWED_REGISTRY_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
      
      if (!isAllowed) {
        errors.push(`Registry hostname not allowed for security: ${hostname}`);
      }
      
      // Prevent SSRF attacks by blocking IP addresses in hostname
      if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || hostname.startsWith('[')) {
        errors.push('Registry IP addresses are not allowed for security');
      }
      
      // Validate protocol - allow localhost with any port for development/testing
      if (!config.registry.startsWith('https://') && 
          !config.registry.startsWith('http://localhost') &&
          !config.registry.startsWith('http://127.0.0.1') &&
          !config.registry.startsWith('http://[::1]')) {
        // Special case: allow localhost with port (e.g., http://localhost:4873)
        const localhostWithPortRegex = /^http:\/\/localhost(:\d+)?(\/.*)?$/;
        if (!localhostWithPortRegex.test(config.registry)) {
          errors.push('Registry URL must use HTTPS for security (localhost allowed for testing)');
        }
      }
      
      // Prevent non-standard ports for security, but allow localhost for development
      if (url.port && url.port !== '443' && url.port !== '80') {
        // Allow localhost with any port for development/testing
        if (!hostname.startsWith('localhost') && !hostname.startsWith('127.0.0.1') && !hostname.startsWith('[::1]')) {
          errors.push(`Registry URL uses non-standard port: ${url.port}`);
        }
      }
    } catch {
      errors.push(`Invalid registry URL: ${config.registry}`);
    }

    // Validate cacheTTL
    if (config.cacheTTL !== undefined && (typeof config.cacheTTL !== 'number' || config.cacheTTL < 0)) {
      errors.push('cacheTTL must be a positive number or undefined');
    }

    return { valid: errors.length === 0, errors };
  }
}