# Backend Project Analysis

## 1. Project Overview

Motory manages vehicle history and maintenance. This repository currently implements the authentication foundation: registration, email verification, login, password recovery and the authenticated user query. Vehicle and maintenance entities exist in the database schema but have no corresponding application modules or API operations yet. The backend is an independent npm/Git repository, not a workspace package in the parent directory.

This snapshot was inspected on 9 October 2026. Confirmed findings below come from source, configuration, migrations, tests and dependency manifests. Suggestions are explicitly identified in section 8. Existing README and phase documents contain historical guidance and are not authoritative when they differ from implementation.

## 2. Technology Stack

Application and test code use TypeScript; database migrations use SQL, the data model uses Prisma schema syntax, and email templates produce HTML. The package is native ESM (`type: module`). Versions below distinguish declared ranges from exact lockfile versions; the locally installed packages were checked and match those exact versions.

| Package | Manifest range | Locked / installed version | Responsibility |
| --- | --- | --- | --- |
| `@nestjs/core` | `^12.0.1` | 12.1.2 | Nest application runtime |
| `@nestjs/common` | `^12.0.1` | 12.1.2 | Modules, dependency injection, decorators and exceptions |
| `@nestjs/platform-express` | `^12.0.1` | 12.1.2 | Express HTTP platform |
| `@nestjs/config` | `^12.0.1` | 12.0.1 | Environment configuration |
| `@nestjs/graphql` | `^14.0.3` | 14.0.3 | Code-first GraphQL decorators and module |
| `@nestjs/apollo` | `^14.0.3` | 14.0.3 | Nest Apollo driver |
| `@apollo/server` | `^5.5.1` | 5.5.1 | GraphQL server |
| `@as-integrations/express5` | `^1.1.2` | 1.1.2 | Apollo / Express 5 integration |
| `graphql` | `^16.14.2` | 16.14.2 | Schema and GraphQL errors; schema validation in tests |
| `@nestjs/jwt` | `^12.0.2` | 12.0.2 | JWT signing |
| `@nestjs/passport` | `^12.0.0` | 12.0.0 | Passport integration |
| `passport` | `^0.7.0` | 0.7.0 | Authentication middleware |
| `passport-jwt` | `^4.0.1` | 4.0.1 | Bearer JWT strategy |
| `@prisma/client` | `^7.10.0` | 7.10.0 | Prisma runtime |
| `@prisma/adapter-pg` | `^7.10.0` | 7.10.0 | PostgreSQL driver adapter |
| `prisma` | `^7.10.0` | 7.10.0 | Schema, migration and client CLI |
| `argon2` | `^0.45.1` | 0.45.1 | Argon2id password hashing |
| `class-validator` | `^0.15.1` | 0.15.1 | DTO validation |
| `class-transformer` | `^0.5.1` | 0.5.1 | DTO normalization |
| `resend` | `^6.32.0` | 6.32.0 | Transactional email delivery |
| `reflect-metadata` | `^0.2.2` | 0.2.2 | Decorator metadata support |
| `rxjs` | `^7.8.1` | 7.8.2 | Nest ecosystem reactive dependency |
| `@nestjs/cli` | `^12.0.0` | 12.0.8 | Build and development commands |
| `@nestjs/schematics` | `^12.0.0` | 12.0.6 | Nest code generation tooling |
| `@nestjs/mau` | `^0.2.6` | 0.2.8 | Declared Nest deployment tooling; deployment target not established here |
| `@nestjs/testing` | `^12.0.1` | 12.1.2 | Nest testing modules |
| `typescript` | `^6.0.2` | 6.0.3 | TypeScript compiler |
| `vitest` | `^4.1.2` | 4.1.11 | Unit and HTTP integration test runner |
| `@vitest/coverage-v8` | `^4.1.2` | 4.1.11 | Coverage provider |
| `supertest` | `^7.0.0` | 7.3.1 | HTTP assertions |
| `vite-tsconfig-paths` | `^5.1.4` | 5.1.4 | Vitest path resolution plugin; no project aliases currently declared |
| `oxlint` | `^1.58.0` | 1.86.0 | Type-aware lint command |
| `oxlint-tsgolint` | `^7.0.2001` | 7.0.2003 | Type-aware lint support |
| `prettier` | `^3.4.2` | 3.9.9 | Formatting |
| `tsx` | `^4.23.15` | 4.23.15 | Seed and mail script execution |
| `dotenv` | `^18.0.5` | 18.0.5 | CLI/seed environment loading |
| `source-map-support` | `^0.5.21` | 0.5.21 | Declared debugging support; no explicit application import found |

Type declarations are provided by `@types/node`, `@types/express`, `@types/passport-jwt` and `@types/supertest`. They do not establish a pinned Node runtime. There is no package `engines` or `packageManager` field. npm is supported by the scripts, README and committed `package-lock.json`.

