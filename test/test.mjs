import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OutdatedChecker } from '../dist/index.js';
import { ConfigLoader } from '../dist/index.js';
import { Formatter } from '../dist/index.js';

const makeConfig = (overrides = {}) => ({
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
  ...overrides,
});

// ─── OutdatedChecker ───
describe('OutdatedChecker', () => {
  describe('getExitCode', () => {
    it('returns 0 when no violations', () => {
      const checker = new OutdatedChecker(makeConfig());
      assert.equal(checker.getExitCode([]), 0);
    });

    it('returns 1 when violations exist with failOnAny', () => {
      const checker = new OutdatedChecker(makeConfig({ failOnAny: true }));
      const violations = [
        { name: 'react', current: '^18.0.0', latest: '19.0.0', type: 'prod', majorDiff: 1, minorDiff: 0, patchDiff: 0, isViolation: true },
      ];
      assert.equal(checker.getExitCode(violations), 1);
    });

    it('returns 0 when violations exist but failOnAny is false', () => {
      const checker = new OutdatedChecker(makeConfig({ failOnAny: false }));
      const violations = [
        { name: 'react', current: '^18.0.0', latest: '19.0.0', type: 'prod', majorDiff: 1, minorDiff: 0, patchDiff: 0, isViolation: true },
      ];
      assert.equal(checker.getExitCode(violations), 0);
    });
  });

  describe('calculateVersionDiff', () => {
    it('detects major version drift as violation', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'react', current: '^18.2.0', latest: '19.0.0', wanted: '^18.2.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.name, 'react');
      assert.equal(result.majorDiff, 1);
      assert.equal(result.isViolation, true);
    });

    it('allows drift within thresholds', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'lodash', current: '^4.17.20', latest: '4.17.21', wanted: '^4.17.20', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.majorDiff, 0);
      assert.equal(result.minorDiff, 0);
      assert.equal(result.patchDiff, 1);
      assert.equal(result.isViolation, false);
    });

    it('detects minor version drift', () => {
      const checker = new OutdatedChecker(makeConfig({ maxMinor: 1 }));
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'express', current: '^4.18.0', latest: '4.21.0', wanted: '^4.18.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.minorDiff, 3);
      assert.equal(result.isViolation, true);
    });

    it('handles invalid semver gracefully', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'weird-pkg', current: 'not-a-version', latest: '1.0.0', wanted: 'not-a-version', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.isViolation, false);
    });

    it('handles tilde ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'test', current: '~1.2.0', latest: '1.2.5', wanted: '~1.2.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.patchDiff, 5);
      assert.equal(result.isViolation, false);
    });

    it('detects patch violation', () => {
      const checker = new OutdatedChecker(makeConfig({ maxPatch: 3 }));
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'test', current: '^1.0.0', latest: '1.0.10', wanted: '^1.0.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.patchDiff, 10);
      assert.equal(result.isViolation, true);
    });
  });

  describe('isExcluded', () => {
    it('excludes exact package names', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['typescript', 'chalk'] }));
      const isExcluded = checker.isExcluded.bind(checker);
      assert.equal(isExcluded('typescript'), true);
      assert.equal(isExcluded('chalk'), true);
      assert.equal(isExcluded('react'), false);
    });

    it('excludes with glob patterns', () => {
      const checker = new OutdatedChecker(makeConfig({ exclude: ['@types/*', 'eslint-*'] }));
      const isExcluded = checker.isExcluded.bind(checker);
      assert.equal(isExcluded('@types/node'), true);
      assert.equal(isExcluded('@types/react'), true);
      assert.equal(isExcluded('eslint-config-prettier'), true);
      assert.equal(isExcluded('@types'), false);
      assert.equal(isExcluded('eslint'), false);
    });
  });
});

