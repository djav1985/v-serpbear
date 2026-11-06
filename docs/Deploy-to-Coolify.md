# Deploy to Coolify

[Coolify](https://coolify.io) is an open-source, self-hosted platform for running apps on your own server. You deploy SerpBear on it as a Docker Compose resource.

## Prerequisites

- A running Coolify instance (v4 or later).
- A server connected to Coolify.

## Steps

1. In the Coolify dashboard, click **+ Add Resource** (or **+ Create New Resource**) on your project's environment page.
2. Choose **Docker Compose** as the resource type.
3. Paste this into the Docker Compose editor:

   ```yaml
   services:
     app:
       image: vontainment/v-serpbear:latest
       restart: unless-stopped
       ports:
         - "3030:3000"
       environment:
         USER_NAME: ${USER_NAME:-admin}
         PASSWORD: ${PASSWORD}
         SECRET: ${SECRET}
         APIKEY: ${APIKEY}
         SESSION_DURATION: ${SESSION_DURATION:-24}
         NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
         TRUST_PROXY: ${TRUST_PROXY:-1}
         TZ: ${TZ:-America/New_York}
       volumes:
         - data:/app/data

   volumes:
     data:
   ```

   Here the values come from Coolify's Environment Variables screen, so the `${...}` form is right.
4. Open the **Environment Variables** screen and set `PASSWORD`, `SECRET` and `APIKEY`, plus any others you want. The variables are described in [Configuration](Configuration).
5. In the resource's **General** settings, set the domain (for example `https://serpbear.yourdomain.com`). Set `NEXT_PUBLIC_APP_URL` to the same address. Turn on the Let's Encrypt option if you want HTTPS.
6. Click **Deploy**. Coolify pulls the image and starts the container. Watch the deployment logs in the dashboard, then open your domain.

## Updating

Click **Redeploy** on the resource page. Coolify pulls the latest image and restarts the container. The data stays in the `data` volume. Back it up first if you can.
