import { describe, it, afterEach } from 'node:test';
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
  transitive: true,
  cacheTTL: 3600000,
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

    it('handles <= range prefix', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'test', current: '<=2.0.0', latest: '2.1.0', wanted: '<=2.0.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.minorDiff, 1);
    });

    it('handles < range prefix', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateVersionDiff.bind(checker);
      const pkg = { name: 'test', current: '<3.0.0', latest: '3.1.0', wanted: '<3.0.0', type: 'prod', direct: true };
      const result = calc(pkg);
      assert.equal(result.minorDiff, 1);
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

    it('handles complex regex patterns gracefully', () => {
      const checker = new OutdatedChecker(makeConfig({
        exclude: ['invalid[*pattern', 'react']
      }));
      assert.equal(checker.isExcluded('react'), true);
      assert.equal(checker.isExcluded('invalid[*pattern'), true);
    });
  });
});

// ─── Input Validation ───
describe('Input Validation', () => {
  describe('validatePackageName', () => {
    it('accepts valid simple package names', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validatePackageName.bind(checker);
      assert.equal(validate('lodash'), true);
      assert.equal(validate('react'), true);
      assert.equal(validate('my-package'), true);
      assert.equal(validate('my.package'), true);
    });

    it('accepts valid scoped package names', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validatePackageName.bind(checker);
      assert.equal(validate('@types/node'), true);
      assert.equal(validate('@scope/my-package'), true);
    });

    it('rejects empty and overly long names', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validatePackageName.bind(checker);
      assert.equal(validate(''), false);
      assert.equal(validate('a'.repeat(215)), false);
    });

    it('rejects invalid scoped packages', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validatePackageName.bind(checker);
      assert.equal(validate('@scope'), false);
      assert.equal(validate('@scope/'), false);
      assert.equal(validate('@/package'), false);
    });

    it('rejects names with invalid characters', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validatePackageName.bind(checker);
      assert.equal(validate('_invalid'), false);
      assert.equal(validate('-invalid'), false);
    });
  });

  describe('validateVersion', () => {
    it('accepts standard semver versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate('1.0.0'), true);
      assert.equal(validate('^1.2.3'), true);
      assert.equal(validate('~2.0.0'), true);
    });

    it('accepts range operators', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate('>=1.0.0'), true);
      assert.equal(validate('<=2.0.0'), true);
      assert.equal(validate('>1.0.0'), true);
      assert.equal(validate('<2.0.0'), true);
    });

    it('accepts special version specifiers', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate('*'), true);
      assert.equal(validate('latest'), true);
      assert.equal(validate('1.x'), true);
      assert.equal(validate('1.2.x'), true);
    });

    it('accepts protocol-based versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate('workspace:*'), true);
      assert.equal(validate('file:./local'), true);
      assert.equal(validate('github:user/repo'), true);
      assert.equal(validate('git+https://github.com/u/r.git'), true);
      assert.equal(validate('git+ssh://github.com/u/r.git'), true);
      assert.equal(validate('git+http://github.com/u/r.git'), true);
      assert.equal(validate('git+file:./local-repo'), true);
      assert.equal(validate('npm:other-pkg@1.0.0'), true);
      assert.equal(validate('link:../local'), true);
    });

    it('accepts OR comparator versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate('1.0.0 || 2.0.0'), true);
    });

    it('rejects invalid versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const validate = checker.validateVersion.bind(checker);
      assert.equal(validate(''), false);
      assert.equal(validate('a'.repeat(257)), false);
      assert.equal(validate('not-a-version!@#'), false);
    });
  });
});