PostgreSQL is the database; `compose.yaml` selects the `postgres:18` image with a persistent named volume and a published database port. The running database version was not inspected. Prisma 7 uses the generated client in `src/generated/prisma` and the PostgreSQL adapter, rather than a separate handwritten data access framework. GraphQL is served by Nest/Apollo over HTTP; Passport consumes bearer JWTs. There is no configured subscription transport. A scaffold REST endpoint also remains.

## 3. Project Structure

| Location | Responsibility |
| --- | --- |
| `src/main.ts` | Bootstraps Nest, enables frontend-origin CORS, starts HTTP listener. |
| `src/app.module.ts` | Composes configuration, Prisma, mail, auth and Apollo GraphQL. |
| `src/app.controller.ts`, `src/app.service.ts`, `src/app.resolver.ts` | Scaffold REST greeting and GraphQL `hello` query. |
| `src/auth/` | Auth service/resolver/module, input DTOs, GraphQL payload models, JWT strategy, guard and current-user decorator. |
| `src/users/` | User persistence operations and public GraphQL user model. |
| `src/prisma/` | Injectable Prisma client and exporting module. |
| `src/common/` | Shared GraphQL error contract and auth validation pipe. |
| `src/mail/` | Resend service/module and action email HTML template. |
| `src/generated/prisma/` | Generated client output; excluded from Git, generated before compilation. |
| `prisma/` | Schema, three committed migration directories and seed script. |
| `test/` | HTTP integration tests; unit tests are colocated under `src/`. |
| `scripts/` | Manual mail delivery script. |
| `docs/` | Existing auth phase documentation and this analysis. |
| `.agents/skills/`, `skills-lock.json` | Repository-local Prisma skill resources, not application modules. |
| `dist/`, `node_modules/` | Generated build output and installed dependencies, excluded from Git. |

Configuration is in `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `.oxlintrc.json`, `.prettierrc`, `compose.yaml` and `prisma7.config.ts`. The Prisma configuration has a nonstandard filename and must be selected explicitly. Nest loads `.env`; no environment values are reproduced here.

## 4. Architecture Overview

Nest modules and dependency injection organize the application. GraphQL is code-first: DTO/model decorators define an in-memory schema (`autoSchemaFile: true`). Resolvers delegate business workflows to services. `AuthService` orchestrates users, JWT signing, direct Prisma token transactions and email delivery. `UsersService` uses Prisma directly; there is no separate repository abstraction. `PrismaModule` exports the shared injectable client. Configuration is globally available through `ConfigModule`.

Registration normalizes email, trims names, hashes passwords with Argon2id and assigns the seeded `USER` role. Login requires a verified email and returns an HS256 access token. `me` uses `GqlAuthGuard`, `JwtStrategy` and `CurrentUser`; the JWT carries user ID and role. No refresh-token, logout, revocation or role-based authorization workflow is implemented.

Email verification and password reset use random action tokens. Only SHA-256 token hashes are persisted. Issuance and consumption run in Prisma transactions with PostgreSQL user-row locks; the schema permits one token per user/type. Resends have a cooldown and tokens have configurable expiry. Consumption updates the user and deletes the token atomically. Verification delivery failure preserves registration success and returns a warning, preserving the token and cooldown. Password recovery delivery failure deletes the new token and keeps the public response neutral.

The central GraphQL formatter exposes approved application codes and validation fields while masking internal failures. DTO validation is applied to the auth resolver, not globally at bootstrap. CORS uses `FRONTEND_URL`; email links also use that configuration. Startup validates selected configuration values, but there is no central environment schema.

## 5. Main Modules and Responsibilities

- **Auth:** `register`, `login`, `verifyEmail`, `resendVerificationEmail`, `forgotPassword`, `resetPassword` mutations and protected `me` query. DTO validation, token lifecycle, JWT signing and password hashing are here.
- **Users:** normalized user lookup, default-role selection, user creation, duplicate-email handling and removal of password hash/role ID from the public projection.
- **Prisma:** generated client construction with `DATABASE_URL`. The service currently has no explicit connection/disconnection lifecycle hooks.
- **Mail:** Resend delivery, provider-error conversion to `BadGatewayException`, Italian verification/reset templates and escaped action URLs.
- **App/common:** scaffold greetings, GraphQL composition, error formatting and auth validation.

The schema contains `Role`, `User`, `Vehicle`, `Category`, `MaintenanceEvent` and `ActionToken`. Users own vehicles; vehicles have categorized maintenance events with scheduled/completed status, optional dates/odometer readings and decimal costs. Roles and categories are upserted transactionally by the seed. These database entities should not be mistaken for implemented vehicle API modules.

## 6. Development Workflow

Run commands from `motory-be/`. Commands were verified against configuration and scripts; this documentation task did not install dependencies, start services, run migrations or execute application checks.

| Command | Current purpose / prerequisites |
| --- | --- |
| `npm install` / `npm ci` | Install dependencies; `npm ci` uses the committed lockfile. |
| `docker compose up -d` | Start the PostgreSQL service defined in `compose.yaml`; requires Docker. |
| `npx prisma generate --config prisma7.config.ts` | Generate the ignored client required by source imports. |
| `npx prisma migrate deploy --config prisma7.config.ts` | Apply committed migrations to the configured database. |
| `npx prisma db seed --config prisma7.config.ts` | Run the configured `tsx prisma/seed.ts`; provides roles/categories needed by registration. |
| `npm run start` | Start via Nest CLI. |
| `npm run start:dev` | Start in watch mode. |
| `npm run start:debug` | Start in debug/watch mode. |
| `npm run build` | Compile with Nest CLI into `dist/`. |
| `npm run start:prod` | Run `node dist/main` as currently declared; see ESM caveat in section 8. |
| `npm run lint` | Run `oxlint --type-aware src/ test/`. |
| `npm run format` | Apply Prettier to source/test TypeScript; this command writes files. |
| `npm test` | Run Vitest unit specs. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:cov` | Vitest coverage with V8 provider available. |
| `npm run test:debug` | Vitest inspector with file parallelism disabled. |
| `npm run test:e2e` | Build, then use the E2E Vitest configuration. |
| `npm run mail:test` | Send a real email through Resend to the script's hardcoded recipient; inspect before running. |
| `npm run deploy` | Declared `nest deploy` command; successful deployment/environment setup was not verified. |

