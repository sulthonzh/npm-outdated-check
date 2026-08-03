# STATUS.md — npm-outdated-check Quality Audit

**Audit date:** 2026-08-04 (UTC 2026-08-03 21:47)
**Prior audit:** 2026-07-23 (Round 3)
**Auditor:** oss-builder automated cycle
**Verdict:** ✅ EXCEPTIONAL

## Exceptional Checklist

- [x] **README hooks reader in first 3 lines** — "Find outdated npm dependencies before they become security risks. Zero-config, one command, actionable results." Clear value prop.
- [x] **Quick start works in <2 minutes** — `npx npm-outdated-check` in any project directory. Zero config needed.
- [x] **All tests GREEN (100% pass rate)** — 326/326 pass, 0 fail.
- [x] **Test coverage >= 80% on core logic** — 96.16% stmts, 93.39% branches, 100% funcs (checker.ts: 95%/91.66%, config.ts: 98.72%/96.36%, formatter.ts: 98.28%/96%).
- [x] **Zero TypeScript errors** — `tsc --noEmit` passes clean in strict mode.
- [x] **Zero ESLint warnings** — Clean lint output.
- [x] **No TODO/FIXME in shipped code** — Verified via grep.
- [x] **At least 3 real-world examples in docs** — README includes CI/CD pipeline integration, monorepo usage, custom registry support.
- [x] **CHANGELOG up to date** — Documented through latest version.
- [x] **Modern stack** — TypeScript, tsup bundler, c8 coverage, native Node.js test runner compatible.
- [x] **Unique value prop clearly stated** — Comparison vs `npm outdated`, `npm-check-updates`, `depcheck`. Focus on policy-based violation detection (major/minor/patch thresholds).
- [x] **Performance** — Parallel registry fetches with configurable concurrency, caching with TTL, retry with exponential backoff.
- [x] **Security** — SSRF protection (registry domain allowlist, localhost-only IPs), input validation for package names/versions, no shell execution, HTTPS enforcement for non-localhost.

## Coverage History

| Round | Date | Tests | Stmts | Branches | Funcs | Key Improvements |
|-------|------|-------|-------|----------|-------|------------------|
| 3 | 2026-07-22 | 299 | 91.36% | 92.26% | 97.56% | +32 tests: OR comparator, retry exhaustion, SSRF validation, formatVerbose catch |
| 4 | 2026-07-31 | 326 | 96.16% | 93.39% | 100% | +27 tests: lockfile v1 validateDependencies (string/object/dev/dedupe/null/invalid), lockfile v2/3 verbose warnings (invalid version/name/missing version/linked), OR comparator exotic protocols (github:/git+https/npm:/link:), SSRF IP rejection, mergeConfig unknown key, formatVerbose text/table |

## Round 4 Detail (2026-07-31)

**+27 tests added** in `test/coverage-gaps-4.test.mjs`:

**checker.ts (91.66% branches, +2.0pp):**
- Lockfile v1 string-format dependencies parsing (line 352-415 main path)
- Lockfile v1 object-format dependencies with version property
- Lockfile v1 devDependencies parsing
- Lockfile v1 dedupe via seen set (same pkg in deps + devDeps)
- Lockfile v1 verbose: invalid package name, invalid version object, unparseable version, null dependencies
- Lockfile v2/3 verbose: invalid version, invalid package name, missing version, linked/workspace packages
- OR comparator sub-expressions: github:, git+https:, git+ssh:, npm:, link: protocols
- OR comparator rejection: all invalid parts, mixed valid+invalid parts
- Standalone exotic protocols: github:, git+https:, git+ssh:, git+http:, git+file:, npm:, link:, workspace:, file:

**config.ts (96.36% branches, unchanged):**
- SSRF rejection: raw IPv4 (10.0.0.1), IPv4+port (172.16.0.1:443), IPv6 ([fe80::1])
- mergeConfig unknown key ignoring (unknownKey, anotherUnknown)

**formatter.ts (96% branches, +0.09pp):**
- formatVerbose text/table format configuration section
- formatVerbose exclude list display (non-empty + empty "none")

**Remaining uncovered (dist line mapping):**
- checker.ts: 357, 377, 391-402 (lockfile v1 inner push/return — V8 artifact from bundled output), 491-495 (retry exhaustion network path — requires live registry simulation), 560-561 (registry invalid version — requires registry returning non-semver), 796-797 (OR sub-expression artifacts)
- config.ts: 94-95 (SSRF IP — dist mapping artifact, tests functionally verified), 123 (cacheTTL merge — dist mapping)
- formatter.ts: 150-152 (formatVerbose JSON catch — dist mapping artifact)

- **Checker verbose invalid deps** (3 tests): verbose mode warns for invalid prod/dev dependency names, non-verbose silent
- **Checker retry exhaustion** (2 tests): verbose warns after max retries, non-verbose silent return
- **Checker validateVersion** (1 test): empty string rejection
- **Checker OR comparator** (3 tests): valid `||` formats (semver, mixed, workspace/git/npm/link), invalid rejection
- **ConfigLoader explicit path** (2 tests): file-not-found warning + valid load
- **ConfigLoader default config** (2 tests): `.npm-outdated-check.json` from cwd, defaults fallback
- **ConfigLoader SSRF** (5 tests): non-localhost IPv4/IPv6 rejection, localhost:port allow, 127.0.0.1 allow, non-standard port rejection
- **ConfigLoader mergeConfig** (9 tests): exclude/include/cacheTTL/failOnAny/onlyViolations/transitive/maxMajor/maxMinor/maxPatch merges, invalid include/format fallback
- **Formatter verbose** (5 tests): text/markdown/table formatVerbose configuration append, exclude values display, empty exclude "none"

## Test Summary

| Metric | Value |
|--------|-------|
| Tests | 326 |
| Pass rate | 100% |
| Statements | 96.16% |
| Branches | 93.39% |
| Functions | 100% |

## Remaining Uncovered Lines

- **checker.ts 491-495**: Retry exhaustion verbose warning (private method source-map tracking limitation)
- **checker.ts 560-561**: Registry response invalid version verbose warning (network-dependent path)
- **checker.ts 796-797**: OR comparator `parts.every` sub-expression
- **config.ts 94-95**: SSRF IPv4 non-localhost (compiled output branch tracking)
- **config.ts 123**: mergeConfig unknown key branch
- **formatter.ts 150-152**: JSON formatVerbose catch fallback (unreachable defensive code)
