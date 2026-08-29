---
name: Bulk GitHub imports
description: Reliable strategy for uploading a complete workspace through Replit's GitHub connector.
---

Use GitHub's batched commit mutation for bulk workspace imports through the Replit connector instead of issuing one REST blob or file request per project file. Initialize a completely empty repository with one real tracked file first.

**Why:** The connector proxy enforces a low requests-per-second ceiling, and many sequential blob requests can escalate from rate limiting to a temporary Cloudflare block. GitHub's Git database blob endpoint also rejects writes while the repository has zero commits.

**How to apply:** For future full-repository uploads through the connector, bootstrap an empty repository through the Contents API, then add tracked files in a small number of bounded `createCommitOnBranch` batches and verify the final recursive tree count.