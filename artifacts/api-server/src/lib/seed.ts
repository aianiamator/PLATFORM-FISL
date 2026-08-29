import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import { coursesTable, db, lessonsTable, membersTable, subscriptionsTable, videosTable } from "@workspace/db";

const lessonSeeds = [
  ["Build your first AI workflow", "AI at work", "Turn one repetitive task into a dependable AI-assisted workflow.", "Map the task, define the input and output, then build a repeatable prompt and review loop.", 18],
  ["Prompt systems that survive reality", "AI at work", "Create prompts that hold up when the inputs get messy.", "Separate context, constraints, examples and acceptance checks so the result remains useful.", 24],
  ["The 30-minute research sprint", "AI at work", "Research a topic quickly without losing the source trail.", "Start with a decision question, fan out deliberately, then converge on evidence and open questions.", 16],
  ["Build an evaluation habit", "Foundations", "Know when an AI output is actually good enough to use.", "Define a lightweight scorecard and compare outputs against examples that represent real work.", 21],
  ["Create a reusable context pack", "Foundations", "Stop repeating your business context in every conversation.", "Package goals, audience, voice, constraints and examples into a concise reusable briefing document.", 14],
  ["Automate the handoff", "Workflows", "Move useful AI output into the next step of your process.", "Design a handoff with clear ownership, formatting and a human review checkpoint.", 19],
  ["Design a human review loop", "Workflows", "Keep speed without giving up judgment.", "Choose what must be reviewed, who reviews it and what evidence is required before publishing.", 17],
  ["Turn notes into decisions", "Applied skills", "Use AI to make meetings end with clearer action.", "Structure notes around decisions, owners, risks and unresolved questions rather than summaries alone.", 15],
  ["Build your personal AI playbook", "Applied skills", "Capture the methods that consistently work for you.", "Document proven workflows, prompts, checks and failure modes so your system improves over time.", 22],
  ["Ship one complete system", "Capstone", "Combine the pathway into a useful working system.", "Choose a real task, implement the full workflow, test it against messy inputs and share what changed.", 28],
] as const;

export async function ensureSeedData(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(701552)`);
    const configuredAdminIds = new Set(
      (process.env.FISL_ADMIN_CLERK_USER_ID ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    );
    const configuredAdminEmails = new Set(
      (process.env.FISL_ADMIN_EMAIL ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
    );
    const members = await tx.select().from(membersTable);
    for (const member of members) {
      const shouldBeAdmin = configuredAdminIds.has(member.clerkUserId)
        || configuredAdminEmails.has(member.email.toLowerCase());
      if (shouldBeAdmin && member.role !== "admin") {
        await tx.update(membersTable)
          .set({ role: "admin", accessStatus: "active" })
          .where(eq(membersTable.id, member.id));
      } else if (!shouldBeAdmin && member.role === "admin") {
        const [validSubscription] = await tx.select({ id: subscriptionsTable.id }).from(subscriptionsTable)
          .where(and(
            eq(subscriptionsTable.memberId, member.id),
            eq(subscriptionsTable.status, "active"),
            gt(subscriptionsTable.endsAt, new Date()),
          )).limit(1);
        await tx.update(membersTable)
          .set({ role: "member", accessStatus: validSubscription ? "active" : "unpaid" })
          .where(eq(membersTable.id, member.id));
      }
    }

    let [course] = await tx.select().from(coursesTable).orderBy(asc(coursesTable.id)).limit(1);
    if (!course) {
      [course] = await tx.insert(coursesTable).values({
        title: "AI at Work",
        eyebrow: "ONE FOCUSED PATHWAY",
        description: "Build practical AI systems you can use every week, then sharpen them with the room.",
      }).returning();
    }
    const [{ value: lessonCount }] = await tx.select({ value: count() }).from(lessonsTable)
      .where(eq(lessonsTable.courseId, course.id));
    if (Number(lessonCount) > 0) return;

    const lessons = await tx.insert(lessonsTable).values(lessonSeeds.map((seed, index) => ({
      courseId: course.id,
      title: seed[0],
      module: seed[1],
      description: seed[2],
      body: seed[3],
      durationMinutes: seed[4],
      order: index + 1,
      status: "published" as const,
    }))).returning();
    await tx.insert(videosTable).values(lessons.map((lesson) => ({
      lessonId: lesson.id,
      provider: "cloudflare_stream",
      status: "unavailable",
    }))).onConflictDoNothing();
  });
}