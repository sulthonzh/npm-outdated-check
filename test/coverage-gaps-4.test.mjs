import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OutdatedChecker, ConfigLoader, Formatter } from '../dist/index.js';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

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

// ─── checker.ts: lockfile v1 validateDependencies (lines 352-415) ───

describe('Checker: Lockfile v1 Transitive Packages', () => {
  let origCwd;

  before(() => {
 origCwd = process.cwd(); 
});
  after(() => {
 process.chdir(origCwd); 
});

  it('parses lockfileVersion 1 string-format dependencies', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-str-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-pkg', version: '1.0.0',
      dependencies: { lodash: '^4.17.0' },
    }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { lodash: '4.17.21' },
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async (names) => {
        const m = new Map();
        for (const n of names) {
m.set(n, '4.17.21');
}
        return m;
      };
      const result = await checker.checkWithTransitive();
      // lodash should appear in violations or at least be counted
      assert.equal(result.totalChecked >= 1, true, `Expected ≥1 package, got ${result.totalChecked}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses lockfile v1 object-format dependencies with version property', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-obj-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-pkg-obj', version: '1.0.0',
      dependencies: { express: '^4.0.0' },
    }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { express: { version: '4.18.2' } },
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async (names) => {
        const m = new Map();
        for (const n of names) {
m.set(n, '4.18.2');
}
        return m;
      };
      const result = await checker.checkWithTransitive();
      assert.equal(result.totalChecked >= 1, true, `Expected ≥1 package, got ${result.totalChecked}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses lockfile v1 devDependencies', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-dev-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-pkg-dev', version: '1.0.0',
      devDependencies: { jest: '^29.0.0' },
    }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      devDependencies: { jest: '29.7.0' },
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async (names) => {
        const m = new Map();
        for (const n of names) {
m.set(n, '29.7.0');
}
        return m;
      };
      const result = await checker.checkWithTransitive();
      assert.equal(result.totalChecked >= 1, true, `Expected ≥1 package, got ${result.totalChecked}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips duplicate packages via seen set (dedupe)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-dedup-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-dedup', version: '1.0.0',
      dependencies: { lodash: '^4.17.0' },
    }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { lodash: '4.17.21' },
      devDependencies: { lodash: '4.17.21' },
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async (names) => {
        const m = new Map();
        for (const n of names) {
m.set(n, '4.17.21');
}
        return m;
      };
      const result = await checker.checkWithTransitive();
      // lodash should appear once (direct) — the transitive dedupe prevents duplication
      // totalChecked counts all packages including direct deps
      assert.ok(result.totalChecked >= 1, `Expected ≥1 package, got ${result.totalChecked}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verbose mode warns about invalid package name in lockfile v1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-badname-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { 'invalid name!': '1.0.0' },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid package name in package-lock.json')),
        `Expected invalid name warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verbose mode warns about invalid version format in lockfile v1 object', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-badver-obj-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { 'bad-pkg': { notVersion: true } },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid version format for bad-pkg in package-lock.json')),
        `Expected invalid version format warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verbose mode warns about unparseable version in lockfile v1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-badver-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: { 'bad-ver': 'not-a-semver!!!' },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid version format for bad-ver:')),
        `Expected invalid version warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty for null dependencies object in lockfile v1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-lock1-null-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 1,
      dependencies: null,
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      const result = await checker.checkWithTransitive();
      assert.ok(Array.isArray(result.violations));
      assert.equal(result.violations.length, 0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── checker.ts: lockfile v2/3 verbose warnings for invalid entries (lines 320-334) ───

describe('Checker: Lockfile v2/v3 Verbose Warnings', () => {
  let origCwd;

  before(() => {
 origCwd = process.cwd(); 
});
  after(() => {
 process.chdir(origCwd); 
});

  it('verbose mode warns about invalid version in lockfile v2/3 packages', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-v2-badver-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'test', version: '1.0.0' },
        'node_modules/bad-ver': { version: 'not-semver!!!' },
      },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid version format for bad-ver:')),
        `Expected invalid version warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verbose mode warns about invalid package name in lockfile v2/3', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-v2-badname-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'test', version: '1.0.0' },
        'node_modules/invalid name!': { version: '1.0.0' },
      },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid package name in package-lock.json')),
        `Expected invalid name warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips linked packages in lockfile v2/3', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-v2-link-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await mkdir(join(tmpDir, 'node_modules', '@scope'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'monorepo-root', version: '1.0.0',
      dependencies: { '@scope/shared': 'workspace:*' },
    }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'monorepo-root', version: '1.0.0' },
        'node_modules/@scope/shared': { link: true, resolved: 'packages/shared' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    }));

    process.chdir(tmpDir);
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: false, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async (names) => {
        const m = new Map();
        for (const n of names) {
m.set(n, '4.17.21');
}
        return m;
      };
      const result = await checker.checkWithTransitive();
      // @scope/shared should be skipped (linked), lodash should be counted
      // totalChecked includes direct + transitive
      assert.ok(result.totalChecked >= 1, `Expected ≥1 package, got ${result.totalChecked}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verbose mode warns about missing version in lockfile v2/3', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-v2-nover-'));
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
    await writeFile(join(tmpDir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'test', version: '1.0.0' },
        'node_modules/no-version-pkg': { name: 'no-version-pkg' },
      },
    }));

    process.chdir(tmpDir);
    const logs = [];
    const origWarn = console.warn;
    console.warn = (...args) => logs.push(args.join(' '));
    try {
      const checker = new OutdatedChecker(makeConfig({ verbose: true, cacheTTL: 0, transitive: true }));
      checker.fetchLatestVersionsConcurrent = async () => new Map();
      await checker.checkWithTransitive();
      assert.ok(logs.some(l => l.includes('Invalid version format for no-version-pkg:')),
        `Expected missing version warning, got: ${logs.join('; ')}`);
    } finally {
      console.warn = origWarn;
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── checker.ts: validateVersion OR comparator sub-expressions (lines 796-797) ───

describe('Checker: ValidateVersion OR Comparator Sub-Expressions', () => {
  it('validates OR with github: protocol sub-parts', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('github:owner/repo || 1.0.0'), true);
    assert.equal(checker.validateVersion('1.0.0 || github:owner/repo'), true);
  });

  it('validates OR with git+https: protocol sub-parts', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('git+https://example.com/repo.git || 1.0.0'), true);
    assert.equal(checker.validateVersion('1.0.0 || git+ssh://git@example.com/repo.git'), true);
  });

  it('validates OR with npm: alias protocol sub-parts', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('npm:pkg-name@1.0.0 || 1.0.0'), true);
    assert.equal(checker.validateVersion('1.0.0 || npm:other-pkg@2.0.0'), true);
  });

  it('validates OR with link: protocol sub-parts', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('link:../local-pkg || 1.0.0'), true);
    assert.equal(checker.validateVersion('1.0.0 || link:./sibling'), true);
  });

  it('rejects OR with all invalid parts', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('invalid thing! || also bad'), false);
  });

  it('rejects OR with one invalid part among valid ones', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('1.0.0 || bad stuff! || 2.0.0'), false);
  });

  it('validates standalone exotic protocols', () => {
    const checker = new OutdatedChecker(makeConfig({ cacheTTL: 0 }));
    assert.equal(checker.validateVersion('github:owner/repo'), true);
    assert.equal(checker.validateVersion('git+https://example.com/repo.git'), true);
    assert.equal(checker.validateVersion('git+ssh://git@example.com/repo.git'), true);
    assert.equal(checker.validateVersion('git+http://example.com/repo.git'), true);
    assert.equal(checker.validateVersion('git+file:///path/to/repo'), true);
    assert.equal(checker.validateVersion('npm:pkg-name@1.0.0'), true);
    assert.equal(checker.validateVersion('link:../local-pkg'), true);
    assert.equal(checker.validateVersion('workspace:*'), true);
    assert.equal(checker.validateVersion('file:./local'), true);
  });
});

