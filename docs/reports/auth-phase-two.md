# Autenticazione — Fase 2

Implementazione coordinata nel workspace `motory-be` / `motory-fe`, 6 ottobre 2026.
Il contratto è generato dai resolver NestJS code-first. Una prova automatica valida
le sette operazioni Apollo contro l'introspection del backend reale.

## File backend

Modificati:

- `prisma/schema.prisma`
- `src/auth/auth.module.ts`
- `src/auth/auth.resolver.ts`
- `src/auth/auth.service.ts`
- `src/auth/dto/auth.input.ts`
- `src/common/graphql-errors.ts`
- `src/mail/mail.service.ts`
- `src/mail/mail.service.spec.ts`
- `test/auth.e2e-spec.ts`
- `test/app.e2e-spec.ts`
- `README.md`

Creati:

- `.env.example` (non esisteva nel checkout)
- `prisma/migrations/20261006190000_auth_phase_two/migration.sql`
- `src/mail/templates/action-email.ts`
- `docs/auth-phase-two.md`
- `src/auth/models/register-payload.model.ts` (aggiornamento 9 ottobre)
- `src/auth/models/auth-warning.model.ts` (aggiornamento 9 ottobre)

Prisma Client rigenerato in `src/generated/prisma`, directory già esclusa da Git.
UsersService, seed, JWT strategy e tabella Role conservano il contratto esistente.

## File frontend

Modificati:

- `src/app/router/AppRouter.tsx`
- `src/features/auth/api/operations.ts`
- `src/features/auth/components/AuthLayout.css`
- `src/features/auth/pages/LoginPage.tsx`
- `src/features/auth/pages/RegisterPage.tsx`
- `src/graphql/client/errors.ts`
- `package.json`, `package-lock.json`, `.gitignore`

Creati:

- `src/features/auth/components/PasswordInput.tsx`
- `src/features/auth/components/ResendVerification.tsx`
- `src/features/auth/pages/VerifyEmailPage.tsx`
- `src/features/auth/pages/EmailRequestPage.tsx`
- `src/features/auth/pages/ResetPasswordPage.tsx`
- `playwright.config.ts`
- `e2e/auth.spec.ts`
- `docs/frontend-auth-phase2.md`

## Prisma e migration

```prisma
enum ActionTokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}

model ActionToken {
  id        String          @id @default(uuid()) @db.Uuid
  userId    String          @db.Uuid
  type      ActionTokenType
  tokenHash String          @unique
  expiresAt DateTime
  createdAt DateTime        @default(now())
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type])
  @@index([userId, type])
}
```

A User sono aggiunti soltanto `emailVerifiedAt DateTime?` e la relazione inversa
`actionTokens ActionToken[]`. `emailVerifiedAt` non è un input GraphQL.
Non esiste un booleano duplicato. Il ruolo resta `User.roleId → Role` e il codice
semantico esistente è `Role.name = USER`, non un nuovo campo `code`.

La migration aggiunge colonna nullable, enum, tabella, indici e foreign key cascade.
Non modifica Role e non presume verificati gli utenti già presenti: il loro valore
rimane null e potranno richiedere una verifica attraverso il reinvio.
La migration è stata creata e lo schema validato; non è stata applicata al database.

Dalla directory backend, configurato il database:

```sh
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npx prisma db seed --config prisma7.config.ts
npm run start:dev
```

Il seed è idempotente e assicura USER e ADMIN, senza creare utenti verificati.

## Environment

Nuove impostazioni backend in `.env.example`:

```ini
FRONTEND_URL=http://localhost:5173
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES=1440
PASSWORD_RESET_TOKEN_TTL_MINUTES=60
```

FRONTEND_URL è obbligatoria e validata all'avvio (HTTP/HTTPS, senza credenziali).
Le TTL hanno i default indicati e sono validate come interi positivi fino a 525600
minuti. Nessun URL localhost è inserito nei template.
Restano necessarie DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, RESEND_API_KEY e MAIL_FROM.
Il file `.env` locale non è modificato. Il frontend continua a usare VITE_GRAPHQL_URL.

