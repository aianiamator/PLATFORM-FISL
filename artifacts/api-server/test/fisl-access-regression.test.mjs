import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import http from "node:http";

import { eq, sql } from "drizzle-orm";
import {
  coursesTable,
  db,
  lessonsTable,
  membershipRevocationsTable,
  membersTable,
  paymentRequestsTable,
  pool,
  subscriptionsTable,
} from "../../../lib/db/src/index.ts";

const identities = new Map();

mock.module("@clerk/express", {
  namedExports: {
    clerkClient: {
      users: {
        async getUser(userId) {
          const profile = identities.get(userId);
          const email = profile?.email ?? `${userId.replace(/[^a-z0-9]/gi, "")}@example.com`;
          return {
            firstName: profile?.firstName ?? "Regression",
            lastName: profile?.lastName ?? "Tester",
            username: userId,
            primaryEmailAddress: { emailAddress: email },
            emailAddresses: [{ emailAddress: email }],
          };
        },
      },
    },
    getAuth(req) {
      const value = req.headers["x-test-user-id"];
      return { userId: typeof value === "string" ? value : null };
    },
    clerkMiddleware() {
      return (_req, _res, next) => next();
    },
  },
});

const { default: app } = await import("../src/app.ts");

let server;
let baseUrl;
let fixtureNumber = 0;
const fixturePrefixes = new Set();
const originalAdminId = process.env.FISL_ADMIN_CLERK_USER_ID;
const originalAdminEmail = process.env.FISL_ADMIN_EMAIL;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const prefix of fixturePrefixes) {
    await cleanupFixture(prefix);
  }
  if (originalAdminId === undefined) delete process.env.FISL_ADMIN_CLERK_USER_ID;
  else process.env.FISL_ADMIN_CLERK_USER_ID = originalAdminId;
  if (originalAdminEmail === undefined) delete process.env.FISL_ADMIN_EMAIL;
  else process.env.FISL_ADMIN_EMAIL = originalAdminEmail;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

function newFixture(label) {
  const prefix = `fisl-regression-${label}-${process.pid}-${++fixtureNumber}`;
  fixturePrefixes.add(prefix);
  return prefix;
}

function setConfiguredAdmin(userId) {
  process.env.FISL_ADMIN_CLERK_USER_ID = userId;
  delete process.env.FISL_ADMIN_EMAIL;
}

function rememberIdentity(userId, email = `${userId}@example.com`) {
  identities.set(userId, { email });
}