Required startup configuration names include `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESEND_API_KEY`, `MAIL_FROM` and `FRONTEND_URL`. Token lifetime settings are `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` and `PASSWORD_RESET_TOKEN_TTL_MINUTES`; `PORT` controls the listener. Supply values locally; never put them into documentation.

Unit specs cover scaffold controller behavior, Prisma construction, users and mail. Auth HTTP tests use compiled Nest classes to retain decorator metadata, with mocked persistence and email delivery; they do not verify real PostgreSQL locking. One contract test reads `../motory-fe/src/features/auth/api/operations.ts`, so the sibling checkout is required. The scaffold app E2E test constructs the real `AppModule` and relies on configured database/mail settings rather than overriding those providers.

## 7. Existing Patterns and Conventions

- Nest filenames use dotted suffixes such as `.module.ts`, `.service.ts`, `.resolver.ts` and `.spec.ts`; DTOs and GraphQL models are grouped under their feature.
- Classes use PascalCase, methods and fields camelCase, error codes and schema enum values uppercase. Local relative imports use `.js` under NodeNext ESM.
- TypeScript is strict, targets ES2023, emits decorator metadata and declarations, and disables strict property initialization for decorated properties. Build configuration excludes specs and `test/`.
- Many auth/users/mail constructors use explicit `@Inject`; Prisma and scaffold code rely on emitted constructor metadata. Both styles exist.
- Input normalization occurs in DTO transforms and user persistence helpers. Passwords are not trimmed. Duplicate Prisma unique constraints are translated into application errors.
- Auth failures use GraphQL extension codes. Mail uses Nest HTTP exceptions internally, then auth workflows convert delivery failures into warnings or neutral recovery outcomes.
- Prettier specifies single quotes and trailing commas; source layout is inconsistent, including compressed decorators and uneven bootstrap indentation. Do not infer a new universal formatting convention from this snapshot.
- Product email text and some operational messages are Italian; identifiers and most server error messages are English.

## 8. Observations and Potential Improvements

These are observations or future suggestions, not changes implemented by this analysis.

1. **Domain implementation gap (confirmed):** vehicle/maintenance schema exists without matching API modules. Future features should grow from the actual schema and module structure.
2. **Historical documentation drift (confirmed):** README includes starter/deployment/observability guidance beyond current wiring. Explicit Prisma generation/config selection and prerequisites would benefit from consolidated setup guidance.
3. **Production command caveat (observation):** `start:prod` names `dist/main` without `.js` in an ESM package. Validate the command with the supported runtime before relying on it; this analysis did not execute it.
4. **Test boundary limitations (confirmed):** auth persistence/email are mocked, so database concurrency guarantees remain untested against PostgreSQL. Consider isolated database integration coverage and documenting the sibling frontend dependency.
5. **Runtime reproducibility (confirmed):** no explicit runtime/package-manager pin. Frontend direct TypeScript tests add a runtime requirement across the project; choose and document compatible versions in a future iteration.
6. **Lifecycle/configuration (observation):** consider central configuration validation and Prisma shutdown handling if operational requirements warrant them.
7. **Auth evolution (confirmed absence):** refresh/revocation, broader throttling and authorization policies are not implemented. Decide their need before expanding account or vehicle features.
8. **Formatting and operational scripts (confirmed):** formatting varies and the mail test has a hardcoded recipient. Future cleanup can clarify formatting expectations and make manual delivery targets configurable when requested.