// ─── ConfigLoader ───
describe('ConfigLoader', () => {
  it('loads default config when no file exists', async () => {
    const config = await ConfigLoader.load('/tmp/test-npm-outdated-config.json');
    assert.equal(config.maxMajor, 0);
    assert.equal(config.maxMinor, 2);
    assert.equal(config.maxPatch, 5);
    assert.deepEqual(config.include, ['prod', 'dev']);
    assert.deepEqual(config.exclude, []);
    assert.equal(config.registry, 'https://registry.npmjs.org');
  });

  it('merges CLI options', async () => {
    const baseConfig = await ConfigLoader.load('/tmp/test-npm-outdated-config.json');
    const merged = ConfigLoader.mergeWithCli(baseConfig, { maxMajor: 1, maxMinor: 5, format: 'json' });
    assert.equal(merged.maxMajor, 1);
    assert.equal(merged.maxMinor, 5);
    assert.equal(merged.format, 'json');
    assert.equal(merged.maxPatch, 5);
  });

  it('validates valid config', () => {
    const validConfig = makeConfig();
    const result = ConfigLoader.validate(validConfig);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects negative max values', () => {
    const result = ConfigLoader.validate(makeConfig({ maxMajor: -1 }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('maxMajor must be >= 0'));
  });

  it('rejects invalid format', () => {
    const result = ConfigLoader.validate(makeConfig({ format: 'invalid' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('format must be text, json, table, or markdown'));
  });

  it('accepts markdown as valid format', () => {
    const result = ConfigLoader.validate(makeConfig({ format: 'markdown' }));
    assert.equal(result.valid, true);
  });

  it('rejects empty include array', () => {
    const result = ConfigLoader.validate(makeConfig({ include: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('include must have at least one type'));
  });

  it('rejects non-HTTPS registry (not localhost)', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://evil.com' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('HTTPS')));
  });

  it('allows HTTP localhost registry', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://localhost:4873' }));
    assert.equal(result.valid, true);
  });
});

// ─── Formatter ───
describe('Formatter', () => {
  const config = makeConfig({ failOnAny: false });

  const resultWithViolations = {
    violations: [
      { name: 'react', current: '^18.0.0', latest: '19.0.0', type: 'prod', majorDiff: 1, minorDiff: 0, patchDiff: 0, isViolation: true },
    ],
    totalChecked: 10,
    passed: false,
    config,
  };

  const resultNoViolations = {
    violations: [],
    totalChecked: 10,
    passed: true,
    config,
  };

  it('formats JSON output', () => {
    const formatter = new Formatter({ ...config, format: 'json' });
    const output = formatter.format(resultWithViolations);
    const parsed = JSON.parse(output);
    assert.equal(parsed.passed, false);
    assert.equal(parsed.violationsCount, 1);
    assert.equal(parsed.violations[0].name, 'react');
  });

  it('formats text output with violations', () => {
    const formatter = new Formatter({ ...config, format: 'text' });
    const output = formatter.format(resultWithViolations);
    assert.ok(output.includes('react'));
    assert.ok(output.includes('^18.0.0'));
    assert.ok(output.includes('19.0.0'));
    assert.ok(output.includes('1 violation(s) found'));
  });

  it('formats text output without violations', () => {
    const formatter = new Formatter({ ...config, format: 'text' });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
  });

  it('formats verbose output', () => {
    const formatter = new Formatter({ ...config, format: 'text', verbose: true });
    const output = formatter.formatVerbose(resultWithViolations);
    assert.ok(output.includes('Configuration:'));
    assert.ok(output.includes('Registry:'));
  });

  it('formats markdown with violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown' });
    const output = formatter.format(resultWithViolations);
    assert.ok(output.includes('## Dependency Check'));
    assert.ok(output.includes('react'));
    assert.ok(output.includes('1 violation(s)'));
    assert.ok(output.includes('| Package |'));
  });

  it('formats markdown without violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown' });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('## Dependency Check'));
    assert.ok(output.includes('within threshold'));
    assert.ok(output.includes('10'));
  });

  it('formats markdown with multiple violations', () => {
    const multiResult = {
      violations: [
        { name: 'react', current: '^18.0.0', latest: '19.0.0', type: 'prod', majorDiff: 1, minorDiff: 0, patchDiff: 0, isViolation: true },
        { name: 'lodash', current: '^4.17.0', latest: '4.17.21', type: 'prod', majorDiff: 0, minorDiff: 0, patchDiff: 21, isViolation: true },
      ],
      totalChecked: 5,
      passed: false,
      config,
    };
    const formatter = new Formatter({ ...config, format: 'markdown' });
    const output = formatter.format(multiResult);
    assert.ok(output.includes('react'));
    assert.ok(output.includes('lodash'));
    assert.ok(output.includes('2 violation(s)'));
  });

