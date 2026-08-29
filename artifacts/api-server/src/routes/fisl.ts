import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import {
  commentsTable,
  coursesTable,
  db,
  discussionPostsTable,
  lessonsTable,
  membershipRevocationsTable,
  membersTable,
  paymentRequestsTable,
  progressTable,
  subscriptionsTable,
  videosTable,
  type Member,
} from "@workspace/db";
import {
  CreateDiscussionPostBody,
  CreateDiscussionPostResponse,
  CreateLessonBody,
  CreateLessonCommentBody,
  CreateLessonCommentParams,
  CreateLessonCommentResponse,
  CreateLessonResponse,
  CreatePaymentRequestBody,
  CreatePaymentRequestResponse,
  GetAdminOverviewResponse,
  GetCurrentMemberResponse,
  GetLessonParams,
  GetLessonPlaybackParams,
  GetLessonPlaybackResponse,
  GetLessonVideoAssociationParams,
  GetLessonVideoAssociationResponse,
  GetLessonResponse,
  GetMembershipResponse,
  GetPathwayResponse,
  ListAdminMembersResponse,
  ListAdminMemberAccessHistoryResponse,
  ListAdminPaymentRequestsResponse,
  ListDiscussionPostsResponse,
  ListLessonCommentsParams,
  ListLessonCommentsResponse,
  ListPaymentRequestsResponse,
  ReviewPaymentRequestBody,
  ReviewPaymentRequestParams,
  ReviewPaymentRequestResponse,
  RevokeMemberSubscriptionBody,
  RevokeMemberSubscriptionParams,
  UpdateLessonBody,
  UpdateLessonParams,
  UpdateLessonProgressBody,
  UpdateLessonProgressParams,
  UpdateLessonProgressResponse,
  UpdateLessonResponse,
  RevokeMemberSubscriptionResponse,
} from "@workspace/api-zod";
import {
  createCloudflareStreamPlaybackToken,
  ensureCloudflareStreamVideoProtected,
  VideoProviderNotConfiguredError,
  VideoProviderRequestError,
} from "../lib/cloudflareStream";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();
const generalApiLimit = rateLimit({ name: "api", windowMs: 15 * 60_000, max: 500 });
const playbackLimit = rateLimit({ name: "playback", windowMs: 5 * 60_000, max: 20 });
const communityWriteLimit = rateLimit({ name: "community-write", windowMs: 60_000, max: 15 });
const paymentSubmissionLimit = rateLimit({ name: "payment-submit", windowMs: 60 * 60_000, max: 5 });
const adminWriteLimit = rateLimit({ name: "admin-write", windowMs: 60_000, max: 30 });
router.use(generalApiLimit);

type MemberLocals = { member: Member };

function memberDto(member: Member) {
  return {
    id: member.id,
    clerkUserId: member.clerkUserId,
    name: member.name,
    email: member.email,
    role: member.role,
    accessStatus: member.accessStatus,
    joinedAt: member.joinedAt,
  };
}

