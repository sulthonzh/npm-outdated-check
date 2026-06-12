#!/usr/bin/env node
import { Command } from 'commander';
import { OutdatedChecker } from '../lib/checker.js';
import { Formatter } from '../lib/formatter.js';
import { ConfigLoader } from '../lib/config.js';
import type { Config } from '../types/config.js';

const program = new Command();

program
  .name('npm-outdated-check')
  .description('CI-friendly dependency version threshold checker')
  .version('1.0.0')
  .option('--max-major <n>', 'Maximum major version drift', '0')
  .option('--max-minor <n>', 'Maximum minor version drift', '2')
  .option('--max-patch <n>', 'Maximum patch version drift', '5')
  .option('--dep <types>', 'Include dependencies (prod,dev,both)', 'both')
  .option('--exclude <packages>', 'Exclude packages (comma-separated)', '')
  .option('--registry <url>', 'npm registry URL', 'https://registry.npmjs.org')
  .option('--format <fmt>', 'Output format (text,json,table,markdown)', 'text')
  .option('--config <path>', 'Path to config file')
  .option('--verbose', 'Verbose output')
  .option('--fail-on-any', 'Fail if any violations found', false)
  .option('--transitive', 'Include transitive dependencies', false)
  .option('--path <dir>', 'Project directory (default: cwd)')
  .parse();

const options = program.opts();

async function main() {
  try {
    let config = await ConfigLoader.load(options.config);

    const depMap: Record<string, ('prod' | 'dev')[]> = {
      both: ['prod', 'dev'],
      prod: ['prod'],
      dev: ['dev'],
    };
    const includeTypes = depMap[options.dep];
    if (!includeTypes) {
      console.error(`Error: --dep must be one of: both, prod, dev (got "${options.dep}")`);
      process.exit(2);
    }
    const exclude = options.exclude ? options.exclude.split(',').map((s: string) => s.trim()) : [];

    const parsedMajor = parseInt(options.maxMajor, 10);
    const parsedMinor = parseInt(options.maxMinor, 10);
    const parsedPatch = parseInt(options.maxPatch, 10);

    if (!Number.isFinite(parsedMajor) || !Number.isFinite(parsedMinor) || !Number.isFinite(parsedPatch)) {
      console.error('Error: --max-major, --max-minor, --max-patch must be valid numbers');
      process.exit(2);
    }

    const cliOptions: Partial<Config> = {
      maxMajor: parsedMajor,
      maxMinor: parsedMinor,
      maxPatch: parsedPatch,
      include: includeTypes,
      exclude,
      registry: options.registry,
      format: options.format,
      verbose: options.verbose,
      failOnAny: options.failOnAny,
      transitive: options.transitive,
    };

    config = ConfigLoader.mergeWithCli(config, cliOptions);

    const validation = ConfigLoader.validate(config);
    if (!validation.valid) {
      console.error('Configuration errors:');
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(2);
    }

    const basePath = options.path || process.cwd();
    const checker = new OutdatedChecker(config, basePath);
    const { violations, totalChecked } = options.transitive 
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

    const exitCode = checker.getExitCode(violations);
    process.exit(exitCode);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(3);
  }
}

main();