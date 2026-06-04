import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutdatedChecker } from '../src/lib/checker.js';
import type { Config } from '../src/types/config.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('OutdatedChecker', () => {
  const baseConfig: Config = {
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

  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `npm-outdated-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function writePackageJson(dir: string, content: object) {
    await writeFile(join(dir, 'package.json'), JSON.stringify(content));
  }

  it('should throw if package.json not found', async () => {
    const checker = new OutdatedChecker(baseConfig, testDir);
    await expect(checker.check()).rejects.toThrow('package.json not found');
  });

  it('should throw on invalid JSON in package.json', async () => {
    await writeFile(join(testDir, 'package.json'), 'not json {{{');
    const checker = new OutdatedChecker(baseConfig, testDir);
    await expect(checker.check()).rejects.toThrow('invalid JSON');
  });

  it('should detect violations from dependencies', async () => {
    await writePackageJson(testDir, {
      dependencies: { lodash: '^4.0.0' },
    });

    // Mock fetch to return a version way ahead
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '99.0.0' } }),
    });

    try {
      const checker = new OutdatedChecker(baseConfig, testDir);
      const { violations, totalChecked } = await checker.check();
      expect(totalChecked).toBe(1);
      expect(violations.length).toBe(1);
      expect(violations[0].name).toBe('lodash');
      expect(violations[0].majorDiff).toBe(95);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should not flag packages within threshold', async () => {
    await writePackageJson(testDir, {
      dependencies: { lodash: '^4.17.20' },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '4.17.21' } }),
    });

    try {
      const checker = new OutdatedChecker(baseConfig, testDir);
      const { violations, totalChecked } = await checker.check();
      expect(totalChecked).toBe(1);
      expect(violations.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should skip excluded packages', async () => {
    await writePackageJson(testDir, {
      dependencies: { lodash: '^4.0.0', chalk: '^5.0.0' },
    });

    const config: Config = { ...baseConfig, exclude: ['lodash'] };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '99.0.0' } }),
    });

    try {
      const checker = new OutdatedChecker(config, testDir);
      const { violations } = await checker.check();
      expect(violations.every((v) => v.name !== 'lodash')).toBe(true);
      expect(violations.some((v) => v.name === 'chalk')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should use abbreviated Accept header for registry fetch', async () => {
    await writePackageJson(testDir, {
      dependencies: { lodash: '^4.0.0' },
    });

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '4.17.21' } }),
    });
    globalThis.fetch = fetchSpy;

    try {
      const checker = new OutdatedChecker(baseConfig, testDir);
      await checker.check();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({
        Accept: 'application/vnd.npm.install-v1+json',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should encode scoped package names in registry URL', async () => {
    await writePackageJson(testDir, {
      dependencies: { '@types/node': '^20.0.0' },
    });

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '20.12.0' } }),
    });
    globalThis.fetch = fetchSpy;

    try {
      const checker = new OutdatedChecker(baseConfig, testDir);
      await checker.check();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('@types%2Fnode');
      expect(url).not.toContain('@types/node');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should skip devDependencies when not included', async () => {
    await writePackageJson(testDir, {
      dependencies: { lodash: '^4.17.0' },
      devDependencies: { vitest: '^1.0.0' },
    });

    const config: Config = { ...baseConfig, include: ['prod'] };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ 'dist-tags': { latest: '99.0.0' } }),
    });

    try {
      const checker = new OutdatedChecker(config, testDir);
      const { totalChecked } = await checker.check();
      // Only lodash, vitest should be skipped
      expect(totalChecked).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return exit code 0 when no violations', () => {
    const checker = new OutdatedChecker(baseConfig, testDir);
    expect(checker.getExitCode([])).toBe(0);
  });

  it('should return exit code 1 when violations exist', () => {
    const checker = new OutdatedChecker(baseConfig, testDir);
    expect(
      checker.getExitCode([
        {
          name: 'test',
          current: '1.0.0',
          latest: '2.0.0',
          type: 'prod',
          majorDiff: 1,
          minorDiff: 0,
          patchDiff: 0,
          isViolation: true,
        },
      ])
    ).toBe(1);
  });
});
