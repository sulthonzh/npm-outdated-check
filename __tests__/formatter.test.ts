import { describe, it, expect } from 'vitest';
import { Formatter } from '../src/lib/formatter.js';
import type { Config, CheckResult } from '../src/types/config.js';

describe('Formatter', () => {
  const config: Config = {
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

  const resultWithViolations: CheckResult = {
    violations: [
      {
        name: 'react',
        current: '^18.0.0',
        latest: '19.0.0',
        type: 'prod',
        majorDiff: 1,
        minorDiff: 0,
        patchDiff: 0,
        isViolation: true,
      },
    ],
    totalChecked: 10,
    passed: false,
    config,
  };

  const resultWithoutViolations: CheckResult = {
    violations: [],
    totalChecked: 10,
    passed: true,
    config,
  };

  it('should format JSON output', () => {
    const formatter = new Formatter({ ...config, format: 'json' });
    const output = formatter.format(resultWithViolations);
    const parsed = JSON.parse(output);

    expect(parsed.passed).toBe(false);
    expect(parsed.violationsCount).toBe(1);
    expect(parsed.violations[0].name).toBe('react');
  });

  it('should format text output with violations', () => {
    const formatter = new Formatter({ ...config, format: 'text' });
    const output = formatter.format(resultWithViolations);

    expect(output).toContain('react');
    expect(output).toContain('^18.0.0');
    expect(output).toContain('19.0.0');
    expect(output).toContain('1 violation(s) found');
  });

  it('should format text output without violations', () => {
    const formatter = new Formatter({ ...config, format: 'text' });
    const output = formatter.format(resultWithoutViolations);

    expect(output).toContain('within threshold limits');
  });

  it('should format verbose output', () => {
    const formatter = new Formatter({ ...config, format: 'text', verbose: true });
    const output = formatter.formatVerbose(resultWithViolations);

    expect(output).toContain('Configuration:');
    expect(output).toContain('Registry:');
  });

  it('should format markdown output with violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown' });
    const output = formatter.format(resultWithViolations);

    expect(output).toContain('## Dependency Check');
    expect(output).toContain('react');
    expect(output).toContain('1 violation(s)');
    expect(output).toContain('| Package |');
    expect(output).toContain('**1** ⚠️'); // major diff highlighted
  });

  it('should format markdown output without violations', () => {
    const formatter = new Formatter({ ...config, format: 'markdown' });
    const output = formatter.format(resultWithoutViolations);

    expect(output).toContain('## Dependency Check');
    expect(output).toContain('within threshold');
    expect(output).toContain('10');
  });

  it('should format markdown with multiple violations', () => {
    const multiResult: CheckResult = {
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

    expect(output).toContain('react');
    expect(output).toContain('lodash');
    expect(output).toContain('2 violation(s)');
    expect(output).toContain('**21** ⚠️'); // patch diff highlighted
  });
});
