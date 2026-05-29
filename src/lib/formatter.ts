import chalk from 'chalk';
import Table from 'cli-table3';
import type { Config, CheckResult } from '../types/config.js';

export class Formatter {
  constructor(private config: Config) {}

  format(result: CheckResult): string {
    switch (this.config.format) {
      case 'json':
        return this.formatJson(result);
      case 'table':
        return this.formatTable(result);
      case 'summary':
        return this.formatSummary(result);
      default:
        return this.formatText(result);
    }
  }

  private formatJson(result: CheckResult): string {
    return JSON.stringify(
      {
        passed: result.passed,
        totalChecked: result.totalChecked,
        skipped: result.skipped,
        violationsCount: result.violations.length,
        violations: result.violations.map((v) => ({
          name: v.name,
          current: v.current,
          latest: v.latest,
          type: v.type,
          severity: v.severity,
          majorDiff: v.majorDiff,
          minorDiff: v.minorDiff,
          patchDiff: v.patchDiff,
          ...(this.config.showSuggestions && v.suggestedBump ? { suggestedBump: v.suggestedBump } : {}),
        })),
        thresholds: {
          maxMajor: this.config.maxMajor,
          maxMinor: this.config.maxMinor,
          maxPatch: this.config.maxPatch,
        },
      },
      null,
      2
    );
  }

  private formatSummary(result: CheckResult): string {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? chalk.green : chalk.red;

    let output = color(`${icon} ${result.passed ? 'PASS' : 'FAIL'}`);
    output += ` — ${result.violations.length} violation(s), ${result.totalChecked} checked`;

    if (result.skipped > 0) {
      output += chalk.dim(` (${result.skipped} skipped)`);
    }

    if (!result.passed) {
      // Group by severity
      const major = result.violations.filter((v) => v.severity === 'major');
      const minor = result.violations.filter((v) => v.severity === 'minor');
      const patch = result.violations.filter((v) => v.severity === 'patch');

      if (major.length > 0) output += chalk.red(`\n  🔴 ${major.length} major: ${major.map((v) => v.name).join(', ')}`);
      if (minor.length > 0) output += chalk.yellow(`\n  🟡 ${minor.length} minor: ${minor.map((v) => v.name).join(', ')}`);
      if (patch.length > 0) output += chalk.blue(`\n  🔵 ${patch.length} patch: ${patch.map((v) => v.name).join(', ')}`);
    }

    return output;
  }

  private formatTable(result: CheckResult): string {
    if (result.violations.length === 0) {
      return chalk.green('✓ All dependencies within threshold limits');
    }

    const heads = [
      chalk.bold('Package'),
      chalk.bold('Current'),
      chalk.bold('Latest'),
      chalk.bold('Type'),
      chalk.bold('Severity'),
      chalk.bold('Major'),
      chalk.bold('Minor'),
      chalk.bold('Patch'),
    ];

    if (this.config.showSuggestions) {
      heads.push(chalk.bold('Suggested'));
    }

    const table = new Table({
      head: heads,
      colWidths: this.config.showSuggestions
        ? [25, 15, 15, 8, 10, 8, 8, 8, 18]
        : [25, 15, 15, 8, 10, 8, 8, 8],
    });

    for (const v of result.violations) {
      const severityIcon = v.severity === 'major' ? chalk.red('major') : v.severity === 'minor' ? chalk.yellow('minor') : chalk.blue('patch');
      const major = v.majorDiff > this.config.maxMajor ? chalk.red(v.majorDiff) : v.majorDiff;
      const minor = v.minorDiff > this.config.maxMinor ? chalk.red(v.minorDiff) : v.minorDiff;
      const patch = v.patchDiff > this.config.maxPatch ? chalk.red(v.patchDiff) : v.patchDiff;

      const row = [v.name, v.current, v.latest, v.type, severityIcon, major, minor, patch];
      if (this.config.showSuggestions && v.suggestedBump) {
        row.push(chalk.green(v.suggestedBump));
      }
      table.push(row);
    }

    let output = `\n${table.toString()}\n${chalk.red(`✗ ${result.violations.length} violation(s) found`)}`;
    if (result.skipped > 0) {
      output += chalk.dim(` (${result.skipped} skipped)`);
    }

    return output;
  }

  private formatText(result: CheckResult): string {
    if (result.violations.length === 0) {
      let msg = chalk.green(`✓ All dependencies (${result.totalChecked}) within threshold limits`);
      if (result.skipped > 0) {
        msg += chalk.dim(` (${result.skipped} skipped)`);
      }
      return msg;
    }

    let output = chalk.red(`✗ ${result.violations.length} violation(s) found:\n\n`);

    for (const v of result.violations) {
      const severityTag = v.severity === 'major' ? chalk.red('[MAJOR]') : v.severity === 'minor' ? chalk.yellow('[MINOR]') : chalk.blue('[PATCH]');
      output += chalk.red(`  • ${v.name}`) + ` ${severityTag} (${v.type})\n`;
      output += `    Current: ${v.current}\n`;
      output += `    Latest:  ${v.latest}\n`;
      output += `    Drift:   M${v.majorDiff} m${v.minorDiff} p${v.patchDiff}\n`;
      output += `    Limit:   M${this.config.maxMajor} m${this.config.maxMinor} p${this.config.maxPatch}\n`;

      if (this.config.showSuggestions && v.suggestedBump) {
        output += chalk.green(`    Suggest: ${v.suggestedBump}\n`);
      }
      output += '\n';
    }

    output += chalk.yellow(`Thresholds: major=${this.config.maxMajor}, minor=${this.config.maxMinor}, patch=${this.config.maxPatch}`);
    if (result.skipped > 0) {
      output += chalk.dim(`\nSkipped: ${result.skipped} packages`);
    }

    return output;
  }

  formatVerbose(result: CheckResult): string {
    let output = this.format(result);
    output += `\n\n${chalk.dim('Configuration:')}`;
    output += `\n  Registry: ${this.config.registry}`;
    output += `\n  Include: ${this.config.include.join(', ')}`;
    output += `\n  Exclude: ${this.config.exclude.join(', ') || 'none'}`;
    output += `\n  Exclude patterns: ${this.config.excludePatterns.join(', ') || 'none'}`;
    output += `\n  Ignore ranges: ${this.config.ignoreRanges}`;
    output += `\n  Show suggestions: ${this.config.showSuggestions}`;
    output += `\n  Fail on any: ${this.config.failOnAny}`;
    return output;
  }
}
