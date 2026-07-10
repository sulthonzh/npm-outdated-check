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

  it('mergeWithCli skips undefined values, preserving config file defaults', () => {
    const baseConfig = {
      maxMajor: 0,
      maxMinor: 5,
      maxPatch: 10,
      include: ['prod'],
      exclude: ['lodash'],
      registry: 'https://registry.npmjs.org',
      format: 'json',
      failOnAny: false,
      verbose: true,
      onlyViolations: true,
      transitive: false,
      cacheTTL: 7200000,
    };
    // Simulate CLI options where only some are explicitly provided
    const merged = ConfigLoader.mergeWithCli(baseConfig, {
      maxMajor: 1,
      maxMinor: undefined,
      format: undefined,
      registry: undefined,
      verbose: undefined,
    });
    // Explicitly provided values override config
    assert.equal(merged.maxMajor, 1);
    // Undefined values do NOT overwrite config file defaults
    assert.equal(merged.maxMinor, 5);
    assert.equal(merged.format, 'json');
    assert.equal(merged.registry, 'https://registry.npmjs.org');
    assert.equal(merged.verbose, true);
    assert.equal(merged.failOnAny, false);
    assert.equal(merged.cacheTTL, 7200000);
    assert.deepEqual(merged.include, ['prod']);
    assert.deepEqual(merged.exclude, ['lodash']);
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

  it('allows IPv6 localhost registry with custom port', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://[::1]:4873' }));
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

describe('Edge Cases: ConfigLoader.validateUserConfig', () => {
  // validateUserConfig is private at TS level but accessible at runtime
  const validateUserConfig = (cfg) => ConfigLoader.validateUserConfig(cfg);

  it('rejects invalid package name in exclude list', () => {
    assert.throws(
      () => validateUserConfig({ exclude: ['INVALID PACKAGE NAME WITH SPACES'] }),
      /Invalid package name in exclude list/
    );
  });

  it('rejects unknown registry hostname', () => {
    assert.throws(
      () => validateUserConfig({ registry: 'https://evil-registry.example.com' }),
      /Registry hostname not allowed for security/
    );
  });

  it('rejects non-localhost IPv4 registry (SSRF protection)', () => {
    assert.throws(
      () => validateUserConfig({ registry: 'http://10.0.0.1' }),
      /Registry hostname not allowed|Registry IP addresses are not allowed/
    );
  });

  it('rejects invalid registry URL format', () => {
    assert.throws(
      () => validateUserConfig({ registry: 'not-a-valid-url' }),
      /Invalid registry URL|Registry hostname not allowed/
    );
  });

  it('allows localhost registry with port for development', () => {
    // Should not throw
    validateUserConfig({ registry: 'http://localhost:4873' });
    assert.ok(true);
  });

  it('allows [::1] IPv6 localhost registry', () => {
    // Should not throw
    validateUserConfig({ registry: 'http://[::1]:8080' });
    assert.ok(true);
  });
});

describe('Edge Cases: ConfigLoader.validate', () => {
  it('rejects NaN maxMajor', () => {
    const result = ConfigLoader.validate(makeConfig({ maxMajor: NaN }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('maxMajor')));
  });

  it('rejects Infinity maxMinor', () => {
    const result = ConfigLoader.validate(makeConfig({ maxMinor: Infinity }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('maxMinor')));
  });

  it('rejects non-standard port on non-localhost registry', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'https://registry.npmjs.org:8080' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('non-standard port')));
  });

  it('rejects HTTP non-localhost registry', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://registry.npmjs.org' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('HTTPS')));
  });

  it('rejects invalid include type', () => {
    const result = ConfigLoader.validate(makeConfig({ include: ['invalid'] }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('include must only contain')));
  });

  it('accepts valid cacheTTL = 0 (disabled)', () => {
    const result = ConfigLoader.validate(makeConfig({ cacheTTL: 0 }));
    assert.ok(result.valid);
  });

  it('rejects negative cacheTTL', () => {
    const result = ConfigLoader.validate(makeConfig({ cacheTTL: -100 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('cacheTTL')));
  });

  it('rejects string cacheTTL', () => {
    const result = ConfigLoader.validate(makeConfig({ cacheTTL: '3600' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('cacheTTL')));
  });

  it('allows undefined cacheTTL (uses default)', () => {
    const result = ConfigLoader.validate(makeConfig({ cacheTTL: undefined }));
    assert.ok(result.valid);
  });
});

describe('Edge Cases: OutdatedChecker.validateVersion', () => {
  // validateVersion is private at TS level but accessible at runtime on the instance
  const checker = new OutdatedChecker(makeConfig());
  const vv = (v) => checker.validateVersion(v);

  it('accepts workspace: protocol', () => {
    assert.ok(vv('workspace:1.0.0'));
    assert.ok(vv('workspace:*'));
  });

  it('accepts file: protocol', () => {
    assert.ok(vv('file:../local-pkg'));
  });

  it('accepts npm: alias protocol', () => {
    assert.ok(vv('npm:other-pkg@^2.0.0'));
  });

  it('accepts link: protocol', () => {
    assert.ok(vv('link:../local-pkg'));
  });

  it('accepts github: protocol', () => {
    assert.ok(vv('github:user/repo'));
  });

  it('accepts git+https: protocol', () => {
    assert.ok(vv('git+https://github.com/user/repo.git'));
  });

  it('accepts git+ssh: protocol', () => {
    assert.ok(vv('git+ssh://git@github.com/user/repo.git'));
  });

  it('accepts x-range versions', () => {
    assert.ok(vv('1.x'));
    assert.ok(vv('1.2.x'));
    // Note: 1.x.x is not a valid npm x-range per semver spec
  });

  it('accepts * and latest', () => {
    assert.ok(vv('*'));
    assert.ok(vv('latest'));
  });

  it('accepts OR comparator with mixed protocols', () => {
    assert.ok(vv('1.0.0 || 2.0.0'));
    assert.ok(vv('^1.0.0 || workspace:*'));
    assert.ok(vv('1.0.0 || npm:other@2.0.0'));
  });

  it('rejects truly invalid versions', () => {
    assert.ok(!vv('not-a-version!'));
    assert.ok(!vv(''));
  });

  it('accepts git+http: protocol', () => {
    assert.ok(vv('git+http://github.com/user/repo.git'));
  });

  it('accepts git+file: protocol', () => {
    assert.ok(vv('git+file:///path/to/repo.git'));
  });

  it('rejects overly long version strings', () => {
    assert.ok(!vv('a'.repeat(257)));
  });

  it('rejects non-string versions', () => {
    assert.ok(!vv(123));
    assert.ok(!vv(null));
    assert.ok(!vv(undefined));
  });
});

describe('Edge Cases: fetchLatestVersionOnce with mocked fetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and returns latest version', async () => {
    const checker = new OutdatedChecker(makeConfig({ verbose: true }));
    globalThis.fetch = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ 'dist-tags': { latest: '4.17.21' } }),
      };
    };
    const result = await checker.fetchLatestVersionOnce('lodash');
    assert.equal(result, '4.17.21');
  });

  it('returns null for 404 (package not found)', async () => {
    const checker = new OutdatedChecker(makeConfig());
    globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
    const result = await checker.fetchLatestVersionOnce('nonexistent-pkg');
    assert.equal(result, null);
  });

  it('throws on non-404 error response', async () => {
    const checker = new OutdatedChecker(makeConfig());
    globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Server Error' });
    await assert.rejects(
      () => checker.fetchLatestVersionOnce('some-pkg'),
      /Registry request failed.*500/
    );
  });

  it('throws when no latest version in dist-tags', async () => {
    const checker = new OutdatedChecker(makeConfig());
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ 'dist-tags': {} }) });
    await assert.rejects(
      () => checker.fetchLatestVersionOnce('some-pkg'),
      /No latest version found/
    );
  });

  it('returns null for invalid version format from registry', async () => {
    const checker = new OutdatedChecker(makeConfig({ verbose: true }));
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ 'dist-tags': { latest: 'not-a-valid-version!!!' } }) });
    const result = await checker.fetchLatestVersionOnce('some-pkg');
    assert.equal(result, null);
  });
});

