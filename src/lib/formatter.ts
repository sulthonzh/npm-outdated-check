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
      default:
        return this.formatText(result);
    }
  }

  private formatJson(result: CheckResult): string {
    return JSON.stringify(
      {
        passed: result.passed,
        totalChecked: result.totalChecked,
        violationsCount: result.violations.length,
        violations: result.violations.map((v) => ({
          name: v.name,
          current: v.current,
          latest: v.latest,
          type: v.type,
          majorDiff: v.majorDiff,
          minorDiff: v.minorDiff,
          patchDiff: v.patchDiff,
        })),
      },
      null,
      2
    );
  }

  private formatTable(result: CheckResult): string {
    if (result.violations.length === 0) {
      return chalk.green('✓ All dependencies within threshold limits');
    }

    const table = new Table({
      head: [
        chalk.bold('Package'),
        chalk.bold('Current'),
        chalk.bold('Latest'),
        chalk.bold('Type'),
        chalk.bold('Major'),
        chalk.bold('Minor'),
        chalk.bold('Patch'),
      ],
      colWidths: [25, 15, 15, 8, 8, 8, 8],
    });

    for (const v of result.violations) {
      const major = v.majorDiff > this.config.maxMajor ? chalk.red(v.majorDiff) : v.majorDiff;
      const minor = v.minorDiff > this.config.maxMinor ? chalk.red(v.minorDiff) : v.minorDiff;
      const patch = v.patchDiff > this.config.maxPatch ? chalk.red(v.patchDiff) : v.patchDiff;

      table.push([v.name, v.current, v.latest, v.type, major, minor, patch]);
    }

    return `\n${table.toString()}\n${chalk.red(`✗ ${result.violations.length} violation(s) found`)}\n`;
  }

  private formatText(result: CheckResult): string {
    if (result.violations.length === 0) {
      return chalk.green(`✓ All dependencies (${result.totalChecked}) within threshold limits`);
    }

    let output = chalk.red(`✗ ${result.violations.length} violation(s) found:\n\n`);

    for (const v of result.violations) {
      output += chalk.red(`  • ${v.name}`) + ` (${v.type})\n`;
      output += `    Current: ${v.current}\n`;
      output += `    Latest:  ${v.latest}\n`;
      output += `    Drift:   M${v.majorDiff} m${v.minorDiff} p${v.patchDiff}\n`;
      output += `    Limit:   M${this.config.maxMajor} m${this.config.maxMinor} p${this.config.maxPatch}\n\n`;
    }

    output += chalk.yellow(`Thresholds: major=${this.config.maxMajor}, minor=${this.config.maxMinor}, patch=${this.config.maxPatch}`);

    return output;
  }

  formatVerbose(result: CheckResult): string {
    let output = this.format(result);
    output += `\n\n${chalk.dim('Configuration:')}`;
    output += `\n  Registry: ${this.config.registry}`;
    output += `\n  Include: ${this.config.include.join(', ')}`;
    output += `\n  Exclude: ${this.config.exclude.join(', ') || 'none'}`;
    output += `\n  Fail on any: ${this.config.failOnAny}`;
    return output;
  }
}