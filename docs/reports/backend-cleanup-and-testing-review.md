# Backend Cleanup and Testing Review

## 1. Executive Summary

Reviewed on 10 October 2026 against the source and installed tooling. Removed only the demonstrative REST greeting, GraphQL greeting, and their exclusive tests. Authentication, logging, mail, Prisma, configuration, dependencies and database models remain unchanged. All automated checks passed: 35 unit tests and 30 HTTP/GraphQL integration tests.

The existing organization is suitable for the current application. Its main limitations are mocked database semantics, a required sibling frontend checkout, and failure-sensitive mock cleanup. Broader recommendations below were not implemented.

## 2. Cleanup Performed

Removed:

- `src/app.controller.ts`: `GET /` returning `Hello World!`.
- `src/app.service.ts`: only supplied that constant greeting.
- `src/app.resolver.ts`: `hello: String!` returning `Hello Motory`.
- `src/app.controller.spec.ts`: exclusively asserted the greeting.
- `test/app.e2e-spec.ts`: exclusively requested the greeting, while bootstrapping real providers.

Modified `src/app.module.ts` to remove their imports and registrations; retained all domain modules, Apollo configuration and the global exception filter. Added this report.

Reference searches covered source, tests, scripts, configuration and documentation, excluding generated output/dependencies. Implementation references were confined to the removed files and AppModule. The resolver contributed only `hello`; none of the seven frontend auth operations consumes it. No script/configuration depended on the greetings. Historical analysis still describes them as part of its dated snapshot.

No other helper, fixture or service was confirmed obsolete. Prisma construction tests were retained despite their limited assertions. Vehicle/maintenance models, the manual mail script, development/deployment tooling and path-resolution configuration were preserved: limited usage alone does not establish safe removal. No application debugging artifacts were found; console output in the explicit manual mail script is intentional.

The instructed `docs/conventions.md` does not exist in this backend; the actual `docs/motory-be-conventions.md` was read and followed. Neither it nor AGENTS.md was changed.

## 3. Current Testing Architecture