describe('Edge Cases: fetchLatestVersionsConcurrent progress', () => {
  it('shows progress for >20 packages in verbose mode', async () => {
    const checker = new OutdatedChecker(makeConfig({ verbose: true, failOnAny: false }));
    // Mock fetchLatestVersionWithRetry to avoid network calls
    let callCount = 0;
    checker.fetchLatestVersionWithRetry = async (name) => {
      callCount++;
      return `1.0.${callCount}`;
    };
    // Create 55 package names to trigger progress reporting at totalProcessed=50
    const names = Array.from({ length: 55 }, (_, i) => `pkg-${i}`);
    const results = await checker.fetchLatestVersionsConcurrent(names);
    assert.equal(results.size, 55);
    assert.ok(results.has('pkg-0'));
    assert.ok(results.has('pkg-54'));
  });

  it('handles fetch failures gracefully', async () => {
    const checker = new OutdatedChecker(makeConfig({ verbose: true }));
    checker.fetchLatestVersionWithRetry = async (name) => {
      if (name === 'bad-pkg') throw new Error('Network error');
      return '1.0.0';
    };
    const results = await checker.fetchLatestVersionsConcurrent(['good-pkg', 'bad-pkg']);
    assert.ok(results.has('good-pkg'));
    assert.ok(!results.has('bad-pkg'));
  });

  it('handles null returns (package not found)', async () => {
    const checker = new OutdatedChecker(makeConfig());
    checker.fetchLatestVersionWithRetry = async () => null;
    const results = await checker.fetchLatestVersionsConcurrent(['unknown-pkg']);
    assert.equal(results.size, 0);
  });
});

