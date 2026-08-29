import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateLessonBody,
  GetLessonPlaybackResponse,
  GetLessonResponse,
} from "../../../lib/api-zod/src/generated/api.ts";
import {
  createCloudflareStreamPlaybackToken,
  ensureCloudflareStreamVideoProtected,
  VideoProviderNotConfiguredError,
} from "../src/lib/cloudflareStream.ts";

const lesson = {
  id: 1,
  title: "Protected lesson",
  module: "Foundations",
  durationMinutes: 15,
  status: "published",
  order: 1,
  completed: false,
  description: "A protected lesson",
  body: "Lesson body",
};

test("lesson payloads identify protected video without exposing a playback URL", () => {
  const parsed = GetLessonResponse.parse({
    ...lesson,
    video: {
      provider: "cloudflare_stream",
      status: "protected",
    },
  });

  assert.equal("playbackUrl" in parsed.video, false);
});

test("lesson inputs accept a Cloudflare Stream UID but not a stored playback URL", () => {
  const valid = CreateLessonBody.safeParse({
    title: lesson.title,
    module: lesson.module,
    durationMinutes: lesson.durationMinutes,
    description: lesson.description,
    body: lesson.body,
    order: lesson.order,
    status: lesson.status,
    video: {
      provider: "cloudflare_stream",
      externalId: "0123456789abcdef0123456789abcdef",
    },
  });
  assert.equal(valid.success, true);

  const invalid = CreateLessonBody.safeParse({
    title: lesson.title,
    module: lesson.module,
    durationMinutes: lesson.durationMinutes,
    description: lesson.description,
    body: lesson.body,
    order: lesson.order,
    status: lesson.status,
    video: {
      provider: "cloudflare_stream",
      externalId: "0123456789abcdef0123456789abcdef",
      playbackUrl: "https://example.com/reusable-video",
    },
  });
  assert.equal(invalid.success, true);
  assert.equal("playbackUrl" in invalid.data.video, false);
});

test("Cloudflare playback handoffs are tokenized and expire within five minutes", async () => {
  const previous = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE,
    fetch: globalThis.fetch,
  };
  process.env.CLOUDFLARE_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "test";

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      success: true,
      result: { token: "short-lived-token" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const before = Date.now();
    const handoff = await createCloudflareStreamPlaybackToken("0123456789abcdef0123456789abcdef");
    const after = Date.now();

    assert.equal(
      handoff.playbackUrl,
      "https://customer-test.cloudflarestream.com/short-lived-token/iframe",
    );
    assert.ok(handoff.expiresAt.getTime() >= before + 299_000);
    assert.ok(handoff.expiresAt.getTime() <= after + 300_000);
    assert.match(request.url, /\/stream\/0123456789abcdef0123456789abcdef\/token$/);
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.Authorization, "Bearer test-token");
    assert.doesNotThrow(() => GetLessonPlaybackResponse.parse({
      provider: "cloudflare_stream",
      ...handoff,
    }));
  } finally {
    globalThis.fetch = previous.fetch;
    setOrDeleteEnv("CLOUDFLARE_ACCOUNT_ID", previous.accountId);
    setOrDeleteEnv("CLOUDFLARE_API_TOKEN", previous.apiToken);
    setOrDeleteEnv("CLOUDFLARE_STREAM_CUSTOMER_CODE", previous.customerCode);
  }
});

test("Cloudflare video associations enable signed-URL protection", async () => {
  const previous = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE,
    fetch: globalThis.fetch,
  };
  process.env.CLOUDFLARE_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = "test";

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await ensureCloudflareStreamVideoProtected("0123456789abcdef0123456789abcdef");
    assert.match(request.url, /\/stream\/0123456789abcdef0123456789abcdef$/);
    assert.equal(request.options.method, "POST");
    assert.deepEqual(JSON.parse(request.options.body), { requireSignedURLs: true });
  } finally {
    globalThis.fetch = previous.fetch;
    setOrDeleteEnv("CLOUDFLARE_ACCOUNT_ID", previous.accountId);
    setOrDeleteEnv("CLOUDFLARE_API_TOKEN", previous.apiToken);
    setOrDeleteEnv("CLOUDFLARE_STREAM_CUSTOMER_CODE", previous.customerCode);
  }
});

test("playback fails closed when Cloudflare Stream is not configured", async () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    await assert.rejects(
      () => createCloudflareStreamPlaybackToken("0123456789abcdef0123456789abcdef"),
      VideoProviderNotConfiguredError,
    );
  } finally {
    setOrDeleteEnv("CLOUDFLARE_API_TOKEN", previous);
  }
});

test("Cloudflare configuration rejects a non-account identifier", async () => {
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_ACCOUNT_ID = "not-a-cloudflare-account";
  try {
    await assert.rejects(
      () => createCloudflareStreamPlaybackToken("0123456789abcdef0123456789abcdef"),
      VideoProviderNotConfiguredError,
    );
  } finally {
    setOrDeleteEnv("CLOUDFLARE_ACCOUNT_ID", previous);
  }
});

function setOrDeleteEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}