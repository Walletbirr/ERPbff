# BH Dashboard BFF

# ERPbff

A thin Express backend-for-frontend that sits between the **Mobilr / BH
Dashboard mobile app** and the **bh_management_dashboard Odoo 18 module**.

```
Mobile App  ── HTTPS + Bearer JWT ──▶  This BFF (:4000)  ── localhost only ──▶  Odoo (:8069)
```

Why this exists: the mobile app used to call Odoo's `auth='public'`
`/bh_dashboard/mobile/*` routes directly, which meant Odoo's JSON-RPC
surface had to sit reachable from the public internet, protected only by an
API-KEY header checked in Python. This BFF takes over that job:

- Only the BFF is exposed publicly. Odoo can go back to listening on
  `127.0.0.1` only.
- The BFF authenticates against Odoo **server-to-server** and holds the
  real Odoo API key in an **in-memory session map** — the phone never sees
  it.
- The phone gets the BFF's own short-lived JWT instead.

## 1. Install

```bash
cd bh-dashboard-bff
npm install
cp .env.example .env
```

Edit `.env`:

- `ODOO_BASE_URL` — leave as `http://localhost:8069` since this runs on
  the same machine as Odoo.
- `ODOO_DB` — your Odoo database name.
- `JWT_SECRET` — generate one, don't leave the placeholder:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

## 2. Run

```bash
npm run dev     # nodemon, auto-restarts on file changes
# or
npm start       # plain node
```

You should see:

```
BH Dashboard BFF listening on port 4000
Talking to Odoo at http://localhost:8069
```

Sanity check: `curl http://localhost:4000/health` → `{"status":"ok",...}`.

## 3. Lock down Odoo (Windows 11, since that's your setup)

Right now `src/config.js` in the mobile app points at `10.44.171.211:8069`
— Odoo's LAN IP, directly. Two changes needed on the Odoo machine:

1. **Odoo config** (`odoo.conf`): make sure it's fine to leave
   `xmlrpc_interface`/`http_interface` unset (binds all interfaces) — the
   firewall rule below is what actually restricts access, not the Odoo
   config.
2. **Windows Firewall**: block inbound `8069` from anything except
   `localhost` (i.e. remove/don't create any inbound-allow rule for 8069
   from the LAN), and instead open **4000** (or whatever `PORT` you set)
   for inbound LAN/internet traffic to this BFF.

If Odoo and the BFF are genuinely on the same machine, Node reaching
`localhost:8069` doesn't need a firewall rule at all — loopback traffic
isn't filtered.

## 4. API surface

| Method | Path                                 | Auth   | Notes                                                |
| ------ | ------------------------------------ | ------ | ---------------------------------------------------- |
| POST   | `/api/auth/login`                    | —      | `{ login, password }` → `{ token, user }`            |
| GET    | `/api/auth/me`                       | Bearer | Returns the current session's user                   |
| POST   | `/api/auth/logout`                   | Bearer | Destroys the server-side session                     |
| GET    | `/api/dashboard?date_from=&date_to=` | Bearer | Proxies `bh.management.dashboard.get_dashboard_data` |
| POST   | `/api/approvals/:orderId/approve`    | Bearer | `{ note }` — **see Known gap below**                 |
| POST   | `/api/approvals/:orderId/reject`     | Bearer | `{ reason }` — **see Known gap below**               |

All authenticated routes expect `Authorization: Bearer <token>`.

## 5. Known gap: approvals aren't wired up in Odoo yet

The mobile app's `api/client.js` already calls
`/bh_dashboard/mobile/approvals/approve` and `/reject`, and this BFF passes
those calls straight through — but `bh_dashboard_controller.py` on the
Odoo side only implements `login` / `whoami` / `get_data` today. Until
that controller gets the matching routes (backed by a `sale_credit_approval`
style model), `/api/approvals/*` will return a clean
`502 odoo_http_error` instead of silently doing nothing. That's the next
piece of work — ask when you're ready to build it.

## 6. Wiring the mobile app to the BFF

Two files change in the Expo app:

**`src/config.js`** — point at the BFF instead of Odoo:

```js
export const DEFAULT_SERVER_URL = "http://10.44.171.211:4000"; // BFF port, not 8069
```

**`src/api/client.js`** — swap the auth header and payload shape:

- Login/whoami/get_data calls stay JSON-RPC-shaped against Odoo today;
  against the BFF they become plain REST/JSON (see routes table above) —
  no `jsonrpc`/`method`/`params` envelope needed.
- Replace the `'API-KEY': apiKey` header with `'Authorization': 'Bearer ' + token`.
- Store the BFF's `token` (from `/api/auth/login`) in `expo-secure-store`
  instead of the raw Odoo `api_key`.

Say the word and I'll rewrite `client.js` and `AuthContext.js` to match —
it's a fairly mechanical change once the BFF's contract above is locked in.

## 7. Project structure

```
src/
├── app.js                     # middleware stack + route mounting
├── server.js                  # entrypoint
├── config/index.js            # all env vars, read once
├── routes/                    # auth / dashboard / approvals
├── controllers/                # request handlers — thin, no Odoo shape knowledge
├── services/
│   ├── odooClient.js           # the ONLY file that knows Odoo's JSON-RPC shape
│   └── sessionStore.js         # in-memory sessionId -> {uid, odooApiKey, ...}
└── middleware/
    ├── auth.middleware.js      # verifies JWT, resolves it to a live session
    ├── rateLimiter.js          # tighter limit on /login specifically
    └── errorHandler.js
```

## 8. Trade-offs you chose (worth remembering)

- **In-memory sessions**: simplest possible setup, but every logged-in
  user is signed out on server restart/redeploy — the app just gets a 401
  and bounces to the login screen, which is expected. If that becomes
  annoying, swap `sessionStore.js` for a SQLite-backed version; nothing
  else in the app needs to change since everything else only calls
  `createSession` / `getSession` / `destroySession`.
- **Same-machine deployment**: `ODOO_BASE_URL=http://localhost:8069`
  assumes the BFF runs on the same Windows machine as Odoo. If you ever
  move it to a separate box, that's the one line to change — plus opening
  8069 to that box specifically (not the whole LAN/internet).