## Contratto GraphQL

```graphql
type Mutation {
  register(input: RegisterInput!): RegisterPayload!
  login(input: LoginInput!): AuthPayload!
  verifyEmail(token: String!): Boolean!
  resendVerificationEmail(input: EmailInput!): AuthWarningsPayload!
  forgotPassword(input: EmailInput!): Boolean!
  resetPassword(input: ResetPasswordInput!): Boolean!
}

type RegisterPayload {
  user: User!
  warnings: [AuthWarning!]!
}

type AuthWarning {
  code: String!
}

type AuthWarningsPayload {
  warnings: [AuthWarning!]!
}

input EmailInput {
  email: String!
}

input ResetPasswordInput {
  token: String!
  newPassword: String!
}
```

La query protetta `me: User!` resta invariata. Il tipo applicativo è assegnato dal backend, non è un input pubblico.
Gli input non consentono di impostare emailVerifiedAt o roleId.
Email normalizzata con trim/lowercase, massimo 254 caratteri; password nuova
8–128 caratteri senza trim. Conferma password esclusivamente frontend.

Nuovi codici pubblici: EMAIL_NOT_VERIFIED, VERIFICATION_TOKEN_INVALID,
PASSWORD_RESET_TOKEN_INVALID. Conservati EMAIL_ALREADY_EXISTS,
INVALID_CREDENTIALS, UNAUTHENTICATED, USER_NOT_FOUND, VALIDATION_ERROR,
INTERNAL_SERVER_ERROR. Il frontend interpreta extensions.code, mai message.

## Flussi

Registrazione: UsersService crea utente con verifica null e ruolo USER; AuthService
genera 32 byte casuali Base64URL, salva solo SHA-256 e invia il link tramite MailService.
Non viene generato JWT. RegisterPage mostra indirizzo, istruzioni, reinvio e login.

Verifica: `/verify-email?token=…` mostra loading e consuma il token EMAIL_VERIFICATION.
Dentro una transazione aggiorna emailVerifiedAt e cancella il token. Un link assente,
sostituito, scaduto o consumato restituisce lo stesso VERIFICATION_TOKEN_INVALID.
La pagina non presume che il conto sia già attivato; permette reinvio tramite email.
Il frontend riutilizza la richiesta in-flight durante il replay degli effect StrictMode.

Login: controlla email/password prima dello stato email. Credenziali errate mantengono
INVALID_CREDENTIALS; credenziali corrette con verifica null producono EMAIL_NOT_VERIFIED,
senza JWT. La pagina offre reinvio. Solo utenti verificati ottengono il JWT esistente.

Recupero: `/forgot-password` invoca forgotPassword e mostra sempre un messaggio neutro.
Solo un utente esistente riceve un token PASSWORD_RESET e relativa email.

Reset: `/reset-password?token=…` richiede nuova password e conferma. Il backend valida
il token, crea hash Argon2id, aggiorna passwordHash e cancella il token nella stessa
transazione. Non cambia emailVerifiedAt. La pagina mostra successo e link Accedi,
oppure il messaggio PASSWORD_RESET_TOKEN_INVALID e un nuovo recupero.

## Concorrenza, reinvii e provider

Emissione e consumo bloccano la riga User con SELECT FOR UPDATE in transazione.
Dopo il lock viene ricontrollato il token. La constraint unique(userId, type) rinforza
il vincolo anche a livello database. Il nuovo token sostituisce il precedente dello
stesso tipo, senza alterare il token dell'altro tipo.

Cooldown 60 secondi, calcolato con createdAt, sia per reinvio verifica sia per recupero.
Email assente o già verificata e cooldown producono lo stesso risultato neutro: per
resend `{ warnings: [] }`; per forgot password `true`.

