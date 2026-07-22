# AGENTS.md — AlgoGambit Backend

These instructions apply to the entire backend repository. Human instructions in the active task take precedence.

## Repository identity

- Repository: `https://github.com/youssefemadhassan66/LMS.git`
- Default branch: `main`
- Local workspace: `F:\Study_OLD\Web-Development-projects\27-LMS\Backend`
- Production clone: `/home/ubuntu/LMS`
- Production PM2 process: `lms-backend`
- Runtime: Node.js `>=22.12.0 <23`
- Package manager: npm with `package-lock.json`

The frontend is a separate repository at `../FrontEnd` / `LMS_FrontEnd.git`. Do not mix frontend changes into this repository.

## Production topology

The application is deployed on an Oracle Cloud Always Free Ubuntu ARM VM:

```text
Browser frontend
    -> HTTPS / Nginx
    -> Node.js backend on private port 3000
    -> MongoDB Atlas
    -> Cloudinary
    -> SMTP (currently configured using Mailtrap during deployment/testing)
```

- Public frontend: `https://www.algogambit.online`
- Backend binds/listens on port `3000`; that port must remain closed to public ingress.
- Nginx is the public reverse proxy on ports `80` and `443`.
- The intended API hostname is `https://api.algogambit.online`; confirm the live Nginx configuration before assuming the hostname because the API may instead be proxied under the `www` host.
- Local server health endpoint: `http://127.0.0.1:3000/api/v1/health`
- Public health endpoint: `/api/v1/health` through the configured Nginx hostname.
- PM2 runs one process in fork mode. Do not introduce cluster mode without first externalizing process-local Socket.IO state, rate limits, and scheduler coordination.

Production access and deployment are separate from normal code work. Do not SSH, deploy, restart services, alter DNS, or modify production data unless the user explicitly requests it.

## Work already completed

Production hardening was merged into `main` in commit `b6b31d8` (`Harden backend for production deployment`). That work included:

- Strict production environment validation.
- A `/api/v1/health` endpoint that reports database connectivity.
- PM2 configuration in `ecosystem.config.cjs`.
- A single PM2 fork process with scheduler coordination.
- Production-aware proxy trust, CORS, logging, graceful shutdown, and operational defaults.
- A Node 22 engine contract.
- Production deployment documentation in the parent workspace.

Do not undo these controls merely to make startup easier. Fix the configuration or deliberately design an optional feature with tests.

## Important entry points

- `server.js`: validates environment, connects MongoDB, creates the HTTP/Socket.IO server, starts the scheduler, and handles shutdown.
- `App.js`: Express application, middleware, CORS, health route, API routers, error handling.
- `ecosystem.config.cjs`: PM2 process declaration.
- `Configs/validateEnv.js`: startup environment contract.
- `Configs/DbConfig.js`: MongoDB connection and pool settings.
- `Utilities/SocketManager.js`: Socket.IO setup and CORS.
- `Utilities/scheduler.js`: in-process scheduled jobs.
- `Utilities/EmailHelper.js`: Nodemailer transport and email templates.
- `Services/AuthServices.js`: authentication, tokens, forgot/reset password, and related email behavior.

## Required local verification

Install the locked dependency set:

```powershell
npm ci
```

Run tests and formatting validation:

```powershell
npm test
npm run format:check
```

When changing startup, environment, database, authentication, scheduler, email, Socket.IO, or middleware behavior, add or update focused tests. The full backend suite previously passed 64 tests after the production-hardening work; do not treat that historical count as a substitute for running the current suite.

## Environment contract

The real `.env` is intentionally ignored and must never be committed, printed, pasted into chat, or included in logs. `.env.example` documents names only.

Production currently requires:

```text
CONNECTION_STRING
PORT
NODE_ENV
SALT_ROUNDS
JWT_TOKEN_SECRET
JWT_TOKEN_EXPIRES_IN
JWT_REFRESH_TOKEN_SECRET
JWT_REFRESH_EXPIRES_IN
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
EMAIL_HOST
EMAIL_PORT
EMAIL_SECURE
EMAIL_USER
EMAIL_PASS
```

