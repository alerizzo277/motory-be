# Backend Coding Conventions

These conventions apply to the `motory-be` repository. They complement `AGENTS.md` and the current architecture described in `docs/project-analysis.md`. Keep implementations consistent with the existing codebase; do not introduce abstractions solely to satisfy a convention.

## 1. General principles

- Prefer clear, maintainable implementations over clever or overly generic solutions.
- Follow existing patterns in the relevant module before introducing a new one.
- Keep changes focused on the requested task; avoid unrelated refactoring.
- Reuse NestJS, TypeScript, Prisma and existing dependencies before considering additional packages.
- Do not add direct dependencies or change architectural patterns without explicit approval.
- Avoid speculative infrastructure, unnecessary wrappers and premature generalization.

## 2. Project organization and responsibilities

- Organize application code by functional domain using NestJS modules (for example, `auth`, `users` and future vehicle-related features).
- Use resolvers for GraphQL transport concerns: argument binding, validation integration, authentication/authorization boundaries and delegating work.
- Use injectable services for application workflows and business logic.
- Keep Prisma access in the existing service/PrismaService pattern; do not introduce a repository layer by default.
- Place shared helpers in `src/common/` only when they are genuinely shared.
- Keep DTOs, GraphQL models, guards and other feature-specific code close to the feature that owns them.
- Do not create directories, modules or files until they have a concrete purpose.

## 3. Naming and imports

- Use `PascalCase` for classes, interfaces, types and enums; do not prefix interfaces with `I`.
- Use `camelCase` for variables, functions, methods and instance properties.
- Use `UPPER_SNAKE_CASE` for genuine module-level constants and stable code-like values when appropriate.
- Follow established NestJS file suffixes such as `.module.ts`, `.service.ts`, `.resolver.ts`, `.guard.ts` and `.spec.ts`.
- Prefer descriptive names tied to the domain and consistent with neighboring files.
- Use `import type` for imports used only as TypeScript types where appropriate.
- Preserve the project's NodeNext ESM import conventions, including `.js` extensions on local relative TypeScript imports.

## 4. TypeScript

- Respect the existing strict TypeScript configuration.
- Prefer precise types; avoid `any`. Use `unknown` at untrusted boundaries and narrow it before use.
- Model finite states and application contracts with explicit unions, enums or existing domain types.
- Avoid non-null assertions and type casts used only to silence compiler errors.
- Use `interface` for clear object contracts and `type` for unions or compositions when suitable; consistency matters more than a rigid preference.
- Avoid duplicating types that already exist in the relevant GraphQL models, DTOs or Prisma-generated client when reuse is appropriate.

## 5. NestJS and dependency injection

- Use NestJS modules, providers and dependency injection for collaborating services.
- Prefer constructor injection and keep dependencies explicit.
- Follow the existing module/provider structure rather than creating global services unnecessarily.
- Keep resolvers thin, but do not split simple workflows across artificial layers.
- Do not introduce custom decorators, interceptors, pipes or guards unless they solve a concrete repeated concern.

## 6. GraphQL contracts and validation

- Keep the API code-first using NestJS GraphQL decorators and the existing Apollo integration.
- Use named, clearly scoped queries and mutations with explicit input and output types.
- Use DTO validation and transformation mechanisms already present in the project; apply them consistently with existing resolver boundaries.
- Keep public GraphQL payloads free of internal persistence details and secrets.
- Preserve stable application error codes and the centralized GraphQL error formatting contract.
- Do not expose raw database, provider or stack-trace details to clients.
- Treat changes to GraphQL fields, operations, validation errors and warning codes as API contract changes: inspect the frontend consumers and relevant contract tests before changing them.
- Do not add subscriptions or another transport mechanism without a specific requirement.

## 7. Prisma and PostgreSQL

- Use the existing injectable Prisma client and configured PostgreSQL adapter.
- Keep database schema changes in Prisma schema/migrations and use the repository's established Prisma configuration commands.
- Do not edit generated Prisma client files (`src/generated/prisma/`).
- Use transactions when multiple writes must succeed or fail together; preserve existing token atomicity and locking behavior.
- Avoid unnecessary queries and selecting sensitive fields that are not needed.
- Handle relevant uniqueness and persistence errors using the established application error contract.
- Do not modify database schema, migrations or seed data as a side effect of unrelated work.

## 8. Authentication, security and email

- Preserve the existing Argon2id password hashing, JWT guard/strategy and action-token lifecycle unless explicitly asked to change them.
- Never log, expose or commit passwords, password hashes, bearer tokens, verification/reset tokens, API keys or connection strings.
- Keep public user representations separate from internal persistence data.
- Avoid user enumeration in password recovery and preserve the current distinction between registration success and email-delivery warnings.
- Keep email-provider concerns within the existing mail module; use the current Resend integration rather than introducing another delivery dependency.
- Validate and normalize untrusted input according to the established DTO and service behavior; never normalize passwords in a way that changes their contents.

## 9. Errors and logging

- Express expected application failures through the existing exception and GraphQL error-code mechanisms.
- Preserve meaningful distinctions between validation errors, authentication/authorization failures, provider failures and unexpected internal errors.
- Do not swallow errors silently or return successful results after an unexpected failure.
- Prefer the native NestJS `Logger` for diagnostic output; avoid `console.log` and temporary debug statements in application code.
- Log actionable errors and important anomalies rather than every successful operation or request.
- Never include sensitive values or unnecessarily detailed personal data in logs.
- Do not introduce external logging infrastructure without a demonstrated need. Existing logging behavior may be migrated separately; these conventions do not require unrelated refactoring.

## 10. Testing

- Use the existing Vitest and Supertest setup; follow nearby `.spec.ts` and integration-test patterns.
- Add or update focused tests when behavior, contracts or edge cases change.
- Test public behavior and significant error cases rather than private implementation details.
- Mock external integrations in unit/integration tests where appropriate; do not imply that mocked tests verify real PostgreSQL concurrency or real email delivery.
- Preserve backend/frontend authentication contract checks when modifying operations consumed by the frontend.
- Avoid tests that send real email or mutate an uncontrolled database unless the task explicitly requires them and the environment is safely configured.

## 11. Comments and documentation

- Write comments, identifiers and development documentation in English.
- Prefer self-explanatory code; comment non-obvious decisions, invariants and security-sensitive behavior rather than restating operations.
- Do not add boilerplate JSDoc to every function or class.
- Treat `docs/project-analysis.md` as a dated snapshot; use the current implementation as the source of truth.
- Do not create or update documentation or historical reports unless explicitly requested.

## 12. Formatting and quality checks

- Use the repository's Prettier configuration (`.prettierrc`) for formatting and Oxlint for linting.
- Format only files changed by the task; avoid repository-wide formatting noise.
- Do not modify formatter or lint configuration unless explicitly requested.
- Run relevant checks before completion when feasible: `npm run lint`, `npm test` and `npm run build`, choosing additional tests based on the affected behavior.
- Avoid suppressing TypeScript or lint errors without an explicit, justified reason.
- Do not rely on editor format-on-save; run the formatter explicitly on affected files.

## 13. Scope and evolution

- These conventions describe how to implement **new or modified code**. They do not authorize broad rewrites of legacy code solely to achieve uniformity.
- When an existing convention conflicts with a requested change, identify the conflict and keep the solution proportional.
- Update this document only when the team explicitly decides to change or extend a convention.
