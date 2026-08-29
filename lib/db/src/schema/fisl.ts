import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const memberRoleEnum = pgEnum("member_role", ["member", "admin"]);
export const accessStatusEnum = pgEnum("access_status", ["unpaid", "pending", "active", "expired"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["draft", "published", "scheduled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "approved", "rejected"]);
export const planIntervalEnum = pgEnum("plan_interval", ["month", "year"]);
export const membershipAccessChangeActionEnum = pgEnum("membership_access_change_action", ["revoked", "reactivated"]);

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: memberRoleEnum("role").notNull().default("member"),
  accessStatus: accessStatusEnum("access_status").notNull().default("unpaid"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  eyebrow: text("eyebrow").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lessonsTable = pgTable("lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  module: text("module").notNull(),
  description: text("description").notNull(),
  body: text("body").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  order: integer("sort_order").notNull(),
  status: lessonStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("lessons_course_status_order_idx").on(table.courseId, table.status, table.order)]);

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("cloudflare_stream"),
  externalId: text("external_id"),
  playbackUrl: text("playback_url"),
  status: text("status").notNull().default("unavailable"),
});

export const progressTable = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("lesson_progress_member_lesson_idx").on(table.memberId, table.lessonId)]);

export const commentsTable = pgTable("lesson_comments", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("lesson_comments_lesson_created_idx").on(table.lessonId, table.createdAt)]);

export const discussionPostsTable = pgTable("discussion_posts", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  replyCount: integer("reply_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("discussion_posts_created_idx").on(table.createdAt)]);

export const paymentRequestsTable = pgTable("payment_requests", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  plan: planIntervalEnum("plan").notNull(),
  amountPence: integer("amount_pence").notNull(),
  currency: text("currency").notNull().default("GBP"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  reference: text("reference").notNull(),
  note: text("note"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByMemberId: integer("reviewed_by_member_id").references(() => membersTable.id),
  reviewNote: text("review_note"),
}, (table) => [
  uniqueIndex("payment_requests_reference_idx").on(table.reference),
  uniqueIndex("payment_requests_one_pending_member_idx")
    .on(table.memberId)
    .where(sql`${table.status} = 'pending'`),
  index("payment_requests_member_submitted_idx").on(table.memberId, table.submittedAt),
]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  paymentRequestId: integer("payment_request_id").notNull().references(() => paymentRequestsTable.id).unique(),
  plan: planIntervalEnum("plan").notNull(),
  status: text("status").notNull().default("active"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, (table) => [index("subscriptions_member_status_ends_idx").on(table.memberId, table.status, table.endsAt)]);

export const membershipRevocationsTable = pgTable("membership_revocations", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => membersTable.id, { onDelete: "cascade" }),
  revokedByMemberId: integer("revoked_by_member_id").notNull().references(() => membersTable.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
  action: membershipAccessChangeActionEnum("action").notNull().default("revoked"),
  reason: text("reason"),
}, (table) => [index("membership_revocations_member_revoked_idx").on(table.memberId, table.revokedAt)]);

export const insertMemberSchema = createInsertSchema(membersTable).omit({ id: true, joinedAt: true, updatedAt: true });
export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentRequestSchema = createInsertSchema(paymentRequestsTable).omit({ id: true, submittedAt: true, reviewedAt: true, reviewedByMemberId: true });
export const insertMembershipRevocationSchema = createInsertSchema(membershipRevocationsTable).omit({ id: true, revokedAt: true });

export type Member = typeof membersTable.$inferSelect;
export type Lesson = typeof lessonsTable.$inferSelect;
export type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
export type MembershipRevocation = typeof membershipRevocationsTable.$inferSelect;