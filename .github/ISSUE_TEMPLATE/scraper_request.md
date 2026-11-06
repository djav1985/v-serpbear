---
name: Scraper request
about: Ask for a new SERP data provider to be added as a scraper
title: 'Scraper request: '
labels: ''
assignees: ''

---

**Provider name and website**
The name of the service and a link to its home page.

**Link to the API documentation**
A link to the search / SERP API reference (the page that lists the request parameters and the response).

**Pricing**
Free tier, price per request or per credit, and any minimum top-up. Include a link to the pricing page.

**Authentication**
How the API key is sent: a header (which one), a query parameter (which one), or something else.

**Rate limits**
Requests per minute or per day, if the provider documents them.

**What the API supports**
- [ ] Country targeting (`gl`, `location`, ...)
- [ ] City / precise location targeting
- [ ] Map pack (local pack) results
- [ ] Mobile and desktop results
- [ ] Paging (how: page number, result offset, ...)

**Example request**
The full request you made, with the URL, the method, the headers and the body (if any). **Remove your API key before posting.**

```
curl "https://..." \
  -H "..."
```

**Full example response**
A complete, unedited response for a real query, as JSON. Do not shorten it: the field names, the order of the results and any error or empty-result shape all matter. Remove any API key that the provider echoes back.

```json

```

**Example of an error response (optional)**
What the API returns for a bad key, an exhausted quota or a rate limit (status code and body).

**Additional context**
Anything else that helps: why you want this provider, quirks you found, a free trial key you can share, and so on.
