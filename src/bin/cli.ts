#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OutdatedChecker } from '../lib/checker.js';
import { Formatter } from '../lib/formatter.js';
import { ConfigLoader } from '../lib/config.js';
import type { Config } from '../types/config.js';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
const VERSION = packageJson.version || '1.0.0';

const program = new Command();

program
  .name('npm-outdated-check')
  .description('CI-friendly dependency version threshold checker')
  .version(VERSION)
  .option('--max-major <n>', 'Maximum major version drift', '0')
  .option('--max-minor <n>', 'Maximum minor version drift', '2')
  .option('--max-patch <n>', 'Maximum patch version drift', '5')
  .option('--dep <types>', 'Include dependencies (prod,dev,both)', 'both')
  .option('--exclude <packages>', 'Exclude packages (comma-separated)', '')
  .option('--registry <url>', 'npm registry URL', 'https://registry.npmjs.org')
  .option('--format <fmt>', 'Output format (text,json,table,markdown)', 'text')
  .option('--config <path>', 'Path to config file')
  .option('--verbose', 'Verbose output')
  .option('--fail-on-any', 'Fail if any violations found')
  .option('--no-fail-on-any', 'Do not fail if any violations found (report-only mode)')
  .option('--transitive', 'Include transitive dependencies')
  .option('--no-transitive', 'Exclude transitive dependencies')
  .option('--path <dir>', 'Project directory (default: cwd)')
  .option('--cache-ttl <ms>', 'Cache time-to-live in milliseconds (default: 3600000)', '3600000')
  .option('--disable-cache', 'Disable caching completely')
  .option('--only-violations', 'Show only violations (skip passing dependencies)')
  .parse();

const options = program.opts();

async function main() {
  try {
    let config = await ConfigLoader.load(options.config);

    const includeTypes: ('prod' | 'dev')[] = options.dep === 'both' ? ['prod', 'dev'] : options.dep === 'prod' ? ['prod'] : ['dev'];
    const exclude = options.exclude ? options.exclude.split(',').map((s: string) => s.trim()) : [];

    const cliOptions: Partial<Config> = {
      maxMajor: parseInt(options.maxMajor, 10),
      maxMinor: parseInt(options.maxMinor, 10),
      maxPatch: parseInt(options.maxPatch, 10),
      include: includeTypes,
      exclude,
      registry: options.registry,
      format: options.format,
      verbose: options.verbose,
      failOnAny: options.failOnAny,
      transitive: options.transitive,
      cacheTTL: options.disableCache ? 0 : parseInt(options.cacheTtl, 10),
      onlyViolations: options.onlyViolations,
    };

    config = ConfigLoader.mergeWithCli(config, {
      ...cliOptions,
      // Only override config with CLI options if they were explicitly provided
      // (not undefined). This allows config file defaults to work properly.
      verbose: cliOptions.verbose !== undefined ? cliOptions.verbose : config.verbose,
      failOnAny: cliOptions.failOnAny !== undefined ? cliOptions.failOnAny : config.failOnAny,
      transitive: cliOptions.transitive !== undefined ? cliOptions.transitive : config.transitive,
      onlyViolations: cliOptions.onlyViolations !== undefined ? cliOptions.onlyViolations : config.onlyViolations,
    });

    const validation = ConfigLoader.validate(config);
    if (!validation.valid) {
      console.error('Configuration errors:');
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(2);
    }

    const basePath = options.path || process.cwd();
    const checker = new OutdatedChecker(config, basePath);
    const { violations, totalChecked } = config.transitive
      ? await checker.checkWithTransitive()
      : await checker.check();

    const result = {
      violations,
      totalChecked,
      passed: violations.length === 0,
      config,
    };

    const formatter = new Formatter(config);
    const output = config.verbose ? formatter.formatVerbose(result) : formatter.format(result);

    console.log(output);

    await checker.flushCache();
    const exitCode = checker.getExitCode(violations);
    process.exit(exitCode);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(3);
  }
}

main();