// ─── Version Parsing ───
describe('Version Parsing', () => {
  describe('parseSemverWithRange', () => {
    it('parses caret ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      assert.deepEqual(calc('^18.2.0'), { major: 18, minor: 2, patch: 0 });
    });

    it('parses tilde ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      assert.deepEqual(calc('~1.2.3'), { major: 1, minor: 2, patch: 3 });
    });

    it('parses >= ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      assert.deepEqual(calc('>=2.0.0'), { major: 2, minor: 0, patch: 0 });
    });

    it('parses exact versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      assert.deepEqual(calc('1.0.0'), { major: 1, minor: 0, patch: 0 });
    });

    it('returns null for invalid input', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.parseSemverWithRange.bind(checker);
      assert.equal(calc('invalid'), null);
    });
  });

  describe('calculateWantedVersion', () => {
    it('calculates for caret ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('^18.2.0', { major: 18, minor: 2, patch: 5 }), '^18.2.5');
    });

    it('calculates for tilde ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('~1.2.3', { major: 1, minor: 2, patch: 5 }), '~1.2.5');
    });

    it('preserves matching >= ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('>=2.0.0', { major: 2, minor: 0, patch: 0 }), '>=2.0.0');
    });

    it('updates non-matching >= ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('>=2.0.0', { major: 2, minor: 1, patch: 0 }), '>=2.1.0');
    });

    it('preserves exact versions', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('1.0.0', { major: 1, minor: 0, patch: 0 }), '1.0.0');
    });

    it('handles < ranges', () => {
      const checker = new OutdatedChecker(makeConfig());
      const calc = checker.calculateWantedVersion.bind(checker);
      assert.equal(calc('<3.0.0', { major: 3, minor: 0, patch: 0 }), '<3.0.0');
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
    assert.ok(result.errors.includes('maxMajor must be a valid non-negative number'));
  });

  it('rejects invalid format', () => {
    const result = ConfigLoader.validate(makeConfig({ format: 'invalid' }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('format')));
  });

  it('accepts markdown as valid format', () => {
    const result = ConfigLoader.validate(makeConfig({ format: 'markdown' }));
    assert.equal(result.valid, true);
  });

  it('rejects empty include array', () => {
    const result = ConfigLoader.validate(makeConfig({ include: [] }));
    assert.equal(result.valid, false);
  });

  it('rejects non-HTTPS registry (not localhost)', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://evil.com' }));
    assert.equal(result.valid, false);
  });

  it('allows HTTP localhost registry', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://localhost:4873' }));
    assert.equal(result.valid, true);
  });

  it('allows HTTP 127.0.0.1 localhost registry', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://127.0.0.1:4873' }));
    assert.equal(result.valid, true);
  });

  it('rejects non-localhost IP registry (SSRF protection)', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'https://192.168.1.1' }));
    assert.equal(result.valid, false);
  });

  it('rejects invalid registry URL', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'not-a-url' }));
    assert.equal(result.valid, false);
  });

  it('rejects non-standard ports on non-localhost', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'https://registry.example.com:8080' }));
    assert.equal(result.valid, false);
  });

  it('rejects unknown registry hostname', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'https://evil-registry.com' }));
    assert.equal(result.valid, false);
  });

  it('rejects invalid cacheTTL', () => {
    const result = ConfigLoader.validate(makeConfig({ cacheTTL: -1 }));
    assert.equal(result.valid, false);
  });

  it('rejects invalid include types', () => {
    const result = ConfigLoader.validate(makeConfig({ include: ['peer'] }));
    assert.equal(result.valid, false);
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

  it('formats JSON output with onlyViolations (suppresses totalChecked)', () => {
    const formatter = new Formatter({ ...config, format: 'json', onlyViolations: true });
    const output = formatter.format(resultWithViolations);
    const parsed = JSON.parse(output);
    assert.equal(parsed.totalChecked, undefined);
    assert.equal(parsed.violationsCount, 1);
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

  it('formats table output with violations', () => {
    const formatter = new Formatter({ ...config, format: 'table' });
    const output = formatter.format(resultWithViolations);
    assert.ok(output.includes('react'));
    assert.ok(output.includes('violation'));
  });

  it('formats table output without violations', () => {
    const formatter = new Formatter({ ...config, format: 'table' });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
  });

  it('formats verbose output', () => {
    const formatter = new Formatter({ ...config, format: 'text', verbose: true });
    const output = formatter.formatVerbose(resultWithViolations);
    assert.ok(output.includes('Configuration:'));
    assert.ok(output.includes('Registry:'));
  });

  it('verbose output includes exclude list', () => {
    const formatter = new Formatter({ ...config, format: 'text', verbose: true, exclude: ['lodash', 'chalk'] });
    const output = formatter.formatVerbose(resultWithViolations);
    assert.ok(output.includes('lodash'));
    assert.ok(output.includes('chalk'));
  });

  it('verbose output shows none for empty exclude', () => {
    const formatter = new Formatter({ ...config, format: 'text', verbose: true });
    const output = formatter.formatVerbose(resultWithViolations);
    assert.ok(output.includes('none'));
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

  it('suppresses totalChecked in JSON format when onlyViolations=true', () => {
    const formatter = new Formatter({ ...config, format: 'json', onlyViolations: true });
    const output = formatter.format(resultWithViolations);
    const parsed = JSON.parse(output);
    assert.equal(parsed.totalChecked, undefined);
    assert.equal(parsed.passed, false);
    assert.equal(parsed.violationsCount, 1);
  });

  it('includes totalChecked in JSON format when onlyViolations=false', () => {
    const formatter = new Formatter({ ...config, format: 'json', onlyViolations: false });
    const output = formatter.format(resultWithViolations);
    const parsed = JSON.parse(output);
    assert.equal(parsed.totalChecked, 10);
    assert.equal(parsed.passed, false);
    assert.equal(parsed.violationsCount, 1);
  });

  it('suppresses totalChecked in text format when onlyViolations=true with violations', () => {
    const formatter = new Formatter({ ...config, format: 'text', onlyViolations: true });
    const output = formatter.format(resultWithViolations);
    assert.ok(output.includes('react'));
    assert.ok(output.includes('1 violation(s) found'));
    assert.ok(!output.includes('10') || !output.includes('dependencies'));
  });

  it('suppresses totalChecked in text format when onlyViolations=true without violations', () => {
    const formatter = new Formatter({ ...config, format: 'text', onlyViolations: true });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
    assert.ok(!output.includes('10') || !output.includes('dependencies'));
  });

  it('includes totalChecked in text format when onlyViolations=false without violations', () => {
    const formatter = new Formatter({ ...config, format: 'text', onlyViolations: false });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
    assert.ok(output.includes('10'));
    assert.ok(output.includes('dependencies'));
  });

  it('suppresses totalChecked in markdown format when onlyViolations=true with violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown', onlyViolations: true });
    const output = formatter.format(resultWithViolations);
    assert.ok(output.includes('react'));
    assert.ok(output.includes('1 violation(s)'));
    assert.ok(!output.includes('10 dependencies'));
  });

  it('suppresses totalChecked in markdown format when onlyViolations=true without violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown', onlyViolations: true });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
    assert.ok(!output.includes('10 dependencies'));
  });

  it('includes totalChecked in markdown format when onlyViolations=false without violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown', onlyViolations: false });
    const output = formatter.format(resultNoViolations);
    assert.ok(output.includes('within threshold limits'));
    assert.ok(output.includes('10'));
  });
});