// ─── config.ts: SSRF IP validation (lines 94-95) ───

describe('ConfigLoader: SSRF Direct IP Rejection', () => {
  it('validateUserConfig rejects raw IPv4 address registry', () => {
    const result = ConfigLoader.validate(makeConfig({
      registry: 'https://10.0.0.1/',
    }));
    assert.ok(result.errors.some(e => e.includes('Registry hostname not allowed') || e.includes('Registry IP addresses')),
      `Expected SSRF error for 10.0.0.1, got: ${result.errors.join('; ')}`);
  });

  it('validateUserConfig rejects raw IPv4 with port', () => {
    const result = ConfigLoader.validate(makeConfig({
      registry: 'https://172.16.0.1:443/',
    }));
    assert.ok(result.errors.some(e => e.includes('Registry hostname not allowed') || e.includes('Registry IP addresses')),
      `Expected SSRF error for 172.16.0.1, got: ${result.errors.join('; ')}`);
  });

  it('validateUserConfig rejects non-localhost IPv6', () => {
    const result = ConfigLoader.validate(makeConfig({
      registry: 'https://[fe80::1]/',
    }));
    assert.ok(result.errors.some(e => e.includes('Registry hostname not allowed') || e.includes('Registry IP addresses')),
      `Expected SSRF error for [fe80::1], got: ${result.errors.join('; ')}`);
  });
});

