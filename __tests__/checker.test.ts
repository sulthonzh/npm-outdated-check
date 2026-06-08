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
    failOnAny: true,
    verbose: false,
    ...overrides,
  });

  describe('getExitCode', () => {
    it('should return 0 when no violations', () => {
      const checker = new OutdatedChecker(makeConfig());
      expect(checker.getExitCode([])).toBe(0);
    });

    it('should return 1 when violations exist with failOnAny', () => {
      const checker = new OutdatedChecker(makeConfig({ failOnAny: true }));
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

    it('should return 0 when violations exist but failOnAny is false', () => {
      const checker = new OutdatedChecker(makeConfig({ failOnAny: false }));
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
      expect(checker.getExitCode(violations)).toBe(0);
    });
  });
});
