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
  .option('--max-major <n>', 'Maximum major version drift')
  .option('--max-minor <n>', 'Maximum minor version drift')
  .option('--max-patch <n>', 'Maximum patch version drift')
  .option('--dep <types>', 'Include dependencies (prod,dev,both)', 'both')
  .option('--exclude <packages>', 'Exclude packages (comma-separated)', '')
  .option('--registry <url>', 'npm registry URL')
  .option('--format <fmt>', 'Output format (text,json,table,markdown)')
  .option('--config <path>', 'Path to config file')
  .option('--verbose', 'Verbose output')
  .option('--fail-on-any', 'Fail if any violations found')
  .option('--no-fail-on-any', 'Do not fail if any violations found (report-only mode)')
  .option('--transitive', 'Include transitive dependencies')
  .option('--no-transitive', 'Exclude transitive dependencies')
  .option('--path <dir>', 'Project directory (default: cwd)')
  .option('--cache-ttl <ms>', 'Cache time-to-live in milliseconds (default: 3600000)')
  .option('--disable-cache', 'Disable caching completely')
  .option('--only-violations', 'Show only violations (skip passing dependencies)')
  .parse();

const options = program.opts();

async function main() {
  try {
    let config = await ConfigLoader.load(options.config);

    const includeTypes: ('prod' | 'dev')[] = options.dep === 'both' ? ['prod', 'dev'] : options.dep === 'prod' ? ['prod'] : ['dev'];
    const exclude = options.exclude ? options.exclude.split(',').map((s: string) => s.trim()) : [];

    // Only pass CLI options that were explicitly provided by the user.
    // Commander sets defaults for options with default values, so we can't distinguish
    // "user passed --max-minor 2" from "user didn't pass --max-minor". By removing
    // commander defaults, undefined means "not provided" and mergeWithCli skips it.
    const cliOptions: Partial<Config> = {};

    if (options.maxMajor !== undefined) {
      cliOptions.maxMajor = parseInt(options.maxMajor, 10);
    }
    if (options.maxMinor !== undefined) {
      cliOptions.maxMinor = parseInt(options.maxMinor, 10);
    }
    if (options.maxPatch !== undefined) {
      cliOptions.maxPatch = parseInt(options.maxPatch, 10);
    }
    // --dep defaults to 'both' — only override if user explicitly passed it
    // Commander doesn't distinguish, so we check against the default
    if (options.dep !== 'both') {
      cliOptions.include = includeTypes;
    }
    if (options.exclude) {
      cliOptions.exclude = exclude;
    }
    if (options.registry !== undefined) {
      cliOptions.registry = options.registry;
    }
    if (options.format !== undefined) {
      cliOptions.format = options.format as Config['format'];
    }
    if (options.verbose !== undefined) {
      cliOptions.verbose = options.verbose;
    }
    if (options.failOnAny !== undefined) {
      cliOptions.failOnAny = options.failOnAny;
    }
    if (options.transitive !== undefined) {
      cliOptions.transitive = options.transitive;
    }
    if (options.onlyViolations !== undefined) {
      cliOptions.onlyViolations = options.onlyViolations;
    }
    if (options.disableCache) {
      cliOptions.cacheTTL = 0;
    } else if (options.cacheTtl !== undefined) {
      cliOptions.cacheTTL = parseInt(options.cacheTtl, 10);
    }

    config = ConfigLoader.mergeWithCli(config, cliOptions);

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