import { describe, it, expect } from 'vitest';
import { OutdatedChecker } from '../src/lib/checker.js';
import type { Config } from '../src/types/config.js';

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

  describe('isExcluded', () => {
    it('should exclude exact package names', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['react'] }));
      // Access private method via bracket notation for testing
      expect((checker as any).isExcluded('react')).toBe(true);
      expect((checker as any).isExcluded('vue')).toBe(false);
    });

    it('should exclude glob patterns', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['@types/*', 'eslint-*'] }));
      expect((checker as any).isExcluded('@types/node')).toBe(true);
      expect((checker as any).isExcluded('@types/react')).toBe(true);
      expect((checker as any).isExcluded('eslint-config-prettier')).toBe(true);
      expect((checker as any).isExcluded('eslint')).toBe(false);
      expect((checker as any).isExcluded('@types')).toBe(false);
    });
  });

  describe('calculateVersionDiff', () => {
    it('should detect major version violation', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0 }));
      const diff = (checker as any).calculateVersionDiff({
        name: 'react',
        current: '^18.0.0',
        latest: '19.0.0',
        type: 'prod',
      });
      expect(diff.majorDiff).toBe(1);
      expect(diff.isViolation).toBe(true);
    });

    it('should detect minor version violation', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 5, maxMinor: 1 }));
      const diff = (checker as any).calculateVersionDiff({
        name: 'lodash',
        current: '^4.17.0',
        latest: '4.20.0',
        type: 'prod',
      });
      expect(diff.minorDiff).toBe(3);
      expect(diff.isViolation).toBe(true);
    });

    it('should not flag packages within threshold', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2, maxPatch: 5 }));
      const diff = (checker as any).calculateVersionDiff({
        name: 'chalk',
        current: '^5.3.0',
        latest: '5.3.2',
        type: 'prod',
      });
      expect(diff.patchDiff).toBe(2);
      expect(diff.isViolation).toBe(false);
    });

    it('should handle uncoerceable current version gracefully', () => {
      const checker = new OutdatedChecker(makeConfig());
      const diff = (checker as any).calculateVersionDiff({
        name: 'weird-pkg',
        current: 'not-a-version',
        latest: '1.0.0',
        type: 'prod',
      });
      expect(diff.isViolation).toBe(false);
    });

    it('should handle tilde ranges', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2 }));
      const diff = (checker as any).calculateVersionDiff({
        name: 'some-pkg',
        current: '~1.2.0',
        latest: '1.2.5',
        type: 'prod',
      });
      expect(diff.patchDiff).toBe(5);
      expect(diff.isViolation).toBe(false);
    });

    it('should clamp negative diffs to zero', () => {
      const checker = new OutdatedChecker(makeConfig());
      const diff = (checker as any).calculateVersionDiff({
        name: 'local-pkg',
        current: '^2.5.0',
        latest: '2.3.8',
        type: 'prod',
      });
      expect(diff.majorDiff).toBe(0);
      // minorDiff: 3 - 5 = -2, clamped to 0
      expect(diff.minorDiff).toBe(0);
    });
  });
});