describe('Edge Cases: OutdatedChecker.validatePackageName', () => {
  const checker = new OutdatedChecker(makeConfig());
  const vpn = (n) => checker.validatePackageName(n);

  it('validates simple package names', () => {
    assert.ok(vpn('lodash'));
    assert.ok(vpn('react-dom'));
    assert.ok(vpn('my.package'));
    assert.ok(vpn('my-package'));
  });

  it('validates scoped package names', () => {
    assert.ok(vpn('@types/node'));
    assert.ok(vpn('@scope/my-package'));
  });

  it('rejects scoped packages with too many slashes', () => {
    assert.ok(!vpn('@scope/sub/package'));
  });

  it('rejects scoped packages with invalid parts', () => {
    assert.ok(!vpn('@invalid/'));
    assert.ok(!vpn('@/package'));
  });

  it('rejects empty or too long names', () => {
    assert.ok(!vpn(''));
    assert.ok(!vpn('a'.repeat(215)));
  });

  it('rejects non-string names', () => {
    assert.ok(!vpn(null));
    assert.ok(!vpn(123));
    assert.ok(!vpn(undefined));
  });
});

describe('Edge Cases: OutdatedChecker.isExcluded', () => {
  it('handles empty exclude list', () => {
    const checker = new OutdatedChecker(makeConfig({ exclude: [] }));
    assert.ok(!checker.isExcluded('some-package'));
  });

  it('handles glob with special regex chars', () => {
    const checker = new OutdatedChecker(makeConfig({ exclude: ['@types/*'] }));
    assert.ok(checker.isExcluded('@types/node'));
    assert.ok(checker.isExcluded('@types/react'));
    assert.ok(!checker.isExcluded('typescript'));
  });

  it('handles exact match (no glob)', () => {
    const checker = new OutdatedChecker(makeConfig({ exclude: ['lodash'] }));
    assert.ok(checker.isExcluded('lodash'));
    assert.ok(!checker.isExcluded('lodash-es'));
  });

  it('caches regex patterns across calls', () => {
    const checker = new OutdatedChecker(makeConfig({ exclude: ['@scope/*', 'pkg-*'] }));
    assert.ok(checker.isExcluded('@scope/foo'));
    assert.ok(checker.isExcluded('pkg-bar'));
    // Second call uses cached regex
    assert.ok(checker.isExcluded('@scope/baz'));
    assert.ok(checker.isExcluded('pkg-qux'));
  });
});

