import 'dotenv/config';
import prisma from '../src/lib/prisma';

type SeedTask = {
  title: string;
  description: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
};

type SeedSection = {
  name: string;
  color: string;
  position: number;
  tasks: SeedTask[];
};

const ROADMAP_SLUG = 'devtasks-roadmap-funcionalidades';
const ROADMAP_NAME = 'Roadmap de Funcionalidades';

const seedSections: SeedSection[] = [
  {
    name: 'Prioridad Alta',
    color: '#ef4444',
    position: 0,
    tasks: [
      {
        title: 'Filtros avanzados del tablero',
        description: 'Filtrar por responsable, tags, estado, fecha limite y archivadas.',
      },
      {
        title: 'Fechas limite y recordatorios',
        description: 'Agregar due date, indicadores visuales y alertas por tareas vencidas o proximas.',
      },
      {
        title: 'Checklist y subtareas',
        description: 'Permitir subtareas por task y mostrar porcentaje de avance.',
      },
      {
        title: 'Notificaciones en tiempo real',
        description: 'Eventos para comentarios, asignaciones y cambios de estado.',
      },
    ],
  },
  {
    name: 'Prioridad Media',
    color: '#f59e0b',
    position: 1,
    tasks: [
      {
        title: 'Historial de actividad',
        description: 'Timeline por tarea/proyecto con usuario, accion y fecha.',
      },
      {
        title: 'Vista calendario',
        description: 'Vista mensual/semanal de tareas con navegacion por fecha.',
      },
      {
        title: 'Permisos finos por seccion y tarea',
        description: 'Reglas granulares para ver, editar, mover y administrar.',
      },
    ],
  },
  {
    name: 'Prioridad Baja',
    color: '#22c55e',
    position: 2,
    tasks: [
      {
        title: 'Exportacion CSV y PDF',
        description: 'Exportar tareas, estados y metricas basicas para reportes.',
      },
      {
        title: 'Dashboard de metricas',
        description: 'Graficas de productividad, avance por seccion y cumplimiento.',
      },
    ],
  },
];

async function resolveOwnerId() {
  const ownerEmail = process.env.ROADMAP_OWNER_EMAIL?.trim();

  if (ownerEmail) {
    const byEmail = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!byEmail) {
      throw new Error(`No existe usuario con email ${ownerEmail}. Ajusta ROADMAP_OWNER_EMAIL.`);
    }
    return byEmail.id;
  }

  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firstUser) {
    throw new Error('No hay usuarios en la base de datos. Crea uno primero y vuelve a ejecutar el seed.');
  }

  return firstUser.id;
}

async function upsertSection(projectId: string, section: SeedSection) {
  const existing = await prisma.section.findFirst({
    where: { projectId, name: section.name },
  });

  if (existing) {
    return prisma.section.update({
      where: { id: existing.id },
      data: {
        color: section.color,
        position: section.position,
        archived: false,
      },
    });
  }

  return prisma.section.create({
    data: {
      projectId,
      name: section.name,
      color: section.color,
      position: section.position,
    },
  });
}

async function upsertTask(sectionId: string, task: SeedTask, position: number) {
  const existing = await prisma.task.findFirst({
    where: { sectionId, title: task.title },
  });

  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        description: task.description,
        position,
        archived: false,
        status: task.status ?? 'TODO',
      },
    });
  }

  return prisma.task.create({
    data: {
      sectionId,
      title: task.title,
      description: task.description,
      position,
      status: task.status ?? 'TODO',
    },
  });
}

async function main() {
  const ownerId = await resolveOwnerId();

  const project = await prisma.project.upsert({
    where: { slug: ROADMAP_SLUG },
    update: {
      name: ROADMAP_NAME,
      description: 'Backlog de funcionalidades organizado por prioridad.',
      ownerId,
    },
    create: {
      name: ROADMAP_NAME,
      slug: ROADMAP_SLUG,
      description: 'Backlog de funcionalidades organizado por prioridad.',
      ownerId,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: ownerId,
      },
    },
    update: {
      role: 'OWNER',
      accessType: 'FULL',
    },
    create: {
      projectId: project.id,
      userId: ownerId,
      role: 'OWNER',
      accessType: 'FULL',
    },
  });

  for (const sectionSeed of seedSections) {
    const section = await upsertSection(project.id, sectionSeed);

    for (let i = 0; i < sectionSeed.tasks.length; i += 1) {
      await upsertTask(section.id, sectionSeed.tasks[i], i);
    }
  }

  console.log(`Roadmap creado/actualizado: ${project.name} (${project.slug})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
