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
  .version('1.1.0')
  .option('--max-major <n>', 'Maximum major version drift', '0')
  .option('--max-minor <n>', 'Maximum minor version drift', '2')
  .option('--max-patch <n>', 'Maximum patch version drift', '5')
  .option('--dep <types>', 'Include dependencies (prod,dev,peer,optional,both,all)', 'both')
  .option('--exclude <packages>', 'Exclude packages (comma-separated)', '')
  .option('--exclude-pattern <regex>', 'Exclude packages matching regex (can be repeated)', (val: string, prev: string[]) => [...prev, val], [] as string[])
  .option('--ignore-ranges', 'Skip packages with non-semver ranges (*, latest, workspace:*, etc.)', false)
  .option('--registry <url>', 'npm registry URL', 'https://registry.npmjs.org')
  .option('--format <fmt>', 'Output format (text,json,table,summary)', 'text')
  .option('--config <path>', 'Path to config file')
  .option('--verbose', 'Verbose output')
  .option('--fail-on-any', 'Fail if any violations found', false)
  .option('--suggest', 'Show suggested version bumps', false)
  .option('--path <dir>', 'Project directory (default: cwd)')
  .parse();

const options = program.opts();

type DepType = Config['include'][number];

function parseDepOption(dep: string): DepType[] {
  if (dep === 'both') return ['prod', 'dev'];
  if (dep === 'all') return ['prod', 'dev', 'peer', 'optional'];
  if (dep === 'only-prod') return ['prod'];
  if (dep === 'only-dev') return ['dev'];
  return dep.split(',').map((s) => s.trim() as DepType);
}

async function main() {
  try {
    let config = await ConfigLoader.load(options.config);

    const includeTypes = parseDepOption(options.dep);
    const exclude = options.exclude ? options.exclude.split(',').map((s: string) => s.trim()) : [];

    const cliOptions: Partial<Config> = {
      maxMajor: parseInt(options.maxMajor, 10) || 0,
      maxMinor: parseInt(options.maxMinor, 10) || 0,
      maxPatch: parseInt(options.maxPatch, 10) || 0,
      include: includeTypes,
      exclude,
      excludePatterns: options.excludePattern || [],
      ignoreRanges: options.ignoreRanges || false,
      registry: options.registry,
      format: options.format,
      verbose: options.verbose,
      failOnAny: options.failOnAny,
      showSuggestions: options.suggest || false,
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
    const { violations, totalChecked, skipped } = await checker.check();

    const result = {
      violations,
      totalChecked,
      skipped,
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
