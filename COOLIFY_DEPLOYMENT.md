# SpiritualShaadi Coolify Deployment

This project is ready to publish at `https://spiritualshaadi.com` through Coolify using the included `Dockerfile`.

## What Runs

- Public site: `https://spiritualshaadi.com/`
- Admin panel: `https://spiritualshaadi.com/admin`
- Health check: `https://spiritualshaadi.com/healthz`
- Server port inside container: `3000`

The admin panel is protected with HTTP Basic Auth. Member accounts, profiles, connection requests, and chat messages are stored on the server in JSON files under `/data`. Admin site copy / payment settings live in the same volume.

## Coolify Setup

1. Push this repository to GitHub/GitLab.
2. In Coolify, create a new Resource from the repository.
3. Select Dockerfile build.
4. Set the domain:
   - `spiritualshaadi.com`
   - Optional additional domain: `www.spiritualshaadi.com`
5. Set the exposed port to `3000`.
6. Add persistent storage (REQUIRED — without this, you lose every member account on each redeploy):
   - Container path: `/data`
   - Purpose: stores `accounts.json`, `connections.json`, `messages.json`, `settings.json`, `session.secret`
7. Add environment variables:

```env
PORT=3000
DATA_DIR=/data
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-long-random-password
SESSION_SECRET=use-a-long-random-string
```

Generate `SESSION_SECRET` locally with `openssl rand -hex 48`. If you omit it, the server creates one on first boot at `/data/session.secret` — fine as long as the volume persists, but setting it explicitly makes the deployment portable.

8. Deploy.
9. In your DNS provider, point `spiritualshaadi.com` to your Coolify server as instructed by Coolify.
10. Enable HTTPS in Coolify for the domain.

## Admin Use

Open:

```text
https://spiritualshaadi.com/admin
```

Login with:

- Username: value of `ADMIN_USERNAME`
- Password: value of `ADMIN_PASSWORD`

The admin panel has four tabs:
- **Website Content** — homepage copy, hero text, feature blurbs
- **Payment Settings** — Razorpay/Stripe credentials (secrets stay server-side)
- **Premium Plans** — name / price / period for each tier
- **Members** — list, view, and delete registered users and seeded sample profiles

## Storage Files (under /data)

- `accounts.json` — every member account, including seeded sample profiles
- `connections.json` — connection requests and matches
- `messages.json` — chat history between matched members
- `settings.json` — admin-configured site content / payment / plans
- `session.secret` — auto-generated HMAC secret (only when `SESSION_SECRET` env var is missing)

On first boot, if `accounts.json` does not exist, the server seeds it from the sample profiles in `profiles.js` so the dashboard is not empty. Seeded profiles auto-accept connection requests after a few seconds and reply with the canned spiritual chat responses defined per profile. Admins can delete them from the Members tab any time.

## Known Non-Goals (Plan to Add Later)

- **SMS OTP** — the signup OTP is currently a client-side demo (shown to the user). Real verification needs Twilio / MSG91 / Fast2SMS integration.
- **Profile photos** — UI uses colored initials. Adding photo upload needs multipart parsing and image moderation.
- **Password reset** — the forgot-password button is informational only.
- **Rate limiting** — no brute-force protection on `/api/auth/login`. Add a Coolify-level rate-limit rule or an in-app bucket before public launch.
- **SQLite/Postgres** — file-based JSON store is fine through a few thousand accounts. Migrate to a real database before scaling.

Do not keep Razorpay secret keys in frontend JavaScript. With this deployment, admin payment secrets are stored server-side and only public payment fields are exposed to the public site.
