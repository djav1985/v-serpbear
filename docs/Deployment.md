# Deployment

Pick the way that matches where you run SerpBear.

| Guide | Use it when |
| --- | --- |
| [Deploy with Docker](Deploy-with-Docker) | You have Docker on your computer or a server. The simplest option, and the recommended one. |
| [Deploy with Node.js](Deploy-with-Node.js) | You want to run it without Docker, locally or on a server with PM2. |
| [Reverse Proxy and SSL](Reverse-Proxy-and-SSL) | You serve SerpBear on your own domain with HTTPS, using Nginx or Traefik. |
| [Deploy to Coolify](Deploy-to-Coolify) | You use the self-hosted Coolify platform. |
| [Deploy to Fly.io](Deploy-to-Fly.io) | You want a hosted machine on Fly.io. |

Whichever you choose:

- Set `USER_NAME`, `PASSWORD`, `SECRET` and `APIKEY`, and set `NEXT_PUBLIC_APP_URL` to the public address. See [Configuration](Configuration).
- Keep the `/app/data` folder on a persistent volume. It holds the SQLite database and `settings.json`.
- Keep the container or process running all the time. The scheduled scrapes run inside it, so a machine that stops when idle will miss them.
- Back up the data before each update. See [Installation](Installation).

The one-click hosts that the original SerpBear lists (Elestio and PikaPods) deploy the original project's image, not this fork, so they are not covered here.
