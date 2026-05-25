# SpiritualShaadi Coolify Deployment

This project is ready to publish at `https://spiritualshaadi.com` through Coolify using the included `Dockerfile`.

## What Runs

- Public site: `https://spiritualshaadi.com/`
- Admin panel: `https://spiritualshaadi.com/admin`
- Health check: `https://spiritualshaadi.com/healthz`
- Server port inside container: `3000`

The admin panel is protected with HTTP Basic Auth. Public site settings are stored on the server in `/data/settings.json`, so admin changes are visible to all visitors.

## Coolify Setup

1. Push this repository to GitHub/GitLab.
2. In Coolify, create a new Resource from the repository.
3. Select Dockerfile build.
4. Set the domain:
   - `spiritualshaadi.com`
   - Optional additional domain: `www.spiritualshaadi.com`
5. Set the exposed port to `3000`.
6. Add persistent storage:
   - Container path: `/data`
   - Purpose: keeps admin settings after redeploys
7. Add environment variables:

```env
PORT=3000
DATA_DIR=/data
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-long-random-password
```

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

Admin changes are saved to `/data/settings.json` and loaded by the public site through `/api/settings`.

## Important Production Notes

This deployment makes the site publishable, but the member signup/login data is still browser-local. That means user accounts and chats exist only in each visitor's browser. For a real matrimony business, the next production step is a backend database for members, OTP via SMS provider, real authentication sessions, and payment processing.

Do not keep Razorpay secret keys in frontend JavaScript. With this deployment, admin payment secrets are stored server-side and only public payment fields are exposed to the public site.
