# Data sources for Community Voices

Researched 2026-11-06. All live measurements were taken 2026-11-06 around 22:50 UTC, with no accounts and no credentials.

**Question.** Which online community gives us about a week of posts and comments that a reviewer can ingest with `docker compose up` and one LLM API key, so with no extra credentials? The source also needs terms that allow storing, embedding and passing the content to an LLM for a non-commercial take-home demo, a stable API, and a weekly volume that fits in Postgres/pgvector or can be sampled. A committed seed dataset is the fallback if live ingestion fails. Each claim below links to a primary source (official docs, terms, or a first-party API response). Secondary sources are labeled as such.

## Summary

| Source | Auth | Rate limit | Terms fit | Weekly volume (measured) | Reviewer setup |
|---|---|---|---|---|---|
| **Discourse: discuss.pixls.us** | None for public reads | 200 req/min and 50 req/10 s per IP (Discourse default; each forum can change it) | **Good.** Content is CC BY-NC-SA 4.0 and the ToS has no automation clause | 1,202 posts / 58 new topics, about 146k tokens | None |
| **Hacker News (Algolia)** | None | 10,000 req/hour per IP | **Ambiguous.** HN's official API has no terms; YC's site terms ban scraping and commercial use | 7,053 stories + about 70k comments, about 6M tokens (top 30 stories: about 1.0M) | None |
| Discourse: forum.godotengine.org | None | Same as Discourse default | **Poor.** Its ToS says "You may not automate access to the forum" | 782 posts / 137 topics, about 134k tokens | None |
| Stack Exchange (Worldbuilding) | None (no key: 300/day per IP) | 300/day without a key, 10,000/day with one, max 30 req/s per IP | Good (CC BY-SA, attribution required) | 10 Q + 30 A + 152 comments, very small | None |
| Bluesky (hashtag search) | Documented as none; in practice pagination returned 403 | 3,000 per 5 min per IP (PDS); AppView documented as "generous" | OK. No AI clause; deletion handling required | #worldbuilding: about 520 posts/week (extrapolated) | None, but only one page of results |
| Mastodon (hashtag timeline) | None unless the instance disables it | 300 per 5 min per IP | Per-instance terms; not checked | #gamedev on mastodon.social: about 1,350/week (extrapolated) | None |
| Reddit | OAuth, plus approval since Nov 2025 | 100 QPM per client (secondary source) | **Poor.** The Data API terms restrict AI/ML use | Not measurable without auth | Reddit app approval plus credentials |
| Discord | Bot token; a server admin must add the bot | n/a | **Poor.** Developer Policy bans AI training on message content | n/a | Bot, invite, and privileged intent |
| Lobste.rs | None | n/a | **Poor.** robots.txt has `Disallow: /` and `Content-Signal: ai-input=no` | 168 stories + 1,384 comments | n/a (dropped) |
| GitHub Discussions | Token required | n/a | n/a | n/a | PAT needed (dropped) |

## 1. Discourse public forums