Dal 9 ottobre 2026 register restituisce `{ user, warnings }`: un fallimento della mail
successivo alla creazione non annulla la registrazione e non elimina il token.
Il warning è `{ code: "VERIFICATION_EMAIL_SEND_FAILED" }`, mai un GraphQL error.
Resend usa lo stesso warning in AuthWarningsPayload e conserva il token anche su
fallimento, preservando createdAt per il cooldown reale. I dettagli della causa vengono
registrati tramite Logger NestJS, mai nel contratto pubblico.
Forgot password conserva il proprio comportamento neutro e consente un successivo
retry dopo errore provider, eliminando solo il token PASSWORD_RESET dell'invio fallito.

La schermata Controlla la tua email compare sempre dopo register success. In caso di
warning mostra Account creato correttamente e un messaggio informativo non rosso.
Reinvia email è sempre presente; countdown 60 secondi dopo registrazione e dopo una
risposta applicativa di reinvio, anche con warning. Il countdown usa una scadenza assoluta,
aggiornata ogni secondo, senza introdurre sicurezza o persistenza frontend aggiuntiva.

I token sono eliminati dopo consumo, sostituzione o cancellazione utente (cascade).
Quelli scaduti non sono utilizzabili; non è introdotto un job di cleanup in questa fase.
Password e token originali non sono loggati né salvati come token nel database.
JWT e sessioni non utilizzano ActionToken. Nessun refresh token o invalidazione globale JWT.

## Email e UI

Un solo piccolo template funzionale `mail/templates/action-email.ts`: layout tabellare,
CSS inline, Arial, palette Motory, wordmark testuale, pulsante e footer. Nessuna immagine
né motore di templating. Il template riceve URL e TTL; escape dell'URL HTML.
Verifica indica normalmente 24 ore; reset 60 minuti e istruzioni per ignorare l'email.
MailService espone sendVerificationEmail e sendPasswordResetEmail e conserva Resend.

PasswordInput è puramente UI: input props standard, stato locale visibile/nascosto,
icona SVG inline, aria-label Mostra/Nascondi password, aria-pressed e type=button.
Usato nei cinque campi Login/Register/Reset; mantiene focus, autocomplete e disabled.
Nessuna nuova libreria UI. Tutte le pagine riusano AuthLayout, BrandLogo, token CSS,
input, button e messaggi errori esistenti. AuthLayout.tsx non è modificato; il CSS aggiunge
soltanto wrapper password, azioni e link con stile button.

## Verifiche

Backend: build e lint superati; 11 test unitari, 30 HTTP/GraphQL superati.
Test reali dei resolver, DTO, formatter, Argon2id e JWT; Prisma e Resend simulati.
Copertura: registrazione, login bloccato/verificato, hash token, URL e TTL, verifica
valida/invalida/scaduta, token errato per tipo, consumo singolo, reinvio e sostituzione,
risposte neutre, provider failure, reset e login con nuova password, verifica invariata,
input privati rifiutati, rollback e contratto Apollo validato tramite introspection.
Schema Prisma validato e Client generato.

Frontend: build e lint superati; 7 test Node e 12 test browser Playwright superati.
Browser: registrazione/check email, verifica riuscita e non valida, login non verificato,
reinvio, forgot neutro, reset con conferma, login nuova password, link mancanti,
toggle di tutti i campi password senza submit e responsive a 320 px.
Playwright usa richieste GraphQL simulate; le operazioni stesse sono validate contro
lo schema NestJS dai test backend. Non è stata effettuata una consegna Resend reale
né un test della migration/concorrenza contro PostgreSQL reale.

Comandi backend: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`.
Comandi frontend: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`.
Per Playwright installare il browser con `npx playwright install chromium`, oppure
impostare PLAYWRIGHT_CHROME_PATH al percorso di Chrome già installato.
Questa verifica ha usato Chrome locale senza scaricare ulteriori browser.

```text
React Auth Pages
    ↓
Apollo
    ↓
NestJS AuthResolver
    ↓
AuthService
    ├── UsersService / Prisma
    ├── ActionToken
    └── MailService / Resend
```
