import { describe, it, expect } from 'vitest';
import { OutdatedChecker } from '../src/lib/checker.js';
import type { Config, PackageInfo } from '../src/types/config.js';

describe('OutdatedChecker', () => {
  const makeConfig = (overrides: Partial<Config> = {}): Config => ({
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
    ...overrides,
  });

  describe('getExitCode', () => {
    it('should return 0 when no violations', () => {
      const checker = new OutdatedChecker(makeConfig());
      expect(checker.getExitCode([])).toBe(0);
    });

    it('should return 1 when violations exist', () => {
      const checker = new OutdatedChecker(makeConfig());
      const violations = [
        {
          name: 'react',
          current: '^18.0.0',
          latest: '19.0.0',
          type: 'prod' as const,
          majorDiff: 1,
          minorDiff: 0,
          patchDiff: 0,
          isViolation: true,
        },
      ];
      expect(checker.getExitCode(violations)).toBe(1);
    });
  });

  describe('calculateVersionDiff (via check with mocked readPackageJson)', () => {
    it('detects major version drift as violation', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2, maxPatch: 5 }));
      // Access private method via any cast for unit testing
      const calc = (checker as any).calculateVersionDiff.bind(checker);

      const pkg: PackageInfo = {
        name: 'react',
        current: '^18.2.0',
        latest: '19.0.0',
        wanted: '^18.2.0',
        type: 'prod',
        direct: true,
      };

      const result = calc(pkg);
      expect(result.name).toBe('react');
      expect(result.majorDiff).toBe(1);
      expect(result.isViolation).toBe(true);
    });

    it('allows drift within thresholds', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2, maxPatch: 5 }));
      const calc = (checker as any).calculateVersionDiff.bind(checker);

      const pkg: PackageInfo = {
        name: 'lodash',
        current: '^4.17.20',
        latest: '4.17.21',
        wanted: '^4.17.20',
        type: 'prod',
        direct: true,
      };

      const result = calc(pkg);
      expect(result.majorDiff).toBe(0);
      expect(result.minorDiff).toBe(0);
      expect(result.patchDiff).toBe(1);
      expect(result.isViolation).toBe(false);
    });

    it('detects minor version drift', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 1, maxPatch: 5 }));
      const calc = (checker as any).calculateVersionDiff.bind(checker);

      const pkg: PackageInfo = {
        name: 'express',
        current: '^4.18.0',
        latest: '4.21.0',
        wanted: '^4.18.0',
        type: 'prod',
        direct: true,
      };

      const result = calc(pkg);
      expect(result.minorDiff).toBe(3);
      expect(result.isViolation).toBe(true);
    });

    it('handles invalid semver gracefully', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = (checker as any).calculateVersionDiff.bind(checker);

      const pkg: PackageInfo = {
        name: 'weird-pkg',
        current: 'not-a-version',
        latest: '1.0.0',
        wanted: 'not-a-version',
        type: 'prod',
        direct: true,
      };

      const result = calc(pkg);
      expect(result.isViolation).toBe(false);
    });
  });

  describe('isExcluded', () => {
    it('excludes exact package names', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['typescript', 'chalk'] }));
      const isExcluded = (checker as any).isExcluded.bind(checker);

      expect(isExcluded('typescript')).toBe(true);
      expect(isExcluded('chalk')).toBe(true);
      expect(isExcluded('react')).toBe(false);
    });

    it('excludes with glob patterns', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['@types/*', 'eslint-*'] }));
      const isExcluded = (checker as any).isExcluded.bind(checker);

      expect(isExcluded('@types/node')).toBe(true);
      expect(isExcluded('@types/react')).toBe(true);
      expect(isExcluded('eslint-config-prettier')).toBe(true);
      expect(isExcluded('@types')).toBe(false);
      expect(isExcluded('eslint')).toBe(false);
    });
  });
});