// ─── Network & Cache (mocked) ───
describe('Network & Cache', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('check() reads package.json and detects violations', async () => {
    // Mock fetch to return a newer version
    globalThis.fetch = async (url) => {
      const pkgName = decodeURIComponent(url.split('/').pop());
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': {
            latest: pkgName === 'react' ? '19.0.0' : '1.0.0',
          },
        }),
      };
    };

    // Create a temp project
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
    const { violations, totalChecked } = await checker.check();
    assert.equal(totalChecked, 1);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].name, 'react');
    assert.equal(violations[0].majorDiff, 1);
  });

  it('check() returns no violations when versions are within thresholds', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': { latest: '18.2.1' } }),
    });

    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.2.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
    const { violations, totalChecked } = await checker.check();
    assert.equal(totalChecked, 1);
    assert.equal(violations.length, 0);
  });

  it('handles 404 from registry gracefully', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });

    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'nonexistent-pkg': '^1.0.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
    const { totalChecked } = await checker.check();
    assert.equal(totalChecked, 0);
  });

  it('handles network errors with retry', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls < 3) throw new Error('Network error');
      return {
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '1.0.0' } }),
      };
    };

    const { mkdtempSync, writeFileSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'test-pkg': '^1.0.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0, verbose: true }), tmpDir);
    const { totalChecked } = await checker.check();
    assert.ok(calls >= 2);
  });

  it('respects exclude patterns during check', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': { latest: '99.0.0' } }),
    });

    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0, exclude: ['react'] }), tmpDir);
    const { violations, totalChecked } = await checker.check();
    assert.equal(totalChecked, 2);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].name, 'lodash');
  });

  it('filters by dependency type (prod only)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ 'dist-tags': { latest: '99.0.0' } }),
    });

    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-test-'));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0' },
      devDependencies: { jest: '^29.0.0' },
    }));

    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0, include: ['prod'] }), tmpDir);
    const { totalChecked } = await checker.check();
    assert.equal(totalChecked, 1);
  });
});