function sanitizeLessonBody(value: string): string {
  return value
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function normalizePaymentReference(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isAllowedRevolutHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "revolut.com" || host.endsWith(".revolut.com") || host === "revolut.me";
}

async function ensureMember(req: Request): Promise<Member | null> {
  const auth = getAuth(req);
  const userId = auth.userId;
  if (!userId) return null;

  const [existing] = await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1);
  if (existing) return existing;

  const user = await clerkClient.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Signed-in Clerk user does not have an email address");

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email.split("@")[0];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(701551)`);
    const [existingAfterLock] = await tx.select().from(membersTable)
      .where(eq(membersTable.clerkUserId, userId)).limit(1);
    if (existingAfterLock) return existingAfterLock;

    const configuredAdminIds = new Set(
      (process.env.FISL_ADMIN_CLERK_USER_ID ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const configuredAdminEmails = new Set(
      (process.env.FISL_ADMIN_EMAIL ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    const isConfiguredAdmin = configuredAdminIds.has(userId) || configuredAdminEmails.has(email.toLowerCase());
    const [created] = await tx.insert(membersTable).values({
      clerkUserId: userId,
      name,
      email,
      role: isConfiguredAdmin ? "admin" : "member",
      accessStatus: isConfiguredAdmin ? "active" : "unpaid",
    }).returning();
    return created;
  });
}

async function requireMember(req: Request, res: Response<unknown, MemberLocals>, next: NextFunction): Promise<void> {
  const member = await ensureMember(req);
  if (!member) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.member = member;
  next();
}

async function requireActive(_req: Request, res: Response<unknown, MemberLocals>, next: NextFunction): Promise<void> {
  const { member } = res.locals;
  if (member.role === "admin") {
    next();
    return;
  }

  const [subscription] = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.memberId, member.id),
      eq(subscriptionsTable.status, "active"),
      gt(subscriptionsTable.endsAt, new Date()),
    ))
    .orderBy(desc(subscriptionsTable.endsAt))
    .limit(1);
  if (!subscription) {
    if (member.accessStatus === "active") {
      await db.update(membersTable).set({ accessStatus: "expired" }).where(eq(membersTable.id, member.id));
    }
    res.status(403).json({ error: "An active membership is required" });
    return;
  }
  if (member.accessStatus !== "active") {
    await db.update(membersTable).set({ accessStatus: "active" }).where(eq(membersTable.id, member.id));
  }
  next();
}

function requireAdmin(_req: Request, res: Response<unknown, MemberLocals>, next: NextFunction): void {
  if (res.locals.member.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
}

function paymentDto(payment: typeof paymentRequestsTable.$inferSelect) {
  return {
    id: payment.id,
    plan: payment.plan,
    amountPence: payment.amountPence,
    currency: "GBP" as const,
    paidAt: payment.paidAt,
    reference: payment.reference,
    note: payment.note,
    status: payment.status,
    submittedAt: payment.submittedAt,
    reviewedAt: payment.reviewedAt,
    reviewNote: payment.reviewNote,
  };
}

function protectedVideoDto(video: typeof videosTable.$inferSelect | undefined) {
  if (!video || !video.externalId) return null;
  return {
    provider: "cloudflare_stream" as const,
    status: "protected" as const,
  };
}

function adminSubscriptionDto(subscription: typeof subscriptionsTable.$inferSelect | undefined) {
  return subscription ? {
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status === "active" ? "active" as const : "inactive" as const,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt,
  } : null;
}

type AdminRevocation = {
  id: number;
  revokedAt: Date;
  reason: string | null;
  revokedBy: {
    id: number;
    name: string;
    email: string;
  };
};

async function latestRevocationForMember(memberId: number): Promise<AdminRevocation | undefined> {
  const [revocation] = await db.select({
    id: membershipRevocationsTable.id,
    revokedAt: membershipRevocationsTable.revokedAt,
    reason: membershipRevocationsTable.reason,
    revokedBy: {
      id: membersTable.id,
      name: membersTable.name,
      email: membersTable.email,
    },
  }).from(membershipRevocationsTable)
    .innerJoin(membersTable, eq(membersTable.id, membershipRevocationsTable.revokedByMemberId))
    .where(and(
      eq(membershipRevocationsTable.memberId, memberId),
      eq(membershipRevocationsTable.action, "revoked"),
    ))
    .orderBy(desc(membershipRevocationsTable.id))
    .limit(1);
  return revocation;
}

async function accessHistoryForMember(memberId: number) {
  return db.select({
    id: membershipRevocationsTable.id,
    action: membershipRevocationsTable.action,
    changedAt: membershipRevocationsTable.revokedAt,
    changedBy: {
      id: membersTable.id,
      name: membersTable.name,
      email: membersTable.email,
    },
    reason: membershipRevocationsTable.reason,
  }).from(membershipRevocationsTable)
    .innerJoin(membersTable, eq(membersTable.id, membershipRevocationsTable.revokedByMemberId))
    .where(eq(membershipRevocationsTable.memberId, memberId))
    .orderBy(desc(membershipRevocationsTable.id))
    .limit(500);
}

function adminMemberDto(
  member: Member,
  subscription: typeof subscriptionsTable.$inferSelect | undefined,
  latestRevocation: AdminRevocation | undefined,
) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    plan: subscription?.plan === "year" ? "Annual" : subscription?.plan === "month" ? "Monthly" : "No subscription",
    progress: 0,
    activity: "Recently joined",
    accessStatus: member.accessStatus,
    currentSubscription: adminSubscriptionDto(subscription),
    latestRevocation: latestRevocation ?? null,
  };
}

async function lessonWithVideo(lessonId: number) {
  const [video] = await db.select().from(videosTable)
    .where(eq(videosTable.lessonId, lessonId))
    .limit(1);
  return video;
}

async function accessibleLesson(lessonId: number, member: Member) {
  const [lesson] = await db.select().from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  if (!lesson || (lesson.status !== "published" && member.role !== "admin")) return null;
  return lesson;
}

async function protectVideoAssociation(
  req: Request,
  res: Response,
  video: { externalId: string } | null | undefined,
): Promise<boolean> {
  if (!video) return true;
  try {
    await ensureCloudflareStreamVideoProtected(video.externalId.trim());
    return true;
  } catch (error) {
    if (error instanceof VideoProviderNotConfiguredError) {
      req.log.error("Cloudflare Stream is not configured");
      res.status(503).json({ error: "Cloudflare Stream is not configured yet" });
      return false;
    }
    if (error instanceof VideoProviderRequestError) {
      req.log.warn({ error: error.message }, "Cloudflare Stream video association failed");
      res.status(503).json({ error: "Could not protect that Cloudflare Stream video" });
      return false;
    }
    throw error;
  }
}

function configuredPaymentLink(): string {
  const value = process.env.REVOLUT_MONTHLY_LINK || "https://www.revolut.com/";
  const url = new URL(value);
  if (url.protocol !== "https:" || !isAllowedRevolutHostname(url.hostname) || url.username || url.password) {
    throw new Error("REVOLUT_MONTHLY_LINK must be an approved HTTPS Revolut URL");
  }
  return url.href;
}

router.get("/membership", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  let currentRequest = null;
  if (auth.userId) {
    const [member] = await db.select().from(membersTable).where(eq(membersTable.clerkUserId, auth.userId)).limit(1);
    if (member) {
      const [request] = await db.select().from(paymentRequestsTable)
        .where(eq(paymentRequestsTable.memberId, member.id))
        .orderBy(desc(paymentRequestsTable.submittedAt))
        .limit(1);
      currentRequest = request ? paymentDto(request) : null;
    }
  }

  let paymentLink: string;
  try {
    paymentLink = configuredPaymentLink();
  } catch {
    req.log.error("Revolut payment link configuration is invalid");
    res.status(503).json({ error: "Membership checkout is temporarily unavailable" });
    return;
  }

  res.json(GetMembershipResponse.parse({
    provider: "revolut",
    currency: "GBP",
    offers: [
      { id: "builder-monthly", label: "Builder Monthly", interval: "month", pricePence: 500, currency: "GBP", paymentLink },
    ],
    verificationNote: "Pay through Revolut, then submit the payment reference. Access starts only after an admin verifies the payment.",
    currentRequest,
  }));
});

router.get("/me", requireMember, async (_req, res: Response<unknown, MemberLocals>): Promise<void> => {
  res.json(GetCurrentMemberResponse.parse(memberDto(res.locals.member)));
});

router.get("/payment-requests", requireMember, async (_req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const rows = await db.select().from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.memberId, res.locals.member.id))
    .orderBy(desc(paymentRequestsTable.submittedAt))
    .limit(100);
  res.json(ListPaymentRequestsResponse.parse(rows.map(paymentDto)));
});

router.post("/payment-requests", paymentSubmissionLimit, requireMember, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const parsed = CreatePaymentRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const expectedAmount = 500;
  if (parsed.data.amountPence !== expectedAmount) {
    res.status(400).json({ error: "Amount does not match the selected membership plan" });
    return;
  }
  const now = Date.now();
  const paidAt = parsed.data.paidAt;
  if (paidAt.getTime() > now + 5 * 60_000 || paidAt.getTime() < now - 90 * 24 * 60 * 60_000) {
    res.status(400).json({ error: "Payment date must be within the last 90 days and cannot be in the future" });
    return;
  }
  const reference = normalizePaymentReference(parsed.data.reference);
  if (reference.length < 3) {
    res.status(400).json({ error: "A unique Revolut transfer reference is required" });
    return;
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [payment] = await tx.insert(paymentRequestsTable).values({
        memberId: res.locals.member.id,
        plan: parsed.data.plan,
        amountPence: parsed.data.amountPence,
        currency: "GBP",
        paidAt,
        reference,
        note: parsed.data.note?.trim() || null,
      }).returning();
      const [activeSubscription] = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(
          eq(subscriptionsTable.memberId, res.locals.member.id),
          eq(subscriptionsTable.status, "active"),
          gt(subscriptionsTable.endsAt, new Date()),
        ))
        .limit(1);
      if (!activeSubscription) {
        await tx.update(membersTable).set({ accessStatus: "pending" })
          .where(eq(membersTable.id, res.locals.member.id));
      }
      return payment;
    });
    res.status(201).json(CreatePaymentRequestResponse.parse(paymentDto(created)));
  } catch (error) {
    if (hasDatabaseErrorCode(error, "23505")) {
      res.status(409).json({ error: "That transfer reference was already submitted or you already have a pending confirmation" });
      return;
    }
    throw error;
  }
});

router.get("/pathway", requireMember, requireActive, async (_req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const [course] = await db.select().from(coursesTable).orderBy(asc(coursesTable.id)).limit(1);
  if (!course) {
    res.status(404).json({ error: "Learning pathway not found" });
    return;
  }
  const lessonCondition = res.locals.member.role === "admin"
    ? eq(lessonsTable.courseId, course.id)
    : and(eq(lessonsTable.courseId, course.id), eq(lessonsTable.status, "published"));
  const lessons = await db.select().from(lessonsTable)
    .where(lessonCondition)
    .orderBy(asc(lessonsTable.order));
  const completedRows = await db.select().from(progressTable)
    .where(and(eq(progressTable.memberId, res.locals.member.id), eq(progressTable.completed, true)));
  const visibleLessonIds = new Set(lessons.map((lesson) => lesson.id));
  const completed = new Set(
    completedRows.map((row) => row.lessonId).filter((lessonId) => visibleLessonIds.has(lessonId)),
  );
  res.json(GetPathwayResponse.parse({
    id: course.id,
    title: course.title,
    eyebrow: course.eyebrow,
    description: course.description,
    totalLessons: lessons.length,
    completedLessons: completed.size,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      module: lesson.module,
      durationMinutes: lesson.durationMinutes,
      status: lesson.status,
      order: lesson.order,
      completed: completed.has(lesson.id),
      description: lesson.description,
    })),
  }));
});

router.get("/lessons/:lessonId", requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = GetLessonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, params.data.lessonId)).limit(1);
  if (!lesson || (lesson.status !== "published" && res.locals.member.role !== "admin")) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const [progress] = await db.select().from(progressTable)
    .where(and(eq(progressTable.memberId, res.locals.member.id), eq(progressTable.lessonId, lesson.id))).limit(1);
  const video = await lessonWithVideo(lesson.id);
  res.json(GetLessonResponse.parse({
    id: lesson.id,
    title: lesson.title,
    module: lesson.module,
    durationMinutes: lesson.durationMinutes,
    status: lesson.status,
    order: lesson.order,
    completed: progress?.completed ?? false,
    description: lesson.description,
    body: sanitizeLessonBody(lesson.body),
    video: protectedVideoDto(video),
  }));
});

router.get("/lessons/:lessonId/playback", playbackLimit, requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = GetLessonPlaybackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, params.data.lessonId)).limit(1);
  if (!lesson || (lesson.status !== "published" && res.locals.member.role !== "admin")) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  const video = await lessonWithVideo(lesson.id);
  if (!video?.externalId || video.provider !== "cloudflare_stream") {
    res.status(404).json({ error: "Video is not available for this lesson" });
    return;
  }

  try {
    const handoff = await createCloudflareStreamPlaybackToken(video.externalId);
    res.set("Cache-Control", "private, no-store");
    res.json(GetLessonPlaybackResponse.parse({
      provider: "cloudflare_stream",
      ...handoff,
    }));
  } catch (error) {
    if (error instanceof VideoProviderNotConfiguredError) {
      req.log.error({ lessonId: lesson.id }, "Cloudflare Stream is not configured");
      res.status(503).json({ error: "Video playback is not configured yet" });
      return;
    }
    if (error instanceof VideoProviderRequestError) {
      req.log.error({ lessonId: lesson.id, error: error.message }, "Cloudflare Stream playback handoff failed");
      res.status(503).json({ error: "Video playback is temporarily unavailable" });
      return;
    }
    throw error;
  }
});

router.put("/lessons/:lessonId/progress", communityWriteLimit, requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = UpdateLessonProgressParams.safeParse(req.params);
  const body = UpdateLessonProgressBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid lesson progress" });
    return;
  }
  const lesson = await accessibleLesson(params.data.lessonId, res.locals.member);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const completedAt = body.data.completed ? new Date() : null;
  const [progress] = await db.insert(progressTable).values({
    memberId: res.locals.member.id,
    lessonId: params.data.lessonId,
    completed: body.data.completed,
    completedAt,
  }).onConflictDoUpdate({
    target: [progressTable.memberId, progressTable.lessonId],
    set: { completed: body.data.completed, completedAt },
  }).returning();
  res.json(UpdateLessonProgressResponse.parse({
    lessonId: progress.lessonId,
    completed: progress.completed,
    completedAt: progress.completedAt,
  }));
});

router.get("/lessons/:lessonId/comments", requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = ListLessonCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const lesson = await accessibleLesson(params.data.lessonId, res.locals.member);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const rows = await db.select({
    id: commentsTable.id,
    lessonId: commentsTable.lessonId,
    authorName: membersTable.name,
    content: commentsTable.content,
    createdAt: commentsTable.createdAt,
  }).from(commentsTable).innerJoin(membersTable, eq(commentsTable.memberId, membersTable.id))
    .where(eq(commentsTable.lessonId, params.data.lessonId))
    .orderBy(desc(commentsTable.createdAt))
    .limit(200);
  res.json(ListLessonCommentsResponse.parse(rows));
});

router.post("/lessons/:lessonId/comments", communityWriteLimit, requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = CreateLessonCommentParams.safeParse(req.params);
  const body = CreateLessonCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid comment" });
    return;
  }
  const lesson = await accessibleLesson(params.data.lessonId, res.locals.member);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const [comment] = await db.insert(commentsTable).values({
    memberId: res.locals.member.id,
    lessonId: params.data.lessonId,
    content: body.data.content.trim(),
  }).returning();
  res.status(201).json(CreateLessonCommentResponse.parse({
    id: comment.id,
    lessonId: comment.lessonId,
    authorName: res.locals.member.name,
    content: comment.content,
    createdAt: comment.createdAt,
  }));
});

router.get("/discussion", requireMember, requireActive, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: discussionPostsTable.id,
    authorName: membersTable.name,
    title: discussionPostsTable.title,
    content: discussionPostsTable.content,
    replyCount: discussionPostsTable.replyCount,
    createdAt: discussionPostsTable.createdAt,
  }).from(discussionPostsTable).innerJoin(membersTable, eq(discussionPostsTable.memberId, membersTable.id))
    .orderBy(desc(discussionPostsTable.createdAt))
    .limit(200);
  res.json(ListDiscussionPostsResponse.parse(rows));
});

router.post("/discussion", communityWriteLimit, requireMember, requireActive, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const body = CreateDiscussionPostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [post] = await db.insert(discussionPostsTable).values({
    memberId: res.locals.member.id,
    title: body.data.title.trim(),
    content: body.data.content.trim(),
  }).returning();
  res.status(201).json(CreateDiscussionPostResponse.parse({
    id: post.id,
    authorName: res.locals.member.name,
    title: post.title,
    content: post.content,
    replyCount: post.replyCount,
    createdAt: post.createdAt,
  }));
});

router.get("/admin/overview", requireMember, requireAdmin, async (_req, res): Promise<void> => {
  const [{ activeMembers }] = await db.select({ activeMembers: count() }).from(membersTable).where(eq(membersTable.accessStatus, "active"));
  const [{ totalProgress }] = await db.select({ totalProgress: count() }).from(progressTable);
  const [{ completedProgress }] = await db.select({ completedProgress: count() }).from(progressTable).where(eq(progressTable.completed, true));
  const [{ conversations }] = await db.select({ conversations: count() }).from(discussionPostsTable);
  const [{ revenue }] = await db.select({ revenue: sql<number>`coalesce(sum(${paymentRequestsTable.amountPence}), 0)` })
    .from(paymentRequestsTable).where(eq(paymentRequestsTable.status, "approved"));
  const [{ pending }] = await db.select({ pending: count() }).from(paymentRequestsTable).where(eq(paymentRequestsTable.status, "pending"));
  const recentMembers = await db.select().from(membersTable).orderBy(desc(membersTable.joinedAt)).limit(5);
  res.json(GetAdminOverviewResponse.parse({
    activeMembers: Number(activeMembers),
    completionRate: Number(totalProgress) ? Math.round((Number(completedProgress) / Number(totalProgress)) * 1000) / 10 : 0,
    newConversations: Number(conversations),
    revenuePence: Number(revenue),
    pendingPayments: Number(pending),
    recentMembers: await Promise.all(recentMembers.map(async (member) => {
      const [subscription, latestRevocation] = await Promise.all([
        db.select().from(subscriptionsTable)
          .where(eq(subscriptionsTable.memberId, member.id))
          .orderBy(desc(subscriptionsTable.endsAt))
          .limit(1)
          .then(([row]) => row),
        latestRevocationForMember(member.id),
      ]);
      return adminMemberDto(member, subscription, latestRevocation);
    })),
  }));
});

router.get("/admin/members", requireMember, requireAdmin, async (_req, res): Promise<void> => {
  const members = await db.select().from(membersTable).orderBy(desc(membersTable.joinedAt)).limit(200);
  const rows = await Promise.all(members.map(async (member) => {
    const [subscription, latestRevocation] = await Promise.all([
      db.select().from(subscriptionsTable)
        .where(eq(subscriptionsTable.memberId, member.id))
        .orderBy(desc(subscriptionsTable.endsAt))
        .limit(1)
        .then(([row]) => row),
      latestRevocationForMember(member.id),
    ]);
    return adminMemberDto(member, subscription, latestRevocation);
  }));
  res.json(ListAdminMembersResponse.parse(rows));
});

router.get("/admin/members/:memberId/access-history", requireMember, requireAdmin, async (req, res): Promise<void> => {
  const params = RevokeMemberSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member" });
    return;
  }
  const [member] = await db.select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.id, params.data.memberId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json(ListAdminMemberAccessHistoryResponse.parse(await accessHistoryForMember(member.id)));
});

router.post("/admin/members/:memberId/revoke", adminWriteLimit, requireMember, requireAdmin, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = RevokeMemberSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member" });
    return;
  }

  const parsedBody = RevokeMemberSubscriptionBody.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const reason = parsedBody.data.reason?.trim() || null;

  const result = await db.transaction(async (tx) => {
    const [member] = await tx.select().from(membersTable)
      .where(eq(membersTable.id, params.data.memberId))
      .for("update");
    if (!member) return { kind: "not-found" as const };
    if (member.role === "admin") return { kind: "admin" as const };

    const activeSubscriptions = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
      .where(and(
        eq(subscriptionsTable.memberId, member.id),
        eq(subscriptionsTable.status, "active"),
      ));
    if (activeSubscriptions.length === 0) return { kind: "no-active" as const };

    await tx.update(subscriptionsTable).set({ status: "inactive" }).where(and(
      eq(subscriptionsTable.memberId, member.id),
      eq(subscriptionsTable.status, "active"),
    ));
    await tx.update(membersTable).set({ accessStatus: "expired" }).where(eq(membersTable.id, member.id));
    await tx.insert(membershipRevocationsTable).values({
      memberId: member.id,
      revokedByMemberId: res.locals.member.id,
      action: "revoked",
      reason,
      revokedAt: new Date(),
    });

    const [updatedMember] = await tx.select().from(membersTable)
      .where(eq(membersTable.id, member.id))
      .limit(1);
    const [currentSubscription] = await tx.select().from(subscriptionsTable)
      .where(eq(subscriptionsTable.memberId, member.id))
      .orderBy(desc(subscriptionsTable.endsAt))
      .limit(1);
    return { kind: "revoked" as const, member: updatedMember, subscription: currentSubscription };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (result.kind === "admin") {
    res.status(400).json({ error: "Administrator memberships are managed by role" });
    return;
  }
  if (result.kind === "no-active") {
    res.status(400).json({ error: "Member does not have an active subscription" });
    return;
  }
  const latestRevocation = await latestRevocationForMember(result.member.id);
  res.json(RevokeMemberSubscriptionResponse.parse(adminMemberDto(result.member, result.subscription, latestRevocation)));
});

router.get("/admin/payment-requests", requireMember, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    payment: paymentRequestsTable,
    memberId: membersTable.id,
    memberName: membersTable.name,
    memberEmail: membersTable.email,
  }).from(paymentRequestsTable)
    .innerJoin(membersTable, eq(paymentRequestsTable.memberId, membersTable.id))
    .orderBy(desc(paymentRequestsTable.submittedAt))
    .limit(200);
  res.json(ListAdminPaymentRequestsResponse.parse(rows.map(({ payment, ...member }) => ({
    ...paymentDto(payment),
    ...member,
  }))));
});

router.patch("/admin/payment-requests/:requestId", adminWriteLimit, requireMember, requireAdmin, async (req, res: Response<unknown, MemberLocals>): Promise<void> => {
  const params = ReviewPaymentRequestParams.safeParse(req.params);
  const body = ReviewPaymentRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid payment review" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.update(paymentRequestsTable).set({
      status: body.data.status,
      reviewNote: body.data.reviewNote?.trim() || null,
      reviewedAt: new Date(),
      reviewedByMemberId: res.locals.member.id,
    }).where(and(
      eq(paymentRequestsTable.id, params.data.requestId),
      eq(paymentRequestsTable.status, "pending"),
    )).returning();
    if (!payment) return null;

    const [memberBeforeReview] = await tx.select().from(membersTable)
      .where(eq(membersTable.id, payment.memberId))
      .limit(1)
      .for("update");
    if (!memberBeforeReview) return null;

    if (body.data.status === "approved") {
      const now = new Date();
      const endsAt = new Date(now);
      if (payment.plan === "month") endsAt.setMonth(endsAt.getMonth() + 1);
      else endsAt.setFullYear(endsAt.getFullYear() + 1);
      await tx.insert(subscriptionsTable).values({
        memberId: payment.memberId,
        paymentRequestId: payment.id,
        plan: payment.plan,
        startsAt: now,
        endsAt,
      }).onConflictDoNothing();
      await tx.update(membersTable).set({ accessStatus: "active" }).where(eq(membersTable.id, payment.memberId));
      if (memberBeforeReview.accessStatus !== "active") {
        const [priorRevocation] = await tx.select({ id: membershipRevocationsTable.id })
          .from(membershipRevocationsTable)
          .where(and(
            eq(membershipRevocationsTable.memberId, payment.memberId),
            eq(membershipRevocationsTable.action, "revoked"),
          ))
          .limit(1);
        if (priorRevocation) {
          await tx.insert(membershipRevocationsTable).values({
            memberId: payment.memberId,
            revokedByMemberId: res.locals.member.id,
            action: "reactivated",
            reason: body.data.reviewNote?.trim() || null,
            revokedAt: new Date(),
          });
        }
      }
    } else {
      const [validSubscription] = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
        .where(and(
          eq(subscriptionsTable.memberId, payment.memberId),
          eq(subscriptionsTable.status, "active"),
          gt(subscriptionsTable.endsAt, new Date()),
        )).limit(1);
      await tx.update(membersTable)
        .set({ accessStatus: validSubscription ? "active" : "unpaid" })
        .where(eq(membersTable.id, payment.memberId));
    }
    const [member] = await tx.select().from(membersTable).where(eq(membersTable.id, payment.memberId)).limit(1);
    return { payment, member };
  });
  if (!result) {
    res.status(400).json({ error: "Payment request was already reviewed or does not exist" });
    return;
  }
  res.json(ReviewPaymentRequestResponse.parse({
    ...paymentDto(result.payment),
    memberId: result.member.id,
    memberName: result.member.name,
    memberEmail: result.member.email,
  }));
});

router.post("/admin/lessons", adminWriteLimit, requireMember, requireAdmin, async (req, res): Promise<void> => {
  const body = CreateLessonBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const sanitizedBody = sanitizeLessonBody(body.data.body);
  if (!sanitizedBody) {
    res.status(400).json({ error: "Lesson body must contain readable text" });
    return;
  }
  const [course] = await db.select().from(coursesTable).orderBy(asc(coursesTable.id)).limit(1);
  if (!course) {
    res.status(400).json({ error: "Create a course before adding lessons" });
    return;
  }
  if (!await protectVideoAssociation(req, res, body.data.video)) return;

  const lesson = await db.transaction(async (tx) => {
    const { video, ...lessonFields } = body.data;
    const [created] = await tx.insert(lessonsTable).values({
      courseId: course.id,
      ...lessonFields,
      body: sanitizedBody,
    }).returning();
    if (video) {
      await tx.insert(videosTable).values({
        lessonId: created.id,
        provider: video.provider,
        externalId: video.externalId.trim(),
        status: "ready",
      });
    }
    return created;
  });
  res.status(201).json(CreateLessonResponse.parse({
    ...lesson,
    completed: false,
    video: body.data.video ? {
      provider: "cloudflare_stream",
      status: "protected",
    } : null,
  }));
});

router.get("/admin/lessons/:lessonId/video", requireMember, requireAdmin, async (req, res): Promise<void> => {
  const params = GetLessonVideoAssociationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lesson] = await db.select({ id: lessonsTable.id }).from(lessonsTable)
    .where(eq(lessonsTable.id, params.data.lessonId))
    .limit(1);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  const video = await lessonWithVideo(lesson.id);
  res.json(GetLessonVideoAssociationResponse.parse(
    video?.externalId
      ? { provider: "cloudflare_stream", externalId: video.externalId }
      : null,
  ));
});

router.patch("/admin/lessons/:lessonId", adminWriteLimit, requireMember, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateLessonParams.safeParse(req.params);
  const body = UpdateLessonBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid lesson update" });
    return;
  }
  const sanitizedBody = body.data.body === undefined ? undefined : sanitizeLessonBody(body.data.body);
  if (body.data.body !== undefined && !sanitizedBody) {
    res.status(400).json({ error: "Lesson body must contain readable text" });
    return;
  }
  if (!await protectVideoAssociation(req, res, body.data.video)) return;

  const { video: videoAssociation, ...lessonFields } = body.data;
  const updateData = sanitizedBody === undefined
    ? lessonFields
    : { ...lessonFields, body: sanitizedBody };
  const lesson = await db.transaction(async (tx) => {
    const [updated] = await tx.update(lessonsTable).set(updateData)
      .where(eq(lessonsTable.id, params.data.lessonId)).returning();
    if (!updated) return null;

    if (videoAssociation !== undefined) {
      if (videoAssociation === null) {
        await tx.delete(videosTable).where(eq(videosTable.lessonId, updated.id));
      } else {
        await tx.insert(videosTable).values({
          lessonId: updated.id,
          provider: videoAssociation.provider,
          externalId: videoAssociation.externalId.trim(),
          status: "ready",
        }).onConflictDoUpdate({
          target: videosTable.lessonId,
          set: {
            provider: videoAssociation.provider,
            externalId: videoAssociation.externalId.trim(),
            status: "ready",
          },
        });
      }
    }
    return updated;
  });
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const video = await lessonWithVideo(lesson.id);
  res.json(UpdateLessonResponse.parse({
    ...lesson,
    completed: false,
    video: protectedVideoDto(video),
  }));
});

export default router;