Important operational variables:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://www.algogambit.online,https://algogambit.online
CLIENT_URL=https://www.algogambit.online
TRUST_PROXY=1
LOG_TO_DISK=false
SCHEDULER_ENABLED=true
```

- `CORS_ORIGIN` is the exact browser frontend origin list, without trailing slashes.
- `CLIENT_URL` is used for browser-facing links such as password reset.
- `TRUST_PROXY=1` matches one Nginx reverse-proxy hop.
- Generate independent JWT secrets of at least 32 characters.
- Production bcrypt rounds must be at least 12.
- `PRODUCTION_CONNECTION_STRING` is not the active database variable; use `CONNECTION_STRING`.
- Optional AI features use `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`.

If email should become optional, do not comment out validation alone. Add an explicit feature flag, skip only email jobs, return a clear unavailable response for email-dependent endpoints, and test both enabled and disabled modes.

## Known email and scheduler follow-up

Do not assume scheduled email delivery is correct merely because the server starts.

At the time this file was written:

- `SignUpService` sets `emailVerified: true`; signup does not require verification.
- `sendVerificationEmail` is imported but not used by signup.
- Forgot-password still depends on `sendPasswordResetEmail` and must fail clearly if delivery is unavailable.
- Scheduler calls and email-helper signatures need reconciliation:
  - Scheduler passes `session`, while the helper expects `sessionTitle` and `sessionDate`.
  - Scheduler passes `task`, while the helper expects `taskTitle` and `dueDate`.
  - Scheduler passes `children`, while the weekly helper expects a `summary` object.
- Live Mailtrap sending uses an SMTP login that may not be a sender email. Introduce a separate `EMAIL_FROM` setting before relying on live transactional delivery.
- Mailtrap Sandbox captures messages for testing and does not deliver them to real recipients.

Any agent touching these areas should trace the full call contract, add tests, and avoid silently swallowing delivery failures that users depend on.

## PM2 behavior

`npm run start:prod` executes:

```bash
pm2 start ecosystem.config.cjs --env production
```

The ecosystem file defines:

- Name `lms-backend`.
- Script `./server.js`.
- One fork-mode instance.
- Automatic restart.
- Four-second restart delay.
- One-gigabyte memory restart threshold.
- Production `NODE_ENV` and scheduler activation.

Do not manually start `App.js` or a second `server.js` process. `App.js` defines the Express app but is not the standalone production entry point. Multiple manual PM2 processes previously caused confusing crash loops.

`online` for a moment is not sufficient verification. Inspect restart count, logs, and the health endpoint.

## Manual backend deployment

The normal release path is:

```text
edit/test on Windows -> push main -> pull main on Oracle -> install -> restart -> health check
```

On Oracle, after an explicitly authorized deployment:

```bash
cd ~/LMS
git status
git branch --show-current
git pull --ff-only origin main
npm ci --omit=dev
node --input-type=module -e "import 'dotenv/config'; const {validateEnv}=await import('./Configs/validateEnv.js'); validateEnv();"
pm2 restart ecosystem.config.cjs --env production --update-env
pm2 status
pm2 logs lms-backend --lines 50 --nostream
curl -i http://127.0.0.1:3000/api/v1/health
```

Then verify through the actual Nginx HTTPS hostname.

- Stop if `git status` shows unexpected server edits.
- Use `git pull --ff-only`; do not create server-only merge commits.
- Do not use `git reset --hard` to resolve deployment drift.
- `.env` remains on Oracle because Git ignores it.
- `pm2 save` is needed when the process definition changes, not for every code restart.

For a bad release, prefer reverting the bad commit in the development repository, pushing the revert, and redeploying. Preserve shared history.

## Security and compatibility expectations

- Preserve exact credentialed CORS behavior; never replace production origins with `*`.
- Keep port `3000` private and access it through Nginx.
- Maintain authorization at both role and resource ownership levels.
- Do not log tokens, cookies, passwords, SMTP credentials, connection strings, or API keys.
- Validate and bound pagination, filters, uploads, and user-controlled query operators.
- Be careful with schema changes: existing MongoDB documents may not contain newly required fields.
- Keep backend changes backward-compatible with the currently deployed frontend whenever deployments are not atomic.
- Socket.IO and REST must continue to share the same HTTP server and public origin unless the architecture is deliberately changed.

## Related documentation

The parent workspace currently contains:

- `PROJECT_EXPLANATION.md`
- `DEPLOYMENT_PLAN.md`
- `SERVER_UPDATE_GUIDE.md`
- `specs/001-production-deployment/`

The parent directory is not a Git repository, so those files are local workspace documentation unless deliberately copied into a versioned repository.
