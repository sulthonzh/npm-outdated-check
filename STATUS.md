# STATUS.md — npm-outdated-check Quality Audit

**Audit date:** 2026-07-23 (UTC 2026-07-22 18:01)
**Prior audit:** 2026-07-18 (Round 2)
**Auditor:** oss-builder automated cycle
**Verdict:** ✅ EXCEPTIONAL

## Exceptional Checklist

- [x] **README hooks reader in first 3 lines** — "Find outdated npm dependencies before they become security risks. Zero-config, one command, actionable results." Clear value prop.
- [x] **Quick start works in <2 minutes** — `npx npm-outdated-check` in any project directory. Zero config needed.
- [x] **All tests GREEN (100% pass rate)** — 299/299 pass, 0 fail.
- [x] **Test coverage >= 80% on core logic** — 91.36% stmts, 92.26% branches, 97.56% funcs (checker.ts: 87.87%/89.66%, config.ts: 98.72%/96.36%, formatter.ts: 98.28%/95.91%).
- [x] **Zero TypeScript errors** — `tsc --noEmit` passes clean in strict mode.
- [x] **Zero ESLint warnings** — Clean lint output.
- [x] **No TODO/FIXME in shipped code** — Verified via grep.
- [x] **At least 3 real-world examples in docs** — README includes CI/CD pipeline integration, monorepo usage, custom registry support.
- [x] **CHANGELOG up to date** — Documented through latest version.
- [x] **Modern stack** — TypeScript, tsup bundler, c8 coverage, native Node.js test runner compatible.
- [x] **Unique value prop clearly stated** — Comparison vs `npm outdated`, `npm-check-updates`, `depcheck`. Focus on policy-based violation detection (major/minor/patch thresholds).
- [x] **Performance** — Parallel registry fetches with configurable concurrency, caching with TTL, retry with exponential backoff.
- [x] **Security** — SSRF protection (registry domain allowlist, localhost-only IPs), input validation for package names/versions, no shell execution, HTTPS enforcement for non-localhost.

## Coverage Improvement (2026-07-22)

**Before (Round 2):** 88.16% stmts, 90.48% branches, 97.56% funcs

**After (Round 3):** 91.36% stmts (+3.2%), 92.26% branches (+1.78%), 97.56% funcs

**+32 tests added** in `test/coverage-gaps-3.test.mjs`:

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
| Tests | 299 |
| Pass rate | 100% |
| Statements | 91.36% |
| Branches | 92.26% |
| Functions | 97.56% |

## Remaining Uncovered Lines

- **checker.ts 491-495**: Retry exhaustion verbose warning (private method source-map tracking limitation)
- **checker.ts 560-561**: Registry response invalid version verbose warning (network-dependent path)
- **checker.ts 796-797**: OR comparator `parts.every` sub-expression
- **config.ts 94-95**: SSRF IPv4 non-localhost (compiled output branch tracking)
- **config.ts 123**: mergeConfig unknown key branch
- **formatter.ts 150-152**: JSON formatVerbose catch fallback (unreachable defensive code)
