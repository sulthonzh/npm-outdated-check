# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-30

### Added
- Added `--suggest` flag to show suggested version bumps
- Added `--fail-on-any` flag for strict CI mode
- Added `--exclude-pattern` option for regex-based package exclusion
- Added better error handling and configuration validation
- Added comprehensive test suite with 20 tests covering all functionality
- Added multiple output formats: text, table, JSON, summary
- Added verbose mode for debugging
- Added ignore ranges functionality for non-semver versions

### Changed
- Enhanced dependency analysis to include peer and optional dependencies
- Improved table formatting with better colors and alignment
- Better registry support with configurable registry URL
- More detailed violation reporting with severity levels

### Fixed
- Fixed package exclusion logic
- Improved CLI argument parsing
- Fixed TypeScript compilation issues
- Added proper exit codes (0=pass, 1=violations, 2=config errors, 3/network errors)

## [1.0.0] - 2026-05-29

### Added
- Initial release of npm-outdated-check
- Basic dependency version threshold checking
- CLI with colored output
- Support for major/minor/patch version limits
- Config file support
- CI-friendly exit codes
- TypeScript implementation with full type definitions

### Features
- Zero-config CI integration
- Semantic version thresholding
- Human-friendly output
- Multiple output formats
- Meaningful exit codes
- Configurable options