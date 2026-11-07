# Seed data

`<host>-<from>-<to>.json` (e.g. `discuss-pixls-us-2026-10-05-2026-11-02.json`) holds the raw topics and posts of [discuss.pixls.us](https://discuss.pixls.us)
for one ingestion window, written by `pnpm seed:export`. The app loads the newest one at boot when the
database has no posts.

The content is by the pixls.us community and licensed
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Each post's author is its
`username`, and each post links back to the original via `url`. It is redistributed here, unmodified,
for a non-commercial demo. The same license applies to this folder.