async function cleanupFixture(prefix) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM membership_revocations
      WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         OR revoked_by_member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
    `);
    await tx.execute(sql`
      DELETE FROM lesson_comments
      WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         OR lesson_id IN (SELECT id FROM lessons WHERE title LIKE ${prefix + "%"})
    `);
    await tx.execute(sql`
      DELETE FROM lesson_progress
      WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         OR lesson_id IN (SELECT id FROM lessons WHERE title LIKE ${prefix + "%"})
    `);
    await tx.execute(sql`
      DELETE FROM subscriptions
      WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         OR payment_request_id IN (
           SELECT id FROM payment_requests
           WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         )
    `);
    await tx.execute(sql`
      DELETE FROM payment_requests
      WHERE member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
         OR reviewed_by_member_id IN (SELECT id FROM members WHERE clerk_user_id LIKE ${prefix + "%"})
    `);
    await tx.execute(sql`
      DELETE FROM lessons
      WHERE title LIKE ${prefix + "%"}
    `);
    await tx.execute(sql`
      DELETE FROM courses
      WHERE title LIKE ${prefix + "%"}
    `);
    await tx.execute(sql`
      DELETE FROM members
      WHERE clerk_user_id LIKE ${prefix + "%"}
    `);
  });
}

async function createMember(prefix, {
  role = "member",
  accessStatus = "unpaid",
  clerkUserId = `${prefix}-user`,
} = {}) {
  rememberIdentity(clerkUserId);
  const [member] = await db.insert(membersTable).values({
    clerkUserId,
    name: "Regression Tester",
    email: `${clerkUserId}@example.com`,
    role,
    accessStatus,
  }).returning();
  return member;
}

async function createCourseWithLessons(prefix, statuses = ["published"]) {
  const [course] = await db.insert(coursesTable).values({
    title: prefix,
    eyebrow: "REGRESSION FIXTURE",
    description: "A course used only by authorization regression tests.",
  }).returning();
  const lessons = await db.insert(lessonsTable).values(statuses.map((status, index) => ({
    courseId: course.id,
    title: `${prefix}-${status}-${index + 1}`,
    module: "Regression",
    description: "Fixture lesson metadata",
    body: "Fixture lesson body",
    durationMinutes: 10,
    order: index + 1,
    status,
  }))).returning();
  return { course, lessons };
}

async function createPayment(memberId, {
  status = "pending",
  reference,
} = {}) {
  const [payment] = await db.insert(paymentRequestsTable).values({
    memberId,
    plan: "month",
    amountPence: 500,
    currency: "GBP",
    paidAt: new Date("2026-08-01T12:00:00.000Z"),
    reference,
    status,
  }).returning();
  return payment;
}

async function createSubscription(memberId, paymentRequestId, {
  status = "active",
  endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
} = {}) {
  const [subscription] = await db.insert(subscriptionsTable).values({
    memberId,
    paymentRequestId,
    plan: "month",
    status,
    startsAt: new Date(Date.now() - 60 * 60 * 1000),
    endsAt,
  }).returning();
  return subscription;
}

async function request(userId, path, {
  method = "GET",
  body,
  headers = {},
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-user-id": userId,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

test("simultaneous first-account requests bootstrap only one configured admin", async () => {
  const prefix = newFixture("first-account");
  const adminUserId = `${prefix}-admin`;
  const memberUserId = `${prefix}-member`;
  rememberIdentity(adminUserId);
  rememberIdentity(memberUserId);
  setConfiguredAdmin(adminUserId);

  const responses = await Promise.all([
    request(adminUserId, "/api/me"),
    request(memberUserId, "/api/me"),
    request(adminUserId, "/api/me"),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
  assert.deepEqual(responses.map((response) => response.body.role), ["admin", "member", "admin"]);

  const members = await db.select().from(membersTable)
    .where(sql`${membersTable.clerkUserId} LIKE ${prefix + "%"}`);
  assert.equal(members.length, 2);
  assert.equal(members.filter((member) => member.role === "admin").length, 1);
  assert.equal(members.find((member) => member.clerkUserId === memberUserId)?.role, "member");
});

test("concurrent approvals of one payment create exactly one subscription", async () => {
  const prefix = newFixture("approval-race");
  const adminUserId = `${prefix}-admin`;
  const targetUserId = `${prefix}-member`;
  const admin = await createMember(prefix, {
    role: "admin",
    accessStatus: "active",
    clerkUserId: adminUserId,
  });
  const member = await createMember(prefix, {
    clerkUserId: targetUserId,
  });
  const payment = await createPayment(member.id, { reference: `${prefix}-payment` });

  const responses = await Promise.all([
    request(adminUserId, `/api/admin/payment-requests/${payment.id}`, {
      method: "PATCH",
      body: { status: "approved" },
    }),
    request(adminUserId, `/api/admin/payment-requests/${payment.id}`, {
      method: "PATCH",
      body: { status: "approved" },
    }),
  ]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);

  const subscriptions = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.paymentRequestId, payment.id));
  assert.equal(subscriptions.length, 1);

  const [updatedPayment] = await db.select().from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.id, payment.id));
  assert.equal(updatedPayment.status, "approved");

  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  assert.equal(updatedMember.accessStatus, "active");
  assert.equal(admin.role, "admin");
});

test("expired subscriptions lose pathway, lesson, comment, and community access", async () => {
  const prefix = newFixture("expired-access");
  const userId = `${prefix}-member`;
  const member = await createMember(prefix, {
    clerkUserId: userId,
    accessStatus: "active",
  });
  const { lessons } = await createCourseWithLessons(prefix);
  const payment = await createPayment(member.id, { status: "approved", reference: `${prefix}-payment` });
  await createSubscription(member.id, payment.id, { endsAt: new Date(Date.now() - 1000) });

  const responses = await Promise.all([
    request(userId, "/api/pathway"),
    request(userId, `/api/lessons/${lessons[0].id}`),
    request(userId, `/api/lessons/${lessons[0].id}/playback`),
    request(userId, `/api/lessons/${lessons[0].id}/comments`),
    request(userId, "/api/discussion"),
    request(userId, `/api/lessons/${lessons[0].id}/comments`, {
      method: "POST",
      body: { content: "This must not be saved." },
    }),
    request(userId, "/api/discussion", {
      method: "POST",
      body: { title: "This must not be saved", content: "This must not be saved." },
    }),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 403, 403, 403, 403]);
  for (const response of responses) {
    assert.equal(response.body.error, "An active membership is required");
  }

  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  assert.equal(updatedMember.accessStatus, "expired");
});

test("revoked subscriptions lose pathway, lesson, comment, and community access", async () => {
  const prefix = newFixture("revoked-access");
  const userId = `${prefix}-member`;
  const member = await createMember(prefix, {
    clerkUserId: userId,
    accessStatus: "active",
  });
  const { lessons } = await createCourseWithLessons(prefix);
  const payment = await createPayment(member.id, { status: "approved", reference: `${prefix}-payment` });
  await createSubscription(member.id, payment.id, {
    status: "inactive",
    endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const responses = await Promise.all([
    request(userId, "/api/pathway"),
    request(userId, `/api/lessons/${lessons[0].id}`),
    request(userId, `/api/lessons/${lessons[0].id}/playback`),
    request(userId, `/api/lessons/${lessons[0].id}/comments`),
    request(userId, "/api/discussion"),
    request(userId, `/api/lessons/${lessons[0].id}/comments`, {
      method: "POST",
      body: { content: "This must not be saved." },
    }),
    request(userId, "/api/discussion", {
      method: "POST",
      body: { title: "This must not be saved", content: "This must not be saved." },
    }),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 403, 403, 403, 403]);
  for (const response of responses) {
    assert.equal(response.body.error, "An active membership is required");
  }

  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  assert.equal(updatedMember.accessStatus, "expired");
});

test("admins can review the full revoke and reactivate history while members cannot", async () => {
  const prefix = newFixture("admin-revoke");
  const adminUserId = `${prefix}-admin`;
  const memberUserId = `${prefix}-member`;
  await createMember(prefix, {
    role: "admin",
    accessStatus: "active",
    clerkUserId: adminUserId,
  });
  const member = await createMember(prefix, {
    clerkUserId: memberUserId,
    accessStatus: "active",
  });
  const { lessons } = await createCourseWithLessons(prefix);
  const payment = await createPayment(member.id, {
    status: "approved",
    reference: `${prefix}-payment`,
  });
  const subscription = await createSubscription(member.id, payment.id);

  const memberList = await request(adminUserId, "/api/admin/members");
  assert.equal(memberList.status, 200);
  const listedMember = memberList.body.find((row) => row.id === member.id);
  assert.equal(listedMember.accessStatus, "active");
  assert.equal(listedMember.currentSubscription.id, subscription.id);
  assert.equal(listedMember.currentSubscription.status, "active");

  const emptyHistory = await request(adminUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(emptyHistory.status, 200);
  assert.deepEqual(emptyHistory.body, []);

  const memberHistoryAttempt = await request(memberUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(memberHistoryAttempt.status, 403);

  const memberAttempt = await request(memberUserId, `/api/admin/members/${member.id}/revoke`, {
    method: "POST",
  });
  assert.equal(memberAttempt.status, 403);

  const revoked = await request(adminUserId, `/api/admin/members/${member.id}/revoke`, {
    method: "POST",
    body: { reason: "Payment arrangement ended" },
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.id, member.id);
  assert.equal(revoked.body.accessStatus, "expired");
  assert.equal(revoked.body.currentSubscription.id, subscription.id);
  assert.equal(revoked.body.currentSubscription.status, "inactive");
  assert.equal(revoked.body.latestRevocation.reason, "Payment arrangement ended");
  assert.equal(revoked.body.latestRevocation.revokedBy.name, "Regression Tester");
  assert.ok(revoked.body.latestRevocation.revokedAt);

  const [updatedSubscription] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscription.id));
  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  assert.equal(updatedSubscription.status, "inactive");
  assert.equal(updatedMember.accessStatus, "expired");
  const [revocation] = await db.select().from(membershipRevocationsTable)
    .where(eq(membershipRevocationsTable.memberId, member.id));
  assert.equal(revocation.revokedByMemberId, (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, adminUserId)))[0].id);
  assert.equal(revocation.action, "revoked");
  assert.equal(revocation.reason, "Payment arrangement ended");

  const firstHistory = await request(adminUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(firstHistory.status, 200);
  assert.equal(firstHistory.body.length, 1);
  assert.equal(firstHistory.body[0].action, "revoked");
  assert.equal(firstHistory.body[0].reason, "Payment arrangement ended");
  assert.equal(firstHistory.body[0].changedBy.name, "Regression Tester");
  assert.ok(firstHistory.body[0].changedAt);

  const memberProfile = await request(memberUserId, "/api/me");
  assert.equal(memberProfile.status, 200);
  assert.equal("latestRevocation" in memberProfile.body, false);
  assert.equal(JSON.stringify(memberProfile.body).includes("Payment arrangement ended"), false);

  const responses = await Promise.all([
    request(memberUserId, "/api/pathway"),
    request(memberUserId, `/api/lessons/${lessons[0].id}`),
    request(memberUserId, `/api/lessons/${lessons[0].id}/playback`),
    request(memberUserId, `/api/lessons/${lessons[0].id}/comments`),
    request(memberUserId, "/api/discussion"),
    request(memberUserId, `/api/lessons/${lessons[0].id}/comments`, {
      method: "POST",
      body: { content: "This must not be saved." },
    }),
    request(memberUserId, "/api/discussion", {
      method: "POST",
      body: { title: "This must not be saved", content: "This must not be saved." },
    }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 403, 403, 403, 403]);
  for (const response of responses) {
    assert.equal(response.body.error, "An active membership is required");
  }

  const restorationPayment = await createPayment(member.id, {
    reference: `${prefix}-restoration-payment`,
  });
  const reactivated = await request(adminUserId, `/api/admin/payment-requests/${restorationPayment.id}`, {
    method: "PATCH",
    body: { status: "approved", reviewNote: "Payment confirmed after support review" },
  });
  assert.equal(reactivated.status, 200);

  const restoredHistory = await request(adminUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(restoredHistory.status, 200);
  assert.deepEqual(restoredHistory.body.map((change) => change.action), ["reactivated", "revoked"]);
  assert.equal(restoredHistory.body[0].reason, "Payment confirmed after support review");

  const revokedAgain = await request(adminUserId, `/api/admin/members/${member.id}/revoke`, {
    method: "POST",
    body: { reason: "Second support review" },
  });
  assert.equal(revokedAgain.status, 200);

  const completeHistory = await request(adminUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(completeHistory.status, 200);
  assert.deepEqual(completeHistory.body.map((change) => change.action), ["revoked", "reactivated", "revoked"]);
  assert.deepEqual(completeHistory.body.map((change) => change.reason), [
    "Second support review",
    "Payment confirmed after support review",
    "Payment arrangement ended",
  ]);
});

test("concurrent revocation and restoration leave access consistent with the terminal audit event", async () => {
  const prefix = newFixture("access-history-race");
  const adminUserId = `${prefix}-admin`;
  const admin = await createMember(prefix, {
    role: "admin",
    accessStatus: "active",
    clerkUserId: adminUserId,
  });
  const member = await createMember(prefix, {
    clerkUserId: `${prefix}-member`,
    accessStatus: "active",
  });
  const activePayment = await createPayment(member.id, {
    status: "approved",
    reference: `${prefix}-active-payment`,
  });
  await createSubscription(member.id, activePayment.id);
  await db.insert(membershipRevocationsTable).values({
    memberId: member.id,
    revokedByMemberId: admin.id,
    action: "revoked",
    reason: "Historical revocation",
  });
  const restorationPayment = await createPayment(member.id, {
    reference: `${prefix}-restoration-payment`,
  });

  const [revocation, restoration] = await Promise.all([
    request(adminUserId, `/api/admin/members/${member.id}/revoke`, {
      method: "POST",
      body: { reason: "Concurrent revocation" },
    }),
    request(adminUserId, `/api/admin/payment-requests/${restorationPayment.id}`, {
      method: "PATCH",
      body: { status: "approved", reviewNote: "Concurrent restoration" },
    }),
  ]);
  assert.equal(revocation.status, 200);
  assert.equal(restoration.status, 200);

  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  const history = await request(adminUserId, `/api/admin/members/${member.id}/access-history`);
  assert.equal(history.status, 200);
  assert.ok(history.body.length >= 2);
  assert.equal(
    history.body[0].action,
    updatedMember.accessStatus === "active" ? "reactivated" : "revoked",
  );
});

test("rejecting an old payment preserves a different valid subscription", async () => {
  const prefix = newFixture("reject-old-payment");
  const adminUserId = `${prefix}-admin`;
  const member = await createMember(prefix, {
    clerkUserId: `${prefix}-member`,
    accessStatus: "active",
  });
  await createMember(prefix, {
    role: "admin",
    accessStatus: "active",
    clerkUserId: adminUserId,
  });
  const validPayment = await createPayment(member.id, {
    status: "approved",
    reference: `${prefix}-valid`,
  });
  await createSubscription(member.id, validPayment.id);
  const oldPayment = await createPayment(member.id, { reference: `${prefix}-old` });

  const response = await request(adminUserId, `/api/admin/payment-requests/${oldPayment.id}`, {
    method: "PATCH",
    body: { status: "rejected", reviewNote: "Old duplicate payment" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "rejected");

  const [updatedMember] = await db.select().from(membersTable)
    .where(eq(membersTable.id, member.id));
  assert.equal(updatedMember.accessStatus, "active");

  const subscriptions = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.memberId, member.id));
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].paymentRequestId, validPayment.id);
});

test("unpaid members cannot enumerate draft or published lesson metadata", async () => {
  const prefix = newFixture("unpaid-metadata");
  const userId = `${prefix}-member`;
  await createMember(prefix, { clerkUserId: userId });
  const { lessons } = await createCourseWithLessons(prefix, ["draft", "published"]);

  const [pathway, draft, published] = await Promise.all([
    request(userId, "/api/pathway"),
    request(userId, `/api/lessons/${lessons[0].id}`),
    request(userId, `/api/lessons/${lessons[1].id}`),
  ]);

  assert.deepEqual([pathway.status, draft.status, published.status], [403, 403, 403]);
  assert.equal(pathway.body.error, "An active membership is required");
  assert.equal(draft.body.error, "An active membership is required");
  assert.equal(published.body.error, "An active membership is required");
  assert.equal(JSON.stringify(pathway.body).includes(prefix), false);
  assert.equal(JSON.stringify(draft.body).includes(prefix), false);
  assert.equal(JSON.stringify(published.body).includes(prefix), false);
});

test("spoofed forwarded hosts cannot authorize hostile cross-origin writes", async () => {
  const response = await request("origin-spoof-user", "/api/discussion", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
    },
    body: { title: "Cross-origin write", content: "This must be rejected before authentication." },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Untrusted request origin");

  const preflight = await fetch(`${baseUrl}/api/discussion`, {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "x-forwarded-host": "evil.example",
    },
  });
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
});

test("payment claims reject reused references, duplicate pending requests, and future dates", async () => {
  const prefix = newFixture("payment-replay");
  const firstUserId = `${prefix}-first`;
  const secondUserId = `${prefix}-second`;
  const thirdUserId = `${prefix}-third`;
  await Promise.all([
    createMember(prefix, { clerkUserId: firstUserId }),
    createMember(prefix, { clerkUserId: secondUserId }),
    createMember(prefix, { clerkUserId: thirdUserId }),
  ]);
  const body = {
    plan: "month",
    amountPence: 500,
    paidAt: new Date().toISOString(),
    reference: `${prefix} unique transfer`,
  };

  const first = await request(firstUserId, "/api/payment-requests", { method: "POST", body });
  const replay = await request(secondUserId, "/api/payment-requests", {
    method: "POST",
    body: { ...body, reference: `  ${prefix}   UNIQUE transfer  ` },
  });
  const duplicatePending = await request(firstUserId, "/api/payment-requests", {
    method: "POST",
    body: { ...body, reference: `${prefix} another transfer` },
  });
  const future = await request(thirdUserId, "/api/payment-requests", {
    method: "POST",
    body: {
      ...body,
      reference: `${prefix} future transfer`,
      paidAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    },
  });

  assert.equal(first.status, 201);
  assert.equal(replay.status, 409);
  assert.equal(duplicatePending.status, 409);
  assert.equal(future.status, 400);
});

test("active members cannot interact with draft lessons by guessing IDs", async () => {
  const prefix = newFixture("draft-idor");
  const userId = `${prefix}-member`;
  const member = await createMember(prefix, { clerkUserId: userId, accessStatus: "active" });
  const payment = await createPayment(member.id, {
    status: "approved",
    reference: `${prefix}-approved`,
  });
  await createSubscription(member.id, payment.id);
  const { lessons } = await createCourseWithLessons(prefix, ["draft"]);
  const lessonId = lessons[0].id;

  const responses = await Promise.all([
    request(userId, `/api/lessons/${lessonId}/comments`),
    request(userId, `/api/lessons/${lessonId}/comments`, {
      method: "POST",
      body: { content: "This draft must remain inaccessible." },
    }),
    request(userId, `/api/lessons/${lessonId}/progress`, {
      method: "PUT",
      body: { completed: true },
    }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [404, 404, 404]);
});