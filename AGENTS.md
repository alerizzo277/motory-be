# Motory Backend

## Project Overview

Backend for vehicle history and maintenance. Current API implementation focuses on authentication; vehicle/maintenance models exist in Prisma but have no API modules yet.

## Technology Stack

NestJS 12, TypeScript 6 with NodeNext ESM, code-first Nest GraphQL/Apollo Server 5, PostgreSQL (Compose image 18), Prisma 7 with the PostgreSQL adapter, Passport JWT, Argon2id and Resend. Tests use Vitest/Supertest; checks use Oxlint and Prettier. Exact dependency versions are recorded in the analysis and lockfile.

## Project Structure

- `src/main.ts`, `src/app.module.ts`: bootstrap and application composition.
- `src/auth/`: resolver, workflows, DTOs/models, JWT strategy and guards.
- `src/users/`: user persistence and public model.
- `src/prisma/`: injectable client; `src/generated/prisma/` is generated and ignored.
- `src/mail/`, `src/common/`: email delivery/templates and GraphQL error/validation helpers.
- `prisma/`: schema, migrations and role/category seed.
- `test/`: HTTP integration tests; unit specs are colocated in `src/`.

## Architecture

Nest resolvers delegate to injected services; users and auth token workflows access Prisma directly. Preserve code-first GraphQL models, DTO validation, public error codes, secret-free user projections and existing token transaction behavior. Relative TypeScript imports use `.js` for ESM. Auth tests mock persistence/mail; a contract test reads the sibling frontend operations file.

## Development Commands

Run from this repository:

- Install: `npm ci` (lockfile) or `npm install`.
- Database service: `docker compose up -d`.
- Generate client: `npx prisma generate --config prisma7.config.ts` before compilation when absent/outdated.
- Apply migrations: `npx prisma migrate deploy --config prisma7.config.ts`.
- Seed roles/categories: `npx prisma db seed --config prisma7.config.ts`.
- Develop: `npm run start:dev`; debug: `npm run start:debug`.
- Build: `npm run build`; lint: `npm run lint`.
- Tests: `npm test`, `npm run test:watch`, `npm run test:cov`, `npm run test:e2e` (builds first).
- Format: `npm run format` (writes source/test files).

Use local environment configuration; inspect setup prerequisites in the analysis. `mail:test` sends real email to a hardcoded recipient. The declared `start:prod` command uses extensionless `dist/main`; its ESM runtime compatibility is unverified. Deployment is not established by the presence of a script.

## Repository Instructions

- Follow the existing architecture and patterns.
- Inspect relevant existing implementations before making changes.
- Avoid unnecessary abstractions and complexity.
- Prefer existing dependencies and native framework capabilities.
- Do not introduce new direct dependencies without explicit approval.
- Do not make unrelated changes.
- Do not expose or commit secrets or credentials.
- Keep modifications focused on the requested task.
- Do not modify AGENTS.md or project documentation unless explicitly requested.

## Documentation

- `docs/project-analysis.md` contains a snapshot of the project
  architecture, structure, workflows, and known inconsistencies.
- `docs/conventions.md` defines the coding conventions and development
  practices that must be followed when implementing or modifying code.
- `docs/reports/` contains historical reports of completed development tasks.
- Read and follow `docs/conventions.md` before implementing or modifying
  application code.
- Consult `docs/project-analysis.md` when additional architectural context
  is needed.
- Consult relevant reports only when historical implementation context
  is necessary.
- Treat the source code as the source of truth when documentation is outdated.
- Do not create or modify documentation unless explicitly requested.
- Write all documentation in English.

## Code Formatting

- Use Prettier for code formatting.
- Follow the configuration defined in `.prettierrc`.
- After modifying source files, run Prettier only on files changed
  during the task.
- Do not format unrelated files.
- Do not change the Prettier configuration unless explicitly requested.
- Run the relevant Oxlint, test, and build checks before completing a task.