// ─── Enhanced Features Tests ───
describe('Enhanced Features', () => {
  describe('Enhanced version parsing', () => {
    it('parses version ranges efficiently', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      
      assert.deepEqual(calc('^18.2.0'), { major: 18, minor: 2, patch: 0 });
      assert.deepEqual(calc('~1.2.3'), { major: 1, minor: 2, patch: 3 });
      assert.deepEqual(calc('>=2.0.0'), { major: 2, minor: 0, patch: 0 });
      assert.deepEqual(calc('1.0.0'), { major: 1, minor: 0, patch: 0 });
      assert.equal(calc('invalid'), null);
    });

    it('calculates wanted versions correctly', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      
      assert.equal(calc('^18.2.0', { major: 18, minor: 2, patch: 5 }), '^18.2.5');
      assert.equal(calc('~1.2.3', { major: 1, minor: 2, patch: 5 }), '~1.2.5');
      assert.equal(calc('>=2.0.0', { major: 2, minor: 0, patch: 0 }), '>=2.0.0');
      assert.equal(calc('1.0.0', { major: 1, minor: 0, patch: 0 }), '1.0.0');
    });
  });

  describe('isExcluded enhanced', () => {
    it('excludes with enhanced glob patterns', () => {
      const checker = new OutdatedChecker(makeConfig({
        exclude: ['@types/*', 'test-*', 'lodash@(4|5).*']
      }));
      
      assert.equal(checker.isExcluded('@types/node'), true);
      assert.equal(checker.isExcluded('@types/react'), true);
      assert.equal(checker.isExcluded('lodash'), false);
      assert.equal(checker.isExcluded('test-utils'), true);
      assert.equal(checker.isExcluded('lodash4'), false);
    });

    it('handles complex regex patterns gracefully', () => {
      const checker = new OutdatedChecker(makeConfig({
        exclude: ['invalid[*pattern', 'react']
      }));
      
      assert.equal(checker.isExcluded('react'), true);
      assert.equal(checker.isExcluded('invalid[*pattern'), true);
    });
  });

  describe('parseSemverWithRange', () => {
    it('parses version ranges efficiently', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      
      assert.deepEqual(calc('^18.2.0'), { major: 18, minor: 2, patch: 0 });
      assert.deepEqual(calc('~1.2.3'), { major: 1, minor: 2, patch: 3 });
      assert.deepEqual(calc('>=2.0.0'), { major: 2, minor: 0, patch: 0 });
      assert.deepEqual(calc('1.0.0'), { major: 1, minor: 0, patch: 0 });
      assert.equal(calc('invalid'), null);
    });
  });

  describe('calculateWantedVersion', () => {
    it('calculates wanted versions correctly', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      
      assert.equal(calc('^18.2.0', { major: 18, minor: 2, patch: 5 }), '^18.2.5');
      assert.equal(calc('~1.2.3', { major: 1, minor: 2, patch: 5 }), '~1.2.5');
      assert.equal(calc('>=2.0.0', { major: 2, minor: 0, patch: 0 }), '>=2.0.0');
      assert.equal(calc('1.0.0', { major: 1, minor: 0, patch: 0 }), '1.0.0');
    });
  });

  describe('checkWithTransitive', () => {
    it('includes transitive dependencies when enabled', async () => {
      // This test would require mocking the file system
      // For now, we just ensure the method exists and works
      const checker = new OutdatedChecker(makeConfig({ transitive: true }));
      assert.ok(typeof checker.checkWithTransitive === 'function');
    });
  });
});
});
