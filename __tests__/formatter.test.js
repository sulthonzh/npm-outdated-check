import { describe, it, expect } from 'vitest';
import { Formatter } from '../src/lib/formatter.js';
describe('Formatter', () => {
    const config = {
        maxMajor: 0,
        maxMinor: 2,
        maxPatch: 5,
        include: ['prod', 'dev'],
        exclude: [],
        excludePatterns: [],
        ignoreRanges: false,
        registry: 'https://registry.npmjs.org',
        format: 'text',
        failOnAny: false,
        verbose: false,
        showSuggestions: false,
    };
    const resultWithViolations = {
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
                severity: 'major',
                suggestedBump: '^19.0.0',
            },
            {
                name: 'lodash',
                current: '^4.17.0',
                latest: '4.17.21',
                type: 'prod',
                majorDiff: 0,
                minorDiff: 0,
                patchDiff: 21,
                isViolation: true,
                severity: 'patch',
                suggestedBump: '^4.17.21',
            },
        ],
        totalChecked: 10,
        skipped: 2,
        passed: false,
        config,
    };
    const resultWithoutViolations = {
        violations: [],
        totalChecked: 10,
        skipped: 0,
        passed: true,
        config,
    };
    it('should format JSON output', () => {
        const formatter = new Formatter({ ...config, format: 'json' });
        const output = formatter.format(resultWithViolations);
        const parsed = JSON.parse(output);
        expect(parsed.passed).toBe(false);
        expect(parsed.violationsCount).toBe(2);
        expect(parsed.violations[0].name).toBe('react');
        expect(parsed.violations[0].severity).toBe('major');
        expect(parsed.skipped).toBe(2);
    });
    it('should include suggestions in JSON when showSuggestions is true', () => {
        const formatter = new Formatter({ ...config, format: 'json', showSuggestions: true });
        const output = formatter.format(resultWithViolations);
        const parsed = JSON.parse(output);
        expect(parsed.violations[0].suggestedBump).toBe('^19.0.0');
    });
    it('should not include suggestions in JSON when showSuggestions is false', () => {
        const formatter = new Formatter({ ...config, format: 'json' });
        const output = formatter.format(resultWithViolations);
        const parsed = JSON.parse(output);
        expect(parsed.violations[0].suggestedBump).toBeUndefined();
    });
    it('should format text output with violations', () => {
        const formatter = new Formatter({ ...config, format: 'text' });
        const output = formatter.format(resultWithViolations);
        expect(output).toContain('react');
        expect(output).toContain('^18.0.0');
        expect(output).toContain('19.0.0');
        expect(output).toContain('2 violation(s) found');
        expect(output).toContain('[MAJOR]');
    });
    it('should format text output without violations', () => {
        const formatter = new Formatter({ ...config, format: 'text' });
        const output = formatter.format(resultWithoutViolations);
        expect(output).toContain('within threshold limits');
    });
    it('should show skipped count in text output', () => {
        const formatter = new Formatter({ ...config, format: 'text' });
        const output = formatter.format(resultWithViolations);
        expect(output).toContain('Skipped: 2');
    });
    it('should format summary output', () => {
        const formatter = new Formatter({ ...config, format: 'summary' });
        const output = formatter.format(resultWithViolations);
        expect(output).toContain('FAIL');
        expect(output).toContain('2 violation(s)');
    });
    it('should format summary with pass', () => {
        const formatter = new Formatter({ ...config, format: 'summary' });
        const output = formatter.format(resultWithoutViolations);
        expect(output).toContain('PASS');
    });
    it('should group violations by severity in summary', () => {
        const formatter = new Formatter({ ...config, format: 'summary' });
        const output = formatter.format(resultWithViolations);
        expect(output).toContain('1 major');
        expect(output).toContain('1 patch');
    });
    it('should format verbose output', () => {
        const formatter = new Formatter({ ...config, format: 'text', verbose: true });
        const output = formatter.formatVerbose(resultWithViolations);
        expect(output).toContain('Configuration:');
        expect(output).toContain('Registry:');
        expect(output).toContain('Ignore ranges');
        expect(output).toContain('Show suggestions');
    });
    it('should show suggestions in text output when enabled', () => {
        const formatter = new Formatter({ ...config, format: 'text', showSuggestions: true });
        const output = formatter.format(resultWithViolations);
        expect(output).toContain('Suggest: ^19.0.0');
    });
});
//# sourceMappingURL=formatter.test.js.map