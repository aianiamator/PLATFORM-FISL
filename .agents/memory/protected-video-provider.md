---
name: Protected video provider
description: Requirements for keeping FISL lesson playback behind member entitlements.
---

FISL lesson videos must use a provider that supports server-minted, expiring playback tokens. YouTube public or unlisted URLs are not suitable because anyone who obtains the URL can reuse it outside FISL.

**Why:** The product requirement is entitlement-checked playback, not merely hiding a video link in the lesson page.

**How to apply:** Keep raw provider URLs and identifiers out of member lesson payloads; mint playback only after the server verifies active membership.