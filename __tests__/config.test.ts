import { describe, it, expect } from 'vitest';
import { ConfigLoader } from '../src/lib/config.js';

describe('ConfigLoader', () => {
  it('should load default config', async () => {
    const config = await ConfigLoader.load();
    expect(config.maxMajor).toBe(0);
    expect(config.maxMinor).toBe(2);
    expect(config.maxPatch).toBe(5);
    expect(config.include).toEqual(['prod', 'dev']);
    expect(config.exclude).toEqual([]);
    expect(config.excludePatterns).toEqual([]);
    expect(config.ignoreRanges).toBe(false);
    expect(config.registry).toBe('https://registry.npmjs.org');
    expect(config.showSuggestions).toBe(false);
  });

  it('should merge CLI options', async () => {
    const baseConfig = await ConfigLoader.load();
    const cliOptions = {
      maxMajor: 1,
      maxMinor: 5,
      format: 'json' as const,
    };

    const merged = ConfigLoader.mergeWithCli(baseConfig, cliOptions);

    expect(merged.maxMajor).toBe(1);
    expect(merged.maxMinor).toBe(5);
    expect(merged.format).toBe('json');
    expect(merged.maxPatch).toBe(5);
  });

  it('should not overwrite config with undefined CLI options', async () => {
    const baseConfig = await ConfigLoader.load();
    const cliOptions = {
      maxMajor: undefined as unknown as number,
      exclude: [] as string[],
    };

    const merged = ConfigLoader.mergeWithCli(baseConfig, cliOptions);

    expect(merged.maxMajor).toBe(0); // kept default
    expect(merged.exclude).toEqual([]); // kept default
  });

  it('should not overwrite config file exclude with empty CLI exclude', async () => {
    const baseConfig: import('../src/types/config.js').Config = {
      ...await ConfigLoader.load(),
      exclude: ['some-pkg'],
    };
    const cliOptions = {
      exclude: [''],  // empty string from unprovided --exclude
    };

    const merged = ConfigLoader.mergeWithCli(baseConfig, cliOptions);

    expect(merged.exclude).toEqual(['some-pkg']); // config file value preserved
  });

  it('should validate config', () => {
    const validConfig = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject invalid max values', () => {
    const invalidConfig = {
      maxMajor: -1,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxMajor must be >= 0');
  });

  it('should reject invalid format', () => {
    const invalidConfig = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'invalid' as any,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('format must be text, json, table, or summary');
  });

  it('should accept summary format', () => {
    const config = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'summary' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should accept peer and optional dep types', () => {
    const config = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev', 'peer', 'optional'] as const,
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid dep types', () => {
    const config = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'invalid' as any],
      exclude: [],
      excludePatterns: [],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should validate excludePatterns regex', () => {
    const config = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      excludePatterns: ['^@types/', '[invalid'],
      ignoreRanges: false,
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
      showSuggestions: false,
    };

    const result = ConfigLoader.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid regex'))).toBe(true);
  });
});