// ─── Enhanced Features ───
describe('Enhanced Features', () => {
  describe('checkWithTransitive', () => {
    it('method exists and is callable', async () => {
      const checker = new OutdatedChecker(makeConfig({ transitive: true }));
      assert.ok(typeof checker.checkWithTransitive === 'function');
    });

    it('parses lockfileVersion 3 packages format for transitive deps', async () => {
      // Mock fetch to return latest versions
      globalThis.fetch = async (url) => {
        const pkgName = decodeURIComponent(String(url).split('/').pop() || '');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            'dist-tags': {
              latest: pkgName === 'lodash' ? '4.17.99' : '2.0.0',
            },
          }),
        };
      };

      const { mkdtempSync, writeFileSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-v3-'));
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { express: '^4.18.0' },
      }));
      // lockfileVersion 3 with "packages" format (standard since npm v7)
      writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'test-project', version: '1.0.0', dependencies: { express: '^4.18.0' } },
          'node_modules/express': { version: '4.18.0' },
          'node_modules/body-parser': { version: '1.20.0' },
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/@types/node': { version: '20.0.0' },
        },
      }));

      const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
      const { totalChecked, violations } = await checker.checkWithTransitive();

      // express (direct) + body-parser + lodash + @types/node = 4 total
      assert.equal(totalChecked, 4);
      // lodash 4.17.21 -> 4.17.99 is patch diff 78, exceeds default maxPatch=5
      const lodashViolation = violations.find(v => v.name === 'lodash');
      assert.ok(lodashViolation, 'lodash should be a violation');
      assert.equal(lodashViolation.majorDiff, 0);
      assert.equal(lodashViolation.minorDiff, 0);
      assert.equal(lodashViolation.patchDiff, 78);
    });

    it('handles nested node_modules paths in lockfileVersion 3', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '1.0.0' } }),
      });

      const { mkdtempSync, writeFileSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-nested-'));
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { foo: '^1.0.0' },
      }));
      writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'test-project', version: '1.0.0', dependencies: { foo: '^1.0.0' } },
          'node_modules/foo': { version: '1.0.0' },
          'node_modules/foo/node_modules/bar': { version: '2.0.0' },
        },
      }));

      const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
      const { totalChecked } = await checker.checkWithTransitive();
      // foo (direct) + bar (transitive, nested) = 2
      assert.equal(totalChecked, 2);
    });

    it('skips linked packages in lockfileVersion 3', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '1.0.0' } }),
      });

      const { mkdtempSync, writeFileSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const tmpDir = mkdtempSync(join(tmpdir(), 'npm-outdated-link-'));
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        dependencies: { foo: '^1.0.0' },
      }));
      writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'test-project', version: '1.0.0', dependencies: { foo: '^1.0.0' } },
          'node_modules/foo': { version: '1.0.0' },
          'node_modules/internal-pkg': { link: true, resolved: 'packages/internal-pkg' },
        },
      }));

      const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }), tmpDir);
      const { totalChecked } = await checker.checkWithTransitive();
      // foo (direct) + internal-pkg skipped (link: true) = 1
      assert.equal(totalChecked, 1);
    });
  });

  describe('cache behavior', () => {
    it('check method is callable', async () => {
      const checker = new OutdatedChecker(makeConfig());
      assert.ok(typeof checker.check === 'function');
    });
  });
});
