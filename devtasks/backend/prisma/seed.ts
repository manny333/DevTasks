import 'dotenv/config';
import prisma from '../src/lib/prisma';

/**
 * Minimal, idempotent development seed.
 * Creates a demo user, one project with three sections and one task.
 * Safe to run multiple times.
 */
async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@kanvy.local' },
    update: {},
    create: {
      email: 'demo@kanvy.local',
      name: 'Demo User',
      googleId: 'demo-local',
      avatar: null,
    },
  });

  let project = await prisma.project.findUnique({ where: { slug: 'demo-project' } });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Demo Project',
        slug: 'demo-project',
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
        sections: {
          create: [
            { name: 'Backlog', color: '#94a3b8', position: 0 },
            { name: 'In Progress', color: '#f59e0b', position: 1 },
            { name: 'Done', color: '#22c55e', position: 2 },
          ],
        },
      },
    });
  }

  const sections = await prisma.section.findMany({
    where: { projectId: project.id },
    orderBy: { position: 'asc' },
  });

  if (sections.length > 0) {
    const existingTasks = await prisma.task.count({ where: { sectionId: sections[0].id } });
    if (existingTasks === 0) {
      await prisma.task.create({
        data: {
          title: 'First demo task',
          description: 'Created by `npm run db:seed`',
          status: 'TODO',
          position: 0,
          sectionId: sections[0].id,
        },
      });
    }
  }

  console.log(`Seed completed: project "${project.name}", ${sections.length} sections.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
