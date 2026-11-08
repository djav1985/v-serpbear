# Scrapers

SerpBear asks a SERP data provider for Google results. Pick one globally in **Settings → Scraper**, or give each domain its own.

## Supported providers

![Scraper settings](images/settings-scraper.png)

| Provider | Pricing snapshot* | Geo targeting | Map pack | Mobile | Authentication |
| --- | --- | --- | --- | --- | --- |
| Serply (`serply`) | Plans from $49/mo | Country | Yes | Yes | Header `X-Api-Key` |
| SerpApi (`serpapi`) | Free 250/mo, plans from $75/mo | City | Yes | Yes | Query `api_key` |
| SearchApi (`searchapi`) | Plans from $40/mo | City | Yes | Yes | Query `api_key` |
| ValueSerp (`valueserp`) | Pay-as-you-go, 10,000 for $25 | City | Yes | Yes | Query `api_key` |
| Serper (`serper`) | Credit-based, 50,000 for $50 | Country | No | No | Query `apiKey` |
| HasData (`hasdata`) | Free 1,000/mo, plans from $49/mo | City | Yes | Yes | Header `x-api-key` |
| CrazySERP (`crazyserp`) | Pay-as-you-go | City | Yes | Yes | Header `Authorization: Bearer` |
| PrismCrawl (`prismcrawl`) | 100 free credits, packages from $5 (about $0.21 per 1,000, valid 90 days) | City | Yes | Yes | Header `x-api-key` (POST JSON) |
| DataForSEO (`dataforseo`) | Pay-as-you-go, $50 minimum top-up | City | Yes | Yes | HTTP Basic, `login:password` in the API key field |

\*Pricing is indicative. Check each vendor before buying. The request formats are implemented in [`scrapers/services`](https://github.com/djav1985/v-serpbear/tree/main/scrapers/services).

Each page request asks for 10 results. The scrape strategy below sets how many pages are fetched. For country-only providers (Serper, Serply) the city and state fields are disabled and show `N/A`.

## Scrape strategy

Google's removal of `num=100` limits SERP APIs to 10 results per request. The strategy sets how many pages are fetched per keyword, trading API credits against depth.

| Strategy | Behaviour | Requests per keyword |
| --- | --- | --- |
| **Basic** (default) | Page 1 only (positions 1–10). | 1 |
| **Custom** | Pages 1 to N, where N is 1–10 (default 5). Fetching stops early once the domain is found, or when a page is empty or fails. | 1 to N |

- **Globally:** **Settings → Scraper → Scrape Strategy**. Choosing Custom shows a page-count selector.
- **Per domain:** the domain's **Scraper** tab, **Scrape Strategy Override**. Any value other than **Use Global Setting** enables the domain controls.
- **Failed pages:** if a page request fails and the domain was not found on the pages that loaded, the keyword is reported as an error with the provider's message. It keeps its previous position and history rather than being recorded as "not ranked".

## Per-domain scrapers

![Scraper settings for a single domain](images/domain-settings-scraper.png)

A domain can use its own provider without changing the global default. Open the domain, switch to the **Scraper** tab, pick a provider (or **System Scraper** to inherit the global one) and enter its API key. Stored keys are encrypted. **Remove stored key** clears a domain's key on save.

A refresh uses the faster parallel path only when every keyword in the run uses SerpApi or SearchApi. See `PARALLEL_REFRESH_CONCURRENCY` and `PARALLEL_SCRAPE_CONCURRENCY` in [Configuration](Configuration).

**Serper.** Serper has no mobile option. In a refresh, a mobile keyword with a matching desktop keyword (same domain, keyword, country and location) in the same run is not scraped. It takes the desktop keyword's result, so no extra request is made. A mobile keyword with no matching desktop keyword is scraped with desktop results, and a warning is logged for it.

## Real links for Google redirects

Some providers return `google.com/goto` links instead of the real page address, so your domain would not match. Set `SERPER_API_KEY` (a free [Serper](https://serper.dev) key) and these links are resolved through Serper's `/resolve` endpoint, for every provider. Details are in [Configuration](Configuration).
