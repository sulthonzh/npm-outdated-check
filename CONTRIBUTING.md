# Contributing

Thanks for your interest in contributing to npm-outdated-check! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/npm-outdated-check.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Start development: `npm run dev`

## Development Workflow

### Code Style

- Use TypeScript for all code
- Follow ESLint rules (run `npm run lint`)
- Use Prettier for formatting (run `npm run format`)
- Write tests for new features (in `__tests__` directory)

### Testing

- All tests must pass: `npm test`
- Test new functionality with unit tests
- Test CLI with various option combinations
- Test error conditions and edge cases

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass and linting is clean
4. Add tests for new functionality
5. Commit your changes with clear messages
6. Push to your fork
7. Create a pull request with:
   - Clear title
   - Description of changes
   - List of issues fixed (if any)
   - Test results

## Project Structure

```
src/
├── bin/           # CLI entry point
├── lib/           # Core library code
├── types/         # TypeScript type definitions
└── index.ts       # Main library entry point

__tests__/         # Test files
```

## Adding New Features

### New CLI Options

1. Add option to `src/bin/cli.ts`
2. Update help text and description
3. Implement logic in appropriate library file
4. Add tests for the new option
5. Update documentation in README.md

### New Output Formats

1. Add format type to `src/lib/formatter.ts`
2. Implement format method
3. Add CLI option if needed
4. Test with sample data
5. Update README with examples

### New Dependency Types

1. Update `src/types/config.ts` to include new dependency type
2. Modify `src/lib/checker.ts` to handle new type
3. Update CLI options to include new type
4. Add tests for new functionality
5. Update documentation

## Reporting Issues

When reporting bugs, please include:

1. Environment information (Node.js version, OS)
2. Exact command run and output
3. Expected behavior
4. Actual behavior
5. Steps to reproduce

## Questions?

If you have questions about contributing:

- Check existing issues and pull requests
- Open a new issue with your question
- Join discussions in existing issues

## Code of Conduct

This project follows a standard Code of Conduct. Please be respectful and constructive in all interactions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.