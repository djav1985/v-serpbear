# Keyword Tracking

## Workflow

1. **Add a domain** with the host name to monitor.
2. **Add keywords** with the query, country, optional state and city, and device (desktop or mobile).
3. **Scrape.** The cron worker (or **Refresh**) asks your provider for results and stores positions, using the [scrape strategy](Scrapers#scrape-strategy).
4. **Analyse.** Charts and tables show history, average position and day-over-day change.
5. **Share** through the [API and MCP server](API-and-MCP) or [email digests](Email-Digests).

The domain list shows a screenshot of each tracked website. The server fetches it from thum.io (so the domain names are sent to that service, not by your browser), saves it in `data/thumbnails` as `<domain>_<YYYY-MM-DD>.jpg` and serves the same image to every browser. A domain without a thumbnail starts generating when the list is opened or when the domain is added, and one older than 30 days is regenerated while the old image keeps showing, then deleted once the new one is saved. Until a thumbnail exists the site's favicon is shown, and the page does not poll: new thumbnails appear on the next reload or navigation. A site that cannot be captured is not retried for an hour. The reload button on a thumbnail regenerates it now. There is no setting to turn screenshots off.

## Adding keywords

Discover and Ideas share one add-to-tracker bar with a Desktop/Mobile toggle, tags and a location picker. Keywords that are already tracked are skipped. The Tracking tab can change the location of many keywords at once.

If your scraper is country-only (Serper, Serply, TinyFish or Jina AI), the city and state fields are disabled and show `N/A`, and a keyword's stored city and state are hidden. See [Scrapers](Scrapers).

## Keyword details panel

Click a keyword row for the SERP snapshot, the rank-history chart and the local results.

- **Not found:** the badge reads `Not in First N`, where N is the number of results actually scraped, or `No Results` when nothing was scraped.
- **Map pack:** a "MAP" badge sits under the country flag in the dashboard, the details and email digests. It turns red while the keyword is out of the map pack after having been in it (for up to 30 days). The domains overview shows a Map Pack counter. See [Average Position and Map Pack](Average-Position-and-Map-Pack).

## CSV export

**Export as csv** in the domain header downloads `<domain>-keywords_serp.csv` with the columns `ID`, `Keyword`, `Map Pack`, `Position`, `URL`, `Country`, `Location`, `Device`, `Updated`, `Added` and `Tags`.

- **Map Pack:** `0` when not in the top three, `1`–`3` for its spot, and empty when it is in the top three but no spot is known.
- **Position:** `-` when the keyword is unranked.
- Text cells that start with `=`, `+`, `-` or `@` get a leading apostrophe so spreadsheet apps read them as text.
