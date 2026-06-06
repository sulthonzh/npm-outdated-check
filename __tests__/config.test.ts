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
    expect(config.registry).toBe('https://registry.npmjs.org');
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

  it('should validate config', () => {
    const validConfig = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
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
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
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
      registry: 'https://registry.npmjs.org',
      format: 'invalid' as any,
      failOnAny: false,
      verbose: false,
    };

    const result = ConfigLoader.validate(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('format must be text, json, or table');
  });

  it('should reject NaN threshold values', () => {
    const nanConfig = {
      maxMajor: NaN,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      registry: 'https://registry.npmjs.org',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
    };

    const result = ConfigLoader.validate(nanConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxMajor must be a valid number');
  });

  it('should reject invalid registry URL', () => {
    const badRegistry = {
      maxMajor: 0,
      maxMinor: 2,
      maxPatch: 5,
      include: ['prod', 'dev'] as const,
      exclude: [],
      registry: 'not-a-url',
      format: 'text' as const,
      failOnAny: false,
      verbose: false,
    };

    const result = ConfigLoader.validate(badRegistry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('registry must be a valid URL');
  });
});