| Location                            | Actual category            | What it verifies                                                                                                                                                            |
| ----------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/users/users.service.spec.ts`   | Unit                       | Persistence arguments, normalization, forced USER role and mapping a simulated P2002 error; no concurrent database writes.                                                  |
| `src/mail/mail.service.spec.ts`     | Unit                       | Resend constructor/send mocks, provider/network errors, configuration and email rendering.                                                                                  |
| `src/common/graphql-errors.spec.ts` | Unit                       | Public error formatting, masking, safe diagnostic categories and expected-error silence.                                                                                    |
| `src/common/logger-config.spec.ts`  | Unit                       | Environment defaults, severity thresholds and invalid settings.                                                                                                             |
| `src/prisma/prisma.service.spec.ts` | Construction/DI smoke test | Nest can construct the generated client/adapter with a dummy URL; no connection, query or transaction assertion.                                                            |
| `test/auth.e2e-spec.ts`             | HTTP/GraphQL integration   | Supertest through real Nest/Apollo resolvers, DTO validation, services, Passport, JWT and Argon2; Prisma and mail overridden. Includes frontend schema contract validation. |

There are no remaining full backend end-to-end tests or real PostgreSQL integration tests. The removed app test was an HTTP greeting smoke test with real providers, not an authentication E2E workflow.

Vitest 4 uses `vitest.config.ts` for `**/*.spec.ts` and `vitest.config.e2e.ts` for `**/*.e2e-spec.ts`. Both enable globals and the same `vite-tsconfig-paths` plugin. No shared setup file or external fixture directory exists. Unit specs import source; auth tests import `dist/` classes to retain TypeScript decorator metadata. Build excludes specs and `test/`; Nest deletes prior output.

Scripts: `test` runs units; `test:watch`, `test:cov` and `test:debug` use the default unit configuration (debug disables file parallelism). `test:e2e` builds then runs HTTP integration tests. `lint` runs type-aware Oxlint over source/tests; `build` compiles with Nest; `format` and `format:check` cover source/test TypeScript. Formatting the whole repository is unnecessary for a focused task.

Mocks use `vi.fn`, provider overrides and logger/JWT spies. Auth keeps a single application per suite and resets in-memory users, roles, tokens and call history before each test. Its transaction double snapshots state and restores it on failure. Mail units mock the Resend package; auth overrides MailService entirely. Normal remaining tests neither require PostgreSQL nor send real emails. Generated Prisma client files and the sibling frontend operations file remain prerequisites. `mail:test` is a separate real-delivery script and was not executed.

## 4. Test Coverage Assessment

Confirmed coverage includes registration without automatic login; Argon2id and password whitespace; normalized duplicate email; privileged-field rejection; default/fresh role handling; verified login; missing/invalid/expired JWT and malformed identity; protected `me`; deleted users; validation fields and secret-free schema; hashed action tokens, TTLs, expiry/type/replay rejection, cooldown and replacement; neutral recovery; password reset and old-password rejection; verification warnings and provider failure retry; unexpected error masking; safe logging and simulated verification rollback. All seven frontend documents validate against resolver-generated introspection.

Confirmed gaps: no PostgreSQL constraints, locking, isolation, migration compatibility or transaction rollback are exercised. `$queryRaw` always resolves without a lock, and simulated P2002 injection does not test a registration race. No concurrent issuance/consumption test exists. The rollback test proves behavior of the handwritten double, not PostgreSQL atomicity.

Inspection also found no dedicated reset-write/deletion failure rollback scenario, JWT wrong-secret/algorithm scenarios, or startup tests for invalid JWT/URL/TTL configuration. Logging tests assert options and logger calls; they do not capture actual production JSON output, bootstrap fatal handling or the filter's non-GraphQL delegation. These are observed test gaps, not demonstrated application defects. Coverage percentages were not measured or used as a target.

## 5. Test Reliability and Maintainability

- Auth state is reset and tests run sequentially within the file. Making these cases concurrent would race on shared `stored`, `tokens` and mocks. No current order-dependent failure was observed.
- `vi.clearAllMocks()` clears call history, but preserves implementations and pending one-shot responses. Logger/JWT spies are restored at the end of individual test bodies; an early failed assertion can leave a spy installed and contaminate later cases. Mail configuration spies also lack uniform teardown.
- Transaction token snapshots are shallow (`[...tokens]`), while the user snapshot is copied. They cannot faithfully model all object mutation rollbacks, isolation or concurrent transactions.
- Auth uses wall-clock timestamps and manually ages records by 60/61 seconds. Current expiry assertions have generous margins and passed; exact boundary behavior is not controlled by a test clock. No sleep-based asynchronous assertions were found.
- `ConfigModule` ignores `.env` in auth tests but still permits process-environment values to take precedence over loaded defaults. Exported JWT/URL/TTL settings can therefore influence the suite. This is a configuration isolation weakness, not a reproduced failure.
- The frontend contract test requires `../../motory-fe/src/features/auth/api/operations.ts`. This is convenient and valuable in the documented repository pair, but backend-only clones fail that test. Its regex assumes inline `gql` templates and exactly seven operations; extraction changes/new operations require coordination. It checks document validity, not frontend TypeScript payload types or browser behavior.
- No large mock duplication currently justifies a generic factory. The auth file's in-memory database is substantial but local; splitting it could improve readability later without creating an abstraction layer.
- Tests importing `dist/` can run stale code if invoked directly without rebuilding. The existing `test:e2e` script avoids this.

## 6. Codex Workflow Assessment

Focused units work with `npm test -- src/mail/mail.service.spec.ts` (or another file). Focused auth checks work with `npm run test:e2e -- test/auth.e2e-spec.ts -t 'verifies once'`; this still builds first. Unit tests need no full application bootstrap; auth boots once and exercises transport without external services.

A practical sequence is: Prettier on changed files; focused tests; `npm run lint`; `npm test`; `npm run test:e2e` when auth/contracts/composition change; `npm run build` when not already covered by the integration script. Fresh checkouts need installed dependencies and a generated Prisma client first. Preserve the sibling checkout for contract tests. Existing commands suffice; no new scripts/tools were added.

Vitest reports file/case names clearly, although the large auth file and cascading spy failures can obscure the first cause. Unit coverage commands omit HTTP integration coverage. Naming `test:e2e` as integration in developer guidance would prevent overstating validation.

Measured after cleanup: units took 338 ms total (85 ms test execution); HTTP integration took 1.53 s total (1.12 s test execution), excluding its preceding build. These are single local observations, not benchmarks. One shared bootstrap already limits overhead; actual hashing is useful security coverage. There is no measured need to optimize bootstrapping or substitute hashes. A validation run need not repeat the build immediately after `test:e2e`.

## 7. Recommended Improvements

All are future work, not changes in this task.

| Priority | Recommendation / problem addressed                                                                                                                                                                                                                    | Expected benefit                                                                                                                           | Complexity | New dependencies                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| High     | Add isolated PostgreSQL tests for token issuance/consumption races, uniqueness and verification/reset rollback. Mock locks and transactions cannot establish database guarantees.                                                                     | Protect security-sensitive atomicity and concurrent single-use behavior.                                                                   | Medium     | Not necessarily; existing Prisma/pg tooling can suffice, but database infrastructure requires a separate task. |
| High     | Add teardown-based spy restoration and explicit handling of one-shot mock state while preserving baseline mock implementations.                                                                                                                       | Prevent a failed assertion from contaminating later tests; clearer root failures.                                                          | Low        | No                                                                                                             |
| Medium   | Make auth test configuration independent of exported environment settings.                                                                                                                                                                            | Reproducible local and isolated runs without real configuration.                                                                           | Low        | No                                                                                                             |
| Medium   | Decide and document the frontend contract dependency: keep required paired checkouts, or separate an explicitly invoked paired contract check from backend-only checks. A versioned operation artifact is another option with a synchronization cost. | Preserve contract protection while making backend-only execution predictable. Requires explicit approval before changing this integration. | Medium     | No                                                                                                             |
| Medium   | Add a few focused missing security/error tests: reset rollback, JWT wrong signature/algorithm, invalid auth startup settings and actual JSON/fatal logging.                                                                                           | Protect concrete failure paths currently absent from coverage.                                                                             | Medium     | No                                                                                                             |
| Low      | Control time for cooldown/expiry boundaries and extract only the local auth fixture if file growth warrants it.                                                                                                                                       | Easier boundary assertions and maintenance without complex factories.                                                                      | Low        | No                                                                                                             |
| Low      | Clarify unit versus HTTP integration commands, generated-client prerequisites, and fresh-build requirements in future setup documentation; optionally assess duplicated path plugin configuration.                                                    | Faster reliable task validation and less setup confusion.                                                                                  | Low        | No                                                                                                             |

## 8. Validation Results

- Prettier: `npx --no-install prettier --write src/app.module.ts` passed; only modified code formatted.
- Oxlint: `npm run lint` passed.
- Units: `npm test` passed, 5 files / 35 tests.
- HTTP/GraphQL integration: `npm run test:e2e` passed, 1 file / 30 tests, including all seven frontend operation contracts. Its preceding `npm run build` passed.
- Separate compiled AppModule bootstrap with explicit test ConfigService and overridden Prisma/Mail: generated query fields exactly `me`; mutation fields exactly `forgotPassword`, `login`, `register`, `resendVerificationEmail`, `resetPassword`, `verifyEmail`. Asserted no root greeting route registered. Schema generation remains in memory (`autoSchemaFile: true`).
- Final reference search found no remaining scaffold references in source/tests/scripts/configuration. Final Git diff and whitespace check reviewed; only the listed cleanup files and report changed. Frontend unchanged.

No dependencies installed, real email sent, database started/queried, migrations run, schema changed or commits created. Vitest emitted an advisory about native Vite path resolution replacing the plugin; it did not fail either suite.

## 9. Remaining Issues

Real PostgreSQL behavior and external email delivery remain unverified by design. Future database testing needs an isolated environment decision. The sibling contract dependency was retained without modification. The conventions filename mismatch, dated scaffold references in the historical analysis, README historical contract examples/broken phase-document link, unpinned runtime and unverified production launch command remain documentation/operational findings outside this cleanup. No failing checks or cleanup regressions remain.
