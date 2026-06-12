# npm-outdated-check

![CI](https://github.com/sulthonzh/npm-outdated-check/workflows/CI/badge.svg)
![npm](https://img.shields.io/npm/v/npm-outdated-check)
![License](https://img.shields.io/npm/l/npm-outdated-check)

CI-friendly dependency version threshold checker with configurable version drift limits and meaningful exit codes.

## Why?

`npm outdated` has no exit codes or version threshold configuration. You can't automatically fail CI builds when dependencies drift too far from their intended versions.

**Example scenario:** Your team wants to ensure no production dependency is more than 2 minor versions behind the latest, to avoid unexpected breaking changes while staying current with security patches.

## Features

- ✅ Zero-config CI integration — just works in GitHub Actions, GitLab CI, Jenkins
- ✅ Semantic version thresholding — configure max allowed major/minor/patch drift
- ✅ Smart default policies — sensible defaults for different project types
- ✅ Human-friendly output — clear warnings about policy violations
- ✅ Multiple output formats — text, table, JSON
- ✅ Meaningful exit codes — CI can gate builds based on results
- ✅ Configurable — CLI options + config file support
- ✅ TypeScript implementation

## Installation

```bash
npm install -g npm-outdated-check
```

Or as a dev dependency:

```bash
npm install -D npm-outdated-check
```

## Usage

### Basic

Check all dependencies with default thresholds (major=0, minor=2, patch=5):

```bash
npm-outdated-check
```

### Custom thresholds

Fail if any dependency is more than 1 major version behind:

```bash
npm-outdated-check --max-major 1 --max-minor 5
```

### Production only

Check only production dependencies:

```bash
npm-outdated-check --dep prod
```

### JSON output

```bash
npm-outdated-check --format json
```

### Markdown output (great for PR comments)

```bash
npm-outdated-check --format markdown
```

Output looks like:

```markdown
## Dependency Check

❌ **2 violation(s)** found out of 15 dependencies.

| Package | Current | Latest | Type | Major | Minor | Patch |
|---------|---------|--------|------|-------|-------|-------|
| react | `^18.0.0` | `19.0.0` | prod | **1** ⚠️ | 0 | 0 |
| lodash | `^4.17.0` | `4.17.21` | prod | 0 | 0 | **21** ⚠️ |

_Thresholds: major=0, minor=2, patch=5_
```

### Config file

Create `.npm-outdated-check.json` in your project root:

```json
{
  "maxMajor": 0,
  "maxMinor": 2,
  "maxPatch": 5,
  "include": ["prod", "dev"],
  "exclude": ["typescript"],
  "registry": "https://registry.npmjs.org",
  "format": "text"
}
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-major <n>` | 0 | Maximum major version drift |
| `--max-minor <n>` | 2 | Maximum minor version drift |
| `--max-patch <n>` | 5 | Maximum patch version drift |
| `--dep <types>` | both | Include dependencies (prod, dev, both) |
| `--exclude <pkgs>` | - | Exclude packages (comma-separated) |
| `--registry <url>` | https://registry.npmjs.org | npm registry URL |
| `--format <fmt>` | text | Output format (text, table, json, markdown) |
| `--config <path>` | - | Path to config file |
| `--path <dir>` | cwd | Project directory |
| `--verbose` | false | Verbose output |
| `--fail-on-any` | true | Exit with code 1 if any violations found (set to false for report-only mode) |

## Exit Codes

- `0`: No violations found — build passes
- `1`: Violations found — dependencies exceed thresholds
- `2`: Configuration errors
- `3`: Network/registry errors

## Troubleshooting

### Common Issues

**"Error: Registry hostname not allowed for security"**
- This is a security feature that restricts registry URLs to known safe domains
- Use official npm registry: `https://registry.npmjs.org`
- For private registries, make sure they're on a trusted domain

**"Configuration errors" exit code 2**
- Check your `.npm-outdated-check.json` for invalid JSON format
- Verify registry URLs are properly formatted
- Ensure exclude patterns are valid npm package names

**"Network/registry errors" exit code 3**
- Check your internet connection
- Verify the registry URL is accessible
- Use `--verbose` flag for more detailed error information
- Private registries may require authentication (not currently supported)

### Performance Tips

- Enable caching by default (1-hour TTL) for faster repeated checks
- Use `--exclude` patterns to skip known stable packages
- For large projects, the `--transitive` flag may increase check time
- Use `--disable-cache` only when you need absolute latest version data

## CI Examples

### GitHub Actions

```yaml
name: Dependency Check

on: [push, pull_request]

jobs:
  outdated-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - run: npx npm-outdated-check --max-minor 3
```

### GitLab CI

```yaml
dependency-check:
  stage: test
  script:
    - npm install
    - npx npm-outdated-check --max-major 0 --max-minor 2
```

### Jenkins

```groovy
stage('Dependency Check') {
  steps {
    sh 'npm install'
    sh 'npx npm-outdated-check --dep prod --max-minor 2 || exit 1'
  }
}
```

## Library Usage

```typescript
import { OutdatedChecker, Formatter, ConfigLoader } from 'npm-outdated-check';

const config = await ConfigLoader.load();
const checker = new OutdatedChecker(config);
const { violations } = await checker.check();

const formatter = new Formatter(config);
console.log(formatter.format({ violations, totalChecked: 10, passed: true, config }));

const exitCode = checker.getExitCode(violations);
process.exit(exitCode);
```

## Configuration File

Place `.npm-outdated-check.json` in your project root:

```json
{
  "maxMajor": 0,
  "maxMinor": 2,
  "maxPatch": 5,
  "include": ["prod", "dev"],
  "exclude": ["@types/*"],
  "registry": "https://registry.npmjs.org",
  "format": "table"
}
```

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT © [Sulthon](https://github.com/sulthonzh)

## Related

- [npm-check-updates](https://github.com/raineorshine/npm-check-updates) — updates package.json dependencies
- [npm outdated](https://docs.npmjs.com/cli/v10/commands/npm-outdated) — built-in outdated check
- [depcheck](https://github.com/depcheck/depcheck) — checks for unused dependencies