## v1.1.1 (Unreleased)

### Fixed
- Fixed ESLint config: added `root: true` to prevent parent config conflicts.
- Fixed `validateVersion` regex: `git+https:` and `git+ssh:` protocols now correctly validated.
- Disabled `no-console` ESLint rule for CLI tool (intentional console usage).

### Added
- CONTRIBUTING.md with development workflow and guidelines.
- Comprehensive test suite: 71 tests (up from 34) with 84% line coverage.
- Tests for input validation (package names, version specifiers, protocol versions).
- Tests for all formatter output modes (JSON, text, table, markdown, verbose).
- Mocked network tests for check(), retry logic, 404 handling, exclude patterns.
- Tests for SSRF protection and registry validation edge cases.

# Changelog

## v1.1.0 (2026-06-19)

### Fixed
- Removed `vitest` devDependency and `@vitest/coverage-v8` — project uses `node:test`, vitest was dead weight.
- Fixed `test:watch` script: was `vitest`, now `node --test --watch test/test.mjs`.

### Added
- `CHANGELOG.md` with full version history.
- README comparison table vs `npm outdated`, `npm-check-updates`, `depcheck`, `renovate`.
- `exports` field in package.json for clean ESM/CJS dual consumption.
- `prepublishOnly` script to prevent publishing broken builds.
- CHANGELOG.md added to npm `files` field.

### Changed
- Version bumped to 1.1.0.
- CLI `--version` flag now reports 1.1.0.

## v1.0.0 (2026-06-16)

### Initial Release
- CI-friendly dependency version threshold checker.
- Configurable max major/minor/patch drift limits.
- Multiple output formats: text, table, JSON, markdown.
- Config file support (`.npm-outdated-check.json`).
- Meaningful exit codes for CI pipelines (0=pass, 1=violations, 2=config error, 3=network error).
- Smart exclude patterns with glob support.
- TypeScript implementation with full type definitions.
- GitHub Actions, GitLab CI, and Jenkins integration examples.
- Security: HTTPS registry enforcement, input validation.
- Performance: concurrent registry fetches, response caching.
- Troubleshooting section with common issues and performance tips.