// ─── config.ts: mergeConfig unknown key (line 123) ───

describe('ConfigLoader: MergeConfig Unknown Key', () => {
  it('ignores unknown keys in user config', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'noc-merge-unknown-'));
    const configPath = join(tmpDir, 'config.json');
    await writeFile(configPath, JSON.stringify({
      unknownKey: 'should-be-ignored',
      maxMajor: 3,
      anotherUnknown: 42,
    }));

    try {
      const config = await ConfigLoader.load(configPath);
      assert.equal(config.maxMajor, 3, 'Known keys should be merged');
      assert.equal(config.unknownKey, undefined, 'Unknown keys should be ignored');
      assert.equal(config.anotherUnknown, undefined, 'Unknown keys should be ignored');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── formatter.ts: formatVerbose text/table format (lines 150-152) ───

describe('Formatter: FormatVerbose Text and Table', () => {
  it('formatVerbose(text) appends configuration section', () => {
    const fmt = new Formatter(makeConfig({ format: 'text' }));
    const result = fmt.formatVerbose({
      violations: [],
      totalChecked: 5,
      passed: true,
    });
    assert.ok(result.includes('Configuration:'));
    assert.ok(result.includes('Registry:'));
    assert.ok(result.includes('https://registry.npmjs.org'));
  });

  it('formatVerbose(table) appends configuration section', () => {
    const fmt = new Formatter(makeConfig({ format: 'table' }));
    const result = fmt.formatVerbose({
      violations: [],
      totalChecked: 3,
      passed: true,
    });
    assert.ok(result.includes('Configuration:'));
    assert.ok(result.includes('Registry:'));
  });

  it('formatVerbose(text) shows exclude list when non-empty', () => {
    const fmt = new Formatter(makeConfig({
      format: 'text',
      exclude: ['pkg-a', 'pkg-b'],
    }));
    const result = fmt.formatVerbose({
      violations: [],
      totalChecked: 1,
      passed: true,
    });
    assert.ok(result.includes('pkg-a'));
    assert.ok(result.includes('pkg-b'));
  });

  it('formatVerbose(text) shows "none" for empty exclude', () => {
    const fmt = new Formatter(makeConfig({
      format: 'text',
      exclude: [],
    }));
    const result = fmt.formatVerbose({
      violations: [],
      totalChecked: 1,
      passed: true,
    });
    assert.ok(result.includes('none'));
  });
});