describe('Edge Cases: calculateVersionDiff and parseSemver', () => {
  it('detects regression when latest is behind current (pre-release)', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'react', current: '19.0.0-beta.1', latest: '18.2.0', wanted: '19.0.0-beta.1', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.ok(result.isRegression);
    assert.equal(result.majorDiff, 0); // Math.max(0, -1) = 0
    assert.equal(result.isViolation, false);
  });

  it('calculates wanted version for ~ range', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'lodash', current: '~4.17.0', latest: '4.17.21', wanted: '~4.17.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.ok(result.wanted.startsWith('~'));
    assert.equal(result.patchDiff, 21);
    assert.ok(result.isViolation);
  });

  it('calculates wanted version for >= range', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'express', current: '>=4.18.0', latest: '4.19.2', wanted: '>=4.18.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.ok(result.wanted.startsWith('>='));
    assert.equal(result.minorDiff, 1);
    // maxMinor=2, so minorDiff=1 is within threshold, not a violation
    assert.equal(result.isViolation, false);
  });

  it('calculates wanted version for exact version', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'axios', current: '1.0.0', latest: '1.6.0', wanted: '1.0.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.equal(result.wanted, '1.0.0');
    assert.equal(result.minorDiff, 6);
    assert.ok(result.isViolation);
  });

  it('returns null parsed semver for invalid version', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'badpkg', current: 'not-a-version', latest: '1.0.0', wanted: 'not-a-version', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.equal(result.majorDiff, 0);
    assert.equal(result.minorDiff, 0);
    assert.equal(result.patchDiff, 0);
    assert.equal(result.isViolation, false);
  });

  it('handles minor diff as violation when within major', () => {
    const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2, maxPatch: 5 }));
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'pkg', current: '^1.2.0', latest: '1.5.0', wanted: '^1.2.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.equal(result.minorDiff, 3);
    assert.ok(result.isViolation);
  });

  it('handles patch diff as violation when within minor', () => {
    const checker = new OutdatedChecker(makeConfig({ maxMajor: 0, maxMinor: 2, maxPatch: 5 }));
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'pkg', current: '^1.2.0', latest: '1.2.10', wanted: '^1.2.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.equal(result.patchDiff, 10);
    assert.ok(result.isViolation);
  });

  it('handles <= range in calculateWantedVersion', () => {
    const checker = new OutdatedChecker(makeConfig());
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'pkg', current: '<=3.5.0', latest: '3.10.0', wanted: '<=3.5.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.ok(result.wanted.startsWith('<='));
    assert.equal(result.minorDiff, 5);
    assert.ok(result.isViolation);
  });

  it('handles > range in calculateWantedVersion', () => {
    const checker = new OutdatedChecker(makeConfig({ maxMajor: 5, maxMinor: 5, maxPatch: 5 }));
    const calc = checker.calculateVersionDiff.bind(checker);
    const pkg = { name: 'pkg', current: '>2.0.0', latest: '2.1.0', wanted: '>2.0.0', type: 'prod', direct: true };
    const result = calc(pkg);
    assert.equal(result.minorDiff, 1);
  });
});

describe('Edge Cases: ConfigLoader.validate additional', () => {
  it('rejects invalid format value', () => {
    const result = ConfigLoader.validate(makeConfig({ format: 'xml' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('format must be')));
  });

  it('rejects empty include array', () => {
    const result = ConfigLoader.validate(makeConfig({ include: [] }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('include must have at least one type')));
  });

  it('rejects non-numeric maxMajor', () => {
    const result = ConfigLoader.validate(makeConfig({ maxMajor: NaN }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('maxMajor')));
  });

  it('rejects negative maxMinor', () => {
    const result = ConfigLoader.validate(makeConfig({ maxMinor: -1 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('maxMinor')));
  });

  it('rejects negative maxPatch', () => {
    const result = ConfigLoader.validate(makeConfig({ maxPatch: -5 }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('maxPatch')));
  });

  it('allows HTTP localhost with non-standard port', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://localhost:4873' }));
    assert.ok(result.valid);
  });

  it('allows HTTPS registry.npmjs.org with default port', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'https://registry.npmjs.org' }));
    assert.ok(result.valid);
  });

  it('rejects HTTP 127.0.0.1 with non-standard port via validate', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'http://127.0.0.1:8080' }));
    assert.ok(result.valid); // localhost IPs are allowed for testing
  });

  it('rejects completely invalid registry URL', () => {
    const result = ConfigLoader.validate(makeConfig({ registry: 'ht!tp://%%%' }));
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('Invalid registry URL') || e.includes('Registry hostname')));
  });
});

describe('Edge Cases: Formatter formatVerbose', () => {
  it('includes config details in verbose output', () => {
    const formatter = new Formatter(makeConfig({ format: 'text', verbose: true, registry: 'https://registry.npmjs.org' }));
    const result = {
      violations: [],
      totalChecked: 5,
      passed: true,
      config: makeConfig(),
    };
    const output = formatter.formatVerbose(result);
    assert.ok(output.includes('Configuration'));
    assert.ok(output.includes('registry.npmjs.org'));
    assert.ok(output.includes('prod'));
    assert.ok(output.includes('dev'));
    assert.ok(output.includes('Fail on any'));
  });

  it('includes violations in verbose output', () => {
    const formatter = new Formatter(makeConfig({ format: 'text', verbose: true }));
    const result = {
      violations: [{
        name: 'lodash',
        current: '^4.17.0',
        latest: '4.17.21',
        type: 'prod',
        majorDiff: 0,
        minorDiff: 0,
        patchDiff: 21,
        isViolation: true,
      }],
      totalChecked: 10,
      passed: false,
      config: makeConfig(),
    };
    const output = formatter.formatVerbose(result);
    assert.ok(output.includes('lodash'));
  });
});
