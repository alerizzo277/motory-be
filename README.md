<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Email transazionali (Resend)

`MailModule` esporta `MailService`: i moduli applicativi possono importare il
modulo e chiamare `sendEmail({ to, subject, html })`, che restituisce `{ id }`.
Resend rimane confinato al servizio. Errori API o di rete diventano
`BadGatewayException` (HTTP 502), con la causa originale preservata.

Configurare nel `.env` locale (non versionato):

```ini
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM=onboarding@resend.dev
```

Prima del test, sostituire `re_xxxxxxxxx` con la vera API key Resend.
Lo script rifiuta di inviare se trova il placeholder.

```bash
npm run mail:test
```

Il test avvia solo il contesto Nest del modulo mail, senza server HTTP o Prisma,
e invia a `alerizzo277@gmail.com` con oggetto `Motory - Resend test`.
L'ID stampato indica che Resend ha accettato il messaggio, non la consegna finale.
Con il mittente di test `onboarding@resend.dev`, il destinatario deve essere
l'indirizzo associato al proprio account Resend; per altri destinatari occorre
un dominio verificato.

## Test automatici

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Autenticazione — Fase 1

Sono disponibili le mutation `register`, `login` e la query protetta `me`.
Non vengono inviate email e non sono implementati refresh token o funzioni di Fase 2.

### Configurazione e migration

Aggiungere a `.env` (vedi `.env.example`):
- `JWT_SECRET`: secret casuale di almeno 32 caratteri.
- `JWT_EXPIRES_IN`: intero positivo espresso in **secondi**, ad esempio `3600`.

Per generare un secret: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

Le variabili esistenti di database e mail restano necessarie per avviare l'applicazione,
perché il modulo mail è già importato; l'autenticazione non utilizza il servizio mail.

Dopo aver configurato PostgreSQL:

```sh
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run start:dev
```

La tabella Prisma `Role` resta l'unica fonte di verità del ruolo:
`User.roleId -> Role.id`, con relazione obbligatoria `User.role`.
Il campo univoco `Role.name` è il codice semantico esistente (USER, ADMIN, ecc.).
La registrazione cerca il record con `name: 'USER'` e assegna il suo ID:
non crea ruoli e, se USER manca, restituisce `INTERNAL_SERVER_ERROR`.
Il seed idempotente assicura USER e ADMIN:

```sh
npx prisma db seed --config prisma7.config.ts
```

Login e me caricano la relazione e restituiscono `role: user.role.name` come
stringa GraphQL; il JWT usa lo stesso codice. Il database non contiene un campo
scalare del ruolo sull'utente. Nuovi ruoli possono essere aggiunti come record
senza cambiare lo schema o una lista di valori nella strategia JWT.
La migration `20261004120000_auth_phase_one`, non ancora applicata al momento
della correzione, è stata corretta direttamente: non modifica le tabelle dei ruoli.
La migration normalizza le email esistenti. Se la normalizzazione provoca collisioni,
la transazione viene annullata: risolvere i duplicati prima di riprovare, senza
cancellazioni automatiche.

### Prova manuale GraphQL

Inviare le operazioni separatamente a `http://localhost:3000/graphql`.

```graphql
mutation {
  register(input: {
    email: "Mario@example.com"
    password: "password123"
    firstName: "Mario"
    lastName: "Rossi"
  }) {
    id
    email
    role
  }
}
```

La registrazione restituisce l'utente, senza effettuare login. Nel database
`passwordHash` deve iniziare con `$argon2id$`.

```graphql
mutation {
  login(input: { email: "mario@example.com", password: "password123" }) {
    accessToken
    user { id email firstName lastName role }
  }
}
```

Per la query seguente impostare l'header HTTP `Authorization: Bearer <accessToken>`:

```graphql
query {
  me {
    id
    email
    firstName
    lastName
    role
    createdAt
    updatedAt
  }
}
```

Ripetere `me` senza token, con token invalido o scaduto:
`extensions.code` deve essere `UNAUTHENTICATED`.
Una password errata o un'email inesistente producono lo stesso messaggio e
`INVALID_CREDENTIALS`. Registrare nuovamente la stessa email, anche con maiuscole,
produce `EMAIL_ALREADY_EXISTS`.

I codici applicativi sono `EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS`,
`UNAUTHENTICATED`, `USER_NOT_FOUND`, `VALIDATION_ERROR` e
`INTERNAL_SERVER_ERROR`. Un token valido associato a un utente eliminato produce
`USER_NOT_FOUND`. Gli errori di validazione includono `extensions.fields`
con il campo e i messaggi, senza valori degli input. I dettagli interni e gli
stack trace non vengono restituiti al frontend.

Le password accettate in registrazione hanno 8–128 caratteri; i nomi, dopo trim,
1–100 caratteri. Le password non vengono modificate da trim.
Il JWT usa HS256 e contiene `sub`, `role` e i claim temporali `iat`/`exp`.
Il ruolo nel JWT non introduce autorizzazioni ADMIN; `me` legge sempre i dati aggiornati.

### Verifica automatizzata

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

La suite e2e esegue prima la build per mantenere i metadata dei decorator Nest
necessari alla validazione. I test auth usano Prisma simulato e Argon2/JWT reali:
flusso completo, email duplicate, errori credenziali, token invalidi/scaduti,
utente eliminato, validazione e mancata esposizione di hash e dettagli interni.