**Access.**
- Discourse's official API docs say "Some endpoints do not require any authentication" and that JSON endpoints mirror the HTML pages ([docs.discourse.org](https://docs.discourse.org/), from its [openapi.json](https://docs.discourse.org/openapi.json) `info.description`).
- Useful endpoints in the official spec:
  - `GET /posts.json?before={id}`: "List latest posts across topics".
  - `GET /latest.json` (params `order`, `ascending`, `per_page`).
  - `GET /t/{id}.json`.
  - `GET /search.json?q=` ([openapi.json](https://docs.discourse.org/openapi.json)).
- `posts.json` returns the `raw` markdown of each post. Verified by response.

**Rate limits.**
- Defaults in core config: `max_reqs_per_ip_per_minute = 200`, `max_reqs_per_ip_per_10_seconds = 50`, `max_reqs_per_ip_mode = block` ([discourse_defaults.conf](https://raw.githubusercontent.com/discourse/discourse/main/config/discourse_defaults.conf)).
- Meta documents the same: "number of requests per IP per minute (default is 200)" ([meta.discourse.org/t/78612](https://meta.discourse.org/t/available-settings-for-global-rate-limits-and-throttling/78612)).
- Each forum can override these. No forum publishes its actual values, so they are unverified per forum.

**Querying "the past 7 days".**
- Page `/posts.json?before=<min id>` backward until `created_at` is older than 7 days.
- Group posts by `topic_id`. A post with `post_number == 1` is the opening post of a topic.
- `/search.json` supports `after:YYYY-MM-DD`, but robots.txt disallows `/search` on all three forums checked. Avoid it.

**Measured volume.** Script: page `/posts.json` 50 posts at a time, 1 s sleep, stop at the 7-day cutoff, sum `len(raw)`.

```
forum.godotengine.org  requests 16  posts 782   new_topics 137  topics_touched 190  chars 535,950  tokens~134k
forum.defold.com       requests 2   posts 70    new_topics 18   topics_touched 31   chars 52,766   tokens~13k
discuss.pixls.us       requests 25  posts 1202  new_topics 58   topics_touched 120  chars 582,185  tokens~146k
```

- Cross-check with `GET /about.json` → `stats.posts_7_days`: Godot 1,120 posts / 137 topics; pixls 1,484 posts / 58 topics.
- `posts.json` returns fewer posts than the `about.json` stat. The cause is unverified; it may be PMs, whispers or deleted posts counted in the stat.
- The posts for a week fit in about 25 requests, well under the rate limit.

**Terms and robots (checked per forum).**

discuss.pixls.us (open-source photography: darktable, RawTherapee, "Processing" and "Software" are its busiest categories):
- ToS §3: "User contributions are licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 Unported License." The ToS was last updated May 31, 2013. It has no clause on scraping or automated access ([discuss.pixls.us/tos](https://discuss.pixls.us/tos)).
- robots.txt: `User-agent: *` disallows only `/admin/`, `/auth/`, `/search`, `/my`, `/badges`, `/g`, RSS and similar paths. `/posts.json` and `/t/` are not disallowed. `Disallow: /` applies only to named SEO bots ([robots.txt](https://discuss.pixls.us/robots.txt)).
- **Fit:** a non-commercial demo with attribution is compatible with CC BY-NC-SA. Committing a seed dataset counts as redistribution, so it needs attribution, an NC notice, and the same license on that data file.

forum.godotengine.org:
- ToS (2023-11-22): "You may not automate access to the forum, or monitor the forum." The only exception is crawling for a public search engine. Users own their content ([forum.godotengine.org/tos](https://forum.godotengine.org/tos)).
- This rules out an ingestion job unless the forum gives permission. The wording appears to be Discourse's stock ToS template, so other Discourse forums may carry the same ban. That is unverified; check each forum's `/tos`.

forum.defold.com:
- `/tos` redirects (302) to [defold.com/terms-and-conditions](https://defold.com/terms-and-conditions). Not reviewed.
- Its volume (70 posts/week) is too small anyway.

## 2. Hacker News

**Official Firebase API** ([github.com/HackerNews/API](https://github.com/HackerNews/API)).
- No auth. "There is currently no rate limit."
- Endpoints: `/v0/item/<id>.json`, `/v0/maxitem`, `/v0/updates`.
- No date query. You walk item IDs backward from `maxitem` (it was 50,399,573 at measurement time). One request per item means about 77k requests for a week.
- The page states no data license or terms. The repo's MIT license covers the code, and the README does not say it covers the data.

**Algolia HN Search API** ([hn.algolia.com/api](https://hn.algolia.com/api); the page is client-rendered, so these quotes come from its JS bundle).
- No auth.
- Rate limit: "We are limiting the number of API requests from a single IP to 10,000 per hour."
- Date filtering is documented: `search_by_date?tags=story&numericFilters=created_at_i>X,created_at_i<Y`.
- `GET /api/v1/items/{id}` returns a story with its full nested comment tree.
- First-party error: `"you can only fetch the 1000 hits for this query"`. Pagination stops at 1,000 hits, so a full week of comments has to be split into day-sized windows.

**Terms.** YC's Terms of Use say "you will not engage in or use any data mining, robots, scraping or similar data gathering or extraction methods" and bar use "for any commercial purposes" ([ycombinator.com/legal](https://www.ycombinator.com/legal/)).
- Those terms do not mention the API. HN publishes the official API itself, so using it is plausibly sanctioned. This is **ambiguous**: no document explicitly allows storing the content or feeding it to an LLM.
- Algolia's HN API has no terms page that I could find.
- news.ycombinator.com robots.txt sets `Crawl-delay: 30` ([robots.txt](https://news.ycombinator.com/robots.txt)).

**Measured volume.**

```
NOW=$(date +%s); WK=$((NOW-604800))
curl -s "https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i%3E$WK&hitsPerPage=1"
  → nbHits 7053 (exhaustiveNbHits true)
# comments, per-day windows (a single 7-day window returned a bogus non-exhaustive nbHits=32,253,888):
for d in 0..6: numericFilters=created_at_i>S,created_at_i<S+86400
  → 7922, 7744, 11650, 11126, 10395, 10189, 11214   (sum ≈ 70,240 comments)
# 1000-comment sample: mean comment_text length 347 chars (HTML)
stories with points>100 this week: 276 stories, 49,792 comments
top 30 stories by points, full trees via /items/{id}: 13,590 nodes, 4.0M chars ≈ 1.0M tokens
```

- Full week: about 70k comments × 347 chars ≈ 24M chars, about 6M tokens. Sampling is required.
- A practical slice is the top 30 to 50 stories by points with their comment trees, about 1 to 1.7M tokens.

## 3. Stack Exchange

**Access and limits** ([api.stackexchange.com/docs/throttle](https://api.stackexchange.com/docs/throttle)).
- Without an `access_token`, "the application shares an IP based quota with all other applications on that IP". A key raises the quota, "which by default is 10,000".
- "more than 30 requests a second" from an IP gets dropped.
- Clients must honor the `backoff` field.
- First-party response from `/2.3/info?site=worldbuilding` without a key: `quota_max 300`, so 300 requests/day per IP without a key.

**Terms.**
- The API Terms require that apps "visually indicate that the Stack Exchange Network is the source of the content" ([stackoverflow.com/legal/api-terms-of-use](https://stackoverflow.com/legal/api-terms-of-use)).
- User contributions are licensed under CC BY-SA (page footer).
- The API terms page says nothing about AI/LLM use. I did not review the network-wide ToS or Stack Overflow's "Responsible AI policy" link, so that is unverified.

**Measured volume** (`/2.3/{questions,answers,comments}?site=X&fromdate=$WK&todate=$NOW&filter=total`):
- worldbuilding: 10 Q, 30 A, 152 comments.
- gamedev: 2 Q, 2 A, 4 comments.
- Too small for a weekly "what the community talked about". **Not recommended.**

## 4. Bluesky / AT Protocol

**Access.**
- Official docs: `api.bsky.app` and `public.api.bsky.app` "do not support authentication". `public.api.bsky.app` is cached and is the host developers are asked to use for "public web" use cases. The docs call these services' limits "generous" ([Rate Limits](https://bsky.network/docs/rate-limits), [API Hosts and Auth](https://bsky.network/docs/api-directory)).
- PDS limit: 3,000 requests per 5 min per IP ([Rate Limits](https://bsky.network/docs/rate-limits)).

**Observed (first-party responses).**
- `public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=%23gamedev` → **403**.
- `api.bsky.app/.../searchPosts?q=%23worldbuilding&limit=100&sort=latest` → 200 with 100 posts.
- The same request with the returned `cursor` → **403 "Request forbidden by administrative rules"**.
- The `since` parameter returned 400 in every format I tried.
- So unauthenticated search gives one page only. A full week would need an authenticated session, which is a reviewer credential. The other route is Jetstream/firehose replay, which needs no auth but means filtering the whole network; not evaluated.

**Volume.** #worldbuilding: 100 posts covered 32.3 h, so about 520 posts/week extrapolated. These are mostly one-off showcase posts, not threaded discussion.

**Terms.**
- The [Developer Guidelines](https://bsky.network/docs/developer-guidelines) require "a method for deleting content a user has requested to be deleted", plus report and block mechanisms for apps with user-generated content.
- The Bluesky [ToS](https://bsky.social/about/support/tos) (updated 14 Aug 2025) has no AI/ML clause.
- **Fit:** weak, because there is no community boundary (just a hashtag) and no unauthenticated pagination.

## 5. Mastodon

- `GET /api/v1/timelines/tag/:hashtag` is public unless the instance disables unauthenticated hashtag feeds. In that case it returns 401. Max `limit` 40; pagination via `max_id`/`min_id`/`since_id` ([docs](https://docs.joinmastodon.org/methods/timelines/)).
- Default rate limit: 300 calls per 5 min per IP ([docs](https://docs.joinmastodon.org/api/rate-limits/)).
- Confirmed by response headers on mastodon.social: `x-ratelimit-limit: 300`.
- Measured: `mastodon.social/api/v1/timelines/tag/gamedev?limit=40` returned 40 posts spanning 5.0 h, so about 1,350 posts/week extrapolated. That count is only what mastodon.social has federated.
- mastodon.social's terms page did not render through my fetch tool, so its terms are unverified.
- **Fit:** weak, for the same reasons as Bluesky (hashtag, not a community; broadcast-style posts).

## 6. Reddit (not recommended)

- **First-party evidence:** with a descriptive User-Agent and no auth, `https://www.reddit.com/r/{worldbuilding,gamedev,mapmaking,indiegaming,tango}/new.json` all returned **HTTP 403** (an HTML block page). `old.reddit.com` returned a 302.
- Reddit's [robots.txt](https://www.reddit.com/robots.txt) has `User-agent: * / Disallow: /` and points to its Public Content Policy.
- **Unauthenticated `.json` is not usable.**
- Reddit's primary policy pages were unreachable from this environment: support.reddithelp.com returned 403, and redditinc.com and developers.reddit.com were blocked by the fetch tool. Everything below is therefore **secondary** and should be confirmed:
  - The rate limit is reportedly 100 QPM per OAuth client ID, averaged over 10 min, and 10 QPM without OAuth (secondary: [apidog guide](https://apidog.com/blog/reddit-api-guide), and a 2023 r/redditdev staff post via a [mirror](https://lr.us.psf.lt/r/redditdev/comments/14nbw6g/updated_rate_limits_going_into_effect_over_the)).
  - As of 2025-11-11, the "Responsible Builder Policy" closed self-service API access. New apps need approval (secondary: r/redditdev announcement via a [mirror](https://r.datuan.dev/r/redditdev/comments/1oug31u/introducing_the_responsible_builder_policy_new/noh6fun)).
  - The Data API Terms bar "using User Content to train a machine learning or AI model without the express permission of rightsholders" (secondary: [The Decoder](https://the-decoder.com/reddit-ends-its-role-as-a-free-ai-training-data-goldmine/)). Primary URL to verify: https://redditinc.com/policies/data-api-terms.
- **Verdict:** each reviewer would need an approved Reddit app plus credentials, and the AI-use terms are restrictive. Use only if the project brief requires Reddit.

## 7. Discord (not recommended)

- Message content needs the `MESSAGE_CONTENT` privileged intent. Without it, apps "will receive empty values in fields that contain user-inputted content". Verified apps (required at 100+ guilds) must also get the intent approved ([Gateway docs](https://docs.discord.com/developers/events/gateway)).
- Only a user with "proper permissions" in a guild can add a bot via the `bot` scope ([OAuth2 docs](https://docs.discord.com/developers/topics/oauth2)). So you cannot read servers you don't administer without their admins adding your bot.
- The Developer Policy says: "Do not use message content obtained through the APIs to train machine learning or AI models (including large language models) unless express permission is granted by Discord" ([Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)). The page returned 403 to my fetch tool, so this quote comes from an official-domain search snippet.
- RAG isn't training, but the policy's spirit and the setup burden are both poor fits.
- **Reviewer burden:** a bot token, a server invite, and intent toggles. Unworkable for `docker compose up`.

## 8. Dropped

- **Lobste.rs:** `/newest/page/N.json` works without auth. Measured 168 stories + 1,384 comments in 7 days. But [robots.txt](https://lobste.rs/robots.txt) has `User-agent: * / Disallow: /` and `Content-Signal: ai-input=no, ai-train=no`, an explicit opt-out of LLM input.
- **GitHub Discussions:** the GraphQL API needs a token. An unauthenticated `POST https://api.github.com/graphql` returned 403. Requires a reviewer PAT.

## Recommendation

**Pick 1, and the best fit for zero reviewer credentials plus committed seed data: Discourse, using discuss.pixls.us.**
- No auth. About 25 requests per week of data, well within the 200/min default.
- About 1.2k posts and about 146k tokens: it fits easily in Postgres/pgvector, and a seed file is a few MB of JSON.
- Explicit CC BY-NC-SA 4.0 license, with no automation ban in its ToS.
- It is a real community with threaded discussion: photo editing workflows, software releases, and "Play Raw" edit challenges.
- **Tradeoffs:**
  - The topic is niche, so reviewers may not know it.
  - NC-SA obligations: attribute the forum and the authors, mark the seed data CC BY-NC-SA, and keep it non-commercial.
  - Its weekly volume is moderate, so the "prediction" has less signal than HN's.
  - Rate limits can be changed per site.
- The code should be generic over any Discourse host, so switching forums is a config change. Re-check `/tos` before switching; Godot's forum bans automation.

**Pick 2: Hacker News via the Algolia API.**
- No auth, 10k req/hour, native `created_at_i` filters, full comment trees via `/items/{id}`. Very stable, and well known to reviewers.
- Weekly volume is large (about 6M tokens), which gives strong trend signal.
- **Tradeoffs:**
  - You must sample, e.g. the top 30 to 50 stories by points (about 1 to 1.7M tokens).
  - It is a general tech audience, not a niche "community".
  - The terms are ambiguous: YC's site terms ban scraping and commercial use and say nothing about the API, and the API has no license. Committing a seed dataset of HN comments is a redistribution question that no document answers.
- **Community:** HN front page, meaning stories created in the last 7 days ranked by points.

## Open questions / unverified

- Reddit: the current Data API Terms, Developer Terms, rate limits and Responsible Builder Policy were not read at primary sources (blocked from this environment).
- Whether the actual rate limits on discuss.pixls.us differ from Discourse defaults. No response headers expose them.
- Why `posts.json` returns fewer posts than `about.json` reports in `posts_7_days` (1,202 vs 1,484 on pixls; 782 vs 1,120 on Godot).
- Whether the pixls ToS (2013) license clause covers content already in the forum's posts in every category. It is presumed sitewide.
- HN/Algolia: no explicit terms for API-data storage, redistribution or LLM use. The Algolia per-IP limit is documented only in the SPA bundle.
- Stack Exchange: the network ToS and Responsible AI policy were not reviewed for LLM-input restrictions.
- Bluesky: whether the 403 on `searchPosts` pagination is a deliberate unauthenticated-access policy or a transient anti-abuse rule. The docs don't mention it. Jetstream replay as a no-auth alternative was not evaluated.
- mastodon.social terms were not read.
- Token estimates use about 4 chars/token over raw markdown (Discourse) or HTML (HN). HN figures include HTML markup, so they are slight overestimates.
