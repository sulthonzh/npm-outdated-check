# Contributing to npm-outdated-check

Thanks for your interest in contributing! 🎉

## Getting Started

```bash
git clone https://github.com/sulthonzh/npm-outdated-check.git
cd npm-outdated-check
npm install
```

## Development Workflow

1. **Fork & branch** — create a feature branch from `main`
2. **Write code** — follow existing patterns, keep TypeScript strict
3. **Write tests** — every new feature needs test coverage
4. **Run checks** — all must pass before PR:

```bash
npm run build      # TypeScript + tsup build
npm test           # 65+ tests via node:test
npm run typecheck  # tsc --noEmit (zero errors)
npx eslint src --ext .ts  # zero warnings
```

5. **Keep coverage ≥ 80%** on core logic (`src/lib/`)
6. **No TODO/FIXME** in shipped code — finish it or open an issue

## Code Style

- **TypeScript strict mode** — no `any` without justification
- **ESM first** — `"type": "module"` in package.json
- **Node.js ≥ 18** — use built-in `fetch`, `node:test`, etc.
- **Minimal dependencies** — prefer stdlib over third-party

## Testing

Tests use Node's built-in test runner (`node:test`):

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

Test file: `test/test.mjs` — tests run against compiled `dist/`, so run `npm run build` first.

## Pull Requests

- **One feature per PR** — easy to review, easy to revert
- **Descriptive title** — `Add registry auth support` not `update`
- **Link issues** — `Closes #123`
- **Update CHANGELOG.md** — add your changes under `## Unreleased`

## Reporting Bugs

Open an [issue](https://github.com/sulthonzh/npm-outdated-check/issues) with:

1. Node.js version
2. `npm-outdated-check` version
3. Minimal reproduction (package.json snippet + command)
4. Expected vs actual output
5. Exit code

## License

By contributing, you agree your contributions are licensed under MIT.
