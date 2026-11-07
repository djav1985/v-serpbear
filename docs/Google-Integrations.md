# Google Integrations

Both integrations are optional. The setup steps follow the [original SerpBear documentation](https://docs.serpbear.com/).

- [Google Search Console](#google-search-console): real impressions, clicks and CTR next to your rankings
- [Google Ads](#google-ads): keyword research and monthly search volumes

---

## Google Search Console

Once connected you can:

- see the actual visits, impressions and average position beside each tracked keyword;
- explore keywords that already rank in Google (the Discover tab);
- view the last 30 days of stats: top keywords, countries and pages (the Insight tab);
- get the last 7 days of Search Console data in the notification email.

Without credentials the dashboard card is hidden and the Insight tab shows a message.

If one of the 3, 7 or 30 day requests fails, only that window keeps its previous data and the error is recorded; a successful fetch with no rows is stored as an empty result. The 7 day comparison uses calendar dates, so missing days in the stored stats do not shift it. Insight totals compute CTR as clicks divided by impressions, the average position is weighted by impressions, and the Pages table counts distinct keywords.

### Step 1: Create a Google Cloud project

Create a new project in your [Google Cloud](https://console.cloud.google.com) account.

### Step 2: Enable the Google Search Console API

In your Google Cloud dashboard go to **Library**, search for "Google Search Console" and click **Enable API**.

> Make sure the API status shows as **Enabled**. If you skip this step, SerpBear returns a "Forbidden" error when it fetches data, even when the credentials are correct.

### Step 3: Create a service account key

1. Open the Google Service Accounts dashboard and select your project.
2. If no service account exists, click **+ Create Service Account**, give it a name (for example `serpbear`), then **Create and Continue**. For the role, choose **Viewer** under Basic roles, or skip it, since access is granted in Search Console in step 4. Click **Done**.
3. Click the three dots beside the service account and choose **Manage Keys**.
4. Click **Add key** and choose **JSON**.
5. A JSON file downloads. It contains the `client_email` and `private_key` values you need.

> Google Cloud organizations created after May 2024 block key creation by default through the `iam.disableServiceAccountKeyCreation` policy. If you see "Key creation is not allowed on this service account", open the Google Cloud Shell and run `gcloud org-policies delete iam.disableServiceAccountKeyCreation --organization=YOUR_ORG_ID`. You need the Organization Policy Administrator role. A personal Google account that is not part of an organization is not affected.

### Step 4: Give the service account access to your properties

1. In Google Search Console, select the domain you want to connect.
2. Open **Settings**, then **Users and permissions**.
3. Click **Add user**, paste the `client_email` from the JSON file, and set the permission to **Full**.

Repeat this for every domain you want to connect.

### Step 5: Connect it to SerpBear

First check which property type your domain has in Search Console:

- **Domain property** (`example.com`): covers all subdomains and protocols.
- **URL-prefix property** (`https://example.com/`): covers only that prefix.

In SerpBear's domain settings, the property type must match. Choose **Domain** for a domain property. Choose **URL** for a URL-prefix property, and enter the exact URL as shown in Search Console. A mismatch is the most common cause of "Forbidden" errors.

There are three ways to give SerpBear the credentials. They are read in this order:

1. **Domain settings:** insert the `client_email` and `private_key` in a domain's settings. This uses that account for that domain only.
2. **App settings:** open **Settings → Search Console** and insert the two values. They are used for every domain without its own.
3. **Environment variables:** set `SEARCH_CONSOLE_CLIENT_EMAIL` and `SEARCH_CONSOLE_PRIVATE_KEY` in `docker-compose.yml`. Keep the newlines in the key escaped as `\n`. They are used for all domains, as long as the service account has access to each one.

### How the data is refreshed

Cached data is refetched when a dashboard or API read finds it more than 24 hours old, and by the cron at the `CRON_MAIN_SCHEDULE` time. Search Console days follow Pacific Time (`America/Los_Angeles`) whatever `TZ` is. Results are read in pages of up to 25,000 rows.

---

## Google Ads

Once connected you can:

- research keywords on the **Research** page;
- generate keyword ideas from a site's content, from keywords that already rank in Search Console, from your tracked keywords or from custom keywords;
- see monthly search volumes for tracked keywords.

There are no Google Ads environment variables. Everything is set in the Settings screen.

### Prerequisites

- SerpBear must be reachable at a public URL (not `localhost` or a `.local` name) if you set up the OAuth sign-in from another machine. Google's redirect needs a valid, routable address.
- Set `NEXT_PUBLIC_APP_URL` (or `APP_URL`) to the full external URL of SerpBear, for example `https://serpbear.yourdomain.com`. It builds the OAuth redirect address, especially behind a reverse proxy.

### Step 1: Create a Google Cloud project

Create a project in [Google Cloud](https://console.cloud.google.com), or reuse the one from the Search Console steps.

### Step 2: Enable the Google Ads API

Go to **APIs & Services → Library**, search for "google ads" and enable the **Google Ads API**.

### Step 3: Get the client ID and secret

1. Go to **APIs & Services → Credentials** and create OAuth client credentials (a web application).
2. Under **Authorized redirect URIs**, add your SerpBear URL with `/api/adwords` on the end. It must match the address your browser uses exactly:
   - `http://localhost:3000` gives `http://localhost:3000/api/adwords`
   - `https://serpbear.yourdomain.com` gives `https://serpbear.yourdomain.com/api/adwords`
3. `NEXT_PUBLIC_APP_URL` must match that address without the `/api/adwords` part.
4. In SerpBear, open **Settings → Google Ads**, paste the client ID and client secret, and click **Authenticate Integration**. A Google page opens in a new window. Grant the access it asks for.

### Step 4: Create a Manager account and get the developer token

1. Create a [Google Ads Manager account](https://ads.google.com/home/tools/manager-accounts/) (also called an MCC account). Use an email address that is not already attached to a Google Ads account.
2. Click **Tools**, then **API Center**.
3. Copy the **Developer Token** and paste it in the **Developer token** field in SerpBear.

### Step 5: Apply for Basic Access

A new developer token starts with Test Account Access or Explorer Access. Those levels cannot use Keyword Planning, which SerpBear needs. To upgrade:

1. In the Manager account, go to **Tools → API Center**.
2. Check the access level. If it says Test Account Access or Explorer Access, click **Apply for Basic Access** and fill out the form.
3. The review usually takes about 2 business days.

Without Basic Access you get "Failed to connect to Google Ads" or `DEVELOPER_TOKEN_NOT_APPROVED` errors, even when everything else is set up correctly.

### Step 6: Set the account ID

You need a Google Ads customer account to send requests against.

- **Option A, a test account (good for getting started):** in the Manager account, click **+** and choose **New Test Account**. Copy its 10-digit account ID (for example `123-456-7890`) into SerpBear's **Account ID** field. Test accounts show as "Cancelled" with a red "Test account" label. That is normal.
- **Option B, an existing account:** link your existing Google Ads account under the Manager account (it does not need to run campaigns) and use its account ID.

### Step 7: Test it

Click **Test Google Ads Integration**. A success message means it is set up.

### Step 8: Load volumes for existing keywords

Click **Update Keyword Volume Data** once to fill in search volumes for keywords you already track. From then on, volumes are fetched when you add keywords. A domain-wide update that spans several countries asks Google once per country, so it runs in the background: SerpBear confirms the credentials, shows a "started" message and you reload the page a few minutes later to see the volumes. Domain-wide lookups are limited to 6 per hour per client (2 per hour for all domains).

### Troubleshooting Google Ads

**"Failed to connect to Google Ads. Please make sure you have provided the correct API info."** This is the most common error. Check:
- **Access level:** you need Basic Access or higher.
- **Account ID:** it must belong to an account linked under your Manager account.
- **Developer token:** it must come from the Manager account, not a test manager account.
- **Version:** Google retires old API versions about every 12 months, so update SerpBear to the latest release.

**`redirect_uri_mismatch` during sign-in.** The redirect address SerpBear sends does not match the one registered in Google Cloud. Causes:
- A reverse proxy not forwarding headers. For Nginx, add `proxy_set_header Host $host;`, `X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto $scheme` and `X-Forwarded-Host $host`. For Apache, set `ProxyPreserveHost On` and the matching `RequestHeader` lines.
- `NEXT_PUBLIC_APP_URL` not set. Set it to your full external URL.
- HTTP versus HTTPS: set `NEXT_PUBLIC_APP_URL` with `https://`, or make your proxy send `X-Forwarded-Proto`. See also `TRUST_PROXY` in [Security](Security).
- Some NAS devices change headers. Try opening SerpBear directly, without the proxy, to finish the sign-in, or set `NEXT_PUBLIC_APP_URL` explicitly.

**"Error Loading Keyword Volume Data", or the volume update fails silently.** Check the developer token access level first. Then read the server logs (`docker logs <container>`) for lines starting with `[ERROR] Google Ads`.

**403 during Google sign-in.** Configure the OAuth consent screen (**APIs & Services → OAuth consent screen**). If the app is in Testing mode, add your Google account to the test users. Make sure the scope `https://www.googleapis.com/auth/adwords` is listed.

**"No Code Provided By Google. Please Try Again!"** You opened `/api/adwords` directly. Use the **Authenticate Integration** button instead.

| Error | Meaning |
| --- | --- |
| `DEVELOPER_TOKEN_NOT_APPROVED` | The token needs Basic Access |
| `USER_PERMISSION_DENIED` | The account ID is not reachable from your Manager account |
| `CUSTOMER_NOT_FOUND` | The account ID does not exist or is malformed |
| `OAUTH_TOKEN_INVALID` | The refresh token expired or was revoked; authenticate again in Settings |
| `RESOURCE_EXHAUSTED` | Rate limit hit; wait and try again |

If it still fails, check the logs, click **Authenticate Integration** again for a fresh refresh token, and update SerpBear.

### Keyword ideas

- The seed type decides where suggestions come from: `auto` uses the domain as a site seed, `custom` your keyword list, `tracking` the domain's tracked keywords, and `searchconsole` its top 100 Search Console queries by impressions over the last 30 days.
- An idea is disabled only when it is tracked for every selected device, so a partly tracked idea can still be added for the missing device.
- Selected ideas can be emailed from the research table or a domain's ideas tab, limited to 10 per domain per hour.
