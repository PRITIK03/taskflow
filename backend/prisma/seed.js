// prisma/seed.js
// Run with: node prisma/seed.js   (or: npm run seed)
// Wipes ALL existing data and inserts a clean demo dataset.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  // ── 1. WIPE ────────────────────────────────────────────────────────────────
  // Delete in reverse-dependency order so foreign-key constraints are never
  // violated. Cascade deletes on the schema would handle some of this, but
  // explicit ordering here makes the script safe regardless of cascade config.
  console.log('🗑️  Wiping existing data...');
  await prisma.comment.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('✅ Database wiped');

  // ── 2. USERS ───────────────────────────────────────────────────────────────
  console.log('👤 Creating users...');
  const SALT_ROUNDS = 10; // matches authController.js

  const [testUser, secondUser] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('password123', SALT_ROUNDS),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Second User',
        email: 'second@example.com',
        passwordHash: await bcrypt.hash('password123', SALT_ROUNDS),
      },
    }),
  ]);
  console.log('✅ Users created');

  // ── 3. PROJECT + MEMBERSHIPS ───────────────────────────────────────────────
  console.log('📁 Creating project and memberships...');
  const project = await prisma.project.create({
    data: {
      name: 'TaskFlow Demo Project',
      ownerId: testUser.id,
    },
  });

  await prisma.membership.createMany({
    data: [
      { projectId: project.id, userId: testUser.id,   role: 'OWNER'  },
      { projectId: project.id, userId: secondUser.id, role: 'MEMBER' },
    ],
  });
  console.log('✅ Project created');

  // ── 4. TASKS ───────────────────────────────────────────────────────────────
  console.log('📋 Creating tasks...');

  const now = new Date();
  const daysAgo  = (d) => new Date(now.getTime() - d * 86400000);
  const daysAhead = (d) => new Date(now.getTime() + d * 86400000);

  const task1 = await prisma.task.create({
    data: {
      projectId:   project.id,
      title:       'Design database schema',
      description: 'Define all models, relations, enums, and indexes in schema.prisma.',
      status:      'DONE',
      priority:    'HIGH',
      assigneeId:  testUser.id,
      createdById: testUser.id,
      completedAt: daysAgo(4),
    },
  });

  const task2 = await prisma.task.create({
    data: {
      projectId:   project.id,
      title:       'Build authentication API',
      description: 'JWT access + refresh token flow, signup, login, logout, /me endpoint.',
      status:      'DONE',
      priority:    'HIGH',
      assigneeId:  secondUser.id,
      createdById: testUser.id,
      completedAt: daysAgo(1),
    },
  });

  const task3 = await prisma.task.create({
    data: {
      projectId:   project.id,
      title:       'Implement task board UI',
      description: 'Three-column Kanban board with real-time updates via Socket.IO.',
      status:      'IN_PROGRESS',
      priority:    'MEDIUM',
      assigneeId:  secondUser.id,
      createdById: testUser.id,
      dueDate:     daysAhead(3),
    },
  });

  const task4 = await prisma.task.create({
    data: {
      projectId:   project.id,
      title:       'Set up WebSocket events',
      description: 'Emit task:created, task:updated, task:deleted, comment:added events.',
      status:      'TODO',
      priority:    'MEDIUM',
      assigneeId:  null,
      createdById: testUser.id,
    },
  });

  const task5 = await prisma.task.create({
    data: {
      projectId:   project.id,
      title:       'Write project README',
      description: 'Setup instructions, environment variables, seed data, and demo screenshots.',
      status:      'TODO',
      priority:    'LOW',
      assigneeId:  testUser.id,
      createdById: testUser.id,
      dueDate:     daysAhead(7),
    },
  });

  console.log('✅ Tasks created');

  // ── 5. COMMENT ─────────────────────────────────────────────────────────────
  console.log('💬 Creating comment...');
  const comment = await prisma.comment.create({
    data: {
      taskId:   task3.id,
      authorId: secondUser.id,
      body:     'Started on this — board layout is coming together. Column grouping and drag-and-drop targets are next.',
    },
  });
  console.log('✅ Comment created');

  // ── 6. ACTIVITY LOG ────────────────────────────────────────────────────────
  // Types match exactly what the controllers use:
  //   TASK_CREATED, TASK_MOVED, TASK_ASSIGNED, MEMBER_INVITED, COMMENT_ADDED
  console.log('📜 Creating activity log...');

  await prisma.activityLog.createMany({
    data: [
      // Project bootstrapped
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'MEMBER_INVITED',
        message:   `${secondUser.name} was invited to the project.`,
        createdAt: daysAgo(5),
      },
      // Tasks created
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_CREATED',
        message:   `Task "${task1.title}" was created.`,
        createdAt: daysAgo(5),
      },
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_CREATED',
        message:   `Task "${task2.title}" was created.`,
        createdAt: daysAgo(4),
      },
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_CREATED',
        message:   `Task "${task3.title}" was created.`,
        createdAt: daysAgo(3),
      },
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_CREATED',
        message:   `Task "${task4.title}" was created.`,
        createdAt: daysAgo(3),
      },
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_CREATED',
        message:   `Task "${task5.title}" was created.`,
        createdAt: daysAgo(2),
      },
      // Assignments
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_ASSIGNED',
        message:   `Task "${task2.title}" was assigned to ${secondUser.name}.`,
        createdAt: daysAgo(4),
      },
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_ASSIGNED',
        message:   `Task "${task3.title}" was assigned to ${secondUser.name}.`,
        createdAt: daysAgo(3),
      },
      // Tasks moved to DONE
      {
        projectId: project.id,
        actorId:   testUser.id,
        type:      'TASK_MOVED',
        message:   `Task "${task1.title}" was moved from IN_PROGRESS to DONE.`,
        createdAt: daysAgo(4),
      },
      {
        projectId: project.id,
        actorId:   secondUser.id,
        type:      'TASK_MOVED',
        message:   `Task "${task2.title}" was moved from IN_PROGRESS to DONE.`,
        createdAt: daysAgo(1),
      },
      // Comment
      {
        projectId: project.id,
        actorId:   secondUser.id,
        type:      'COMMENT_ADDED',
        message:   `Comment added on task "${task3.title}".`,
        createdAt: comment.createdAt,
      },
    ],
  });
  console.log('✅ Activity log created');

  // ── 7. SUMMARY ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌱 Seed complete! Demo credentials:');
  console.log('');
  console.log('   Test User (project OWNER)');
  console.log('   Email:    test@example.com');
  console.log('   Password: password123');
  console.log('');
  console.log('   Second User (project MEMBER)');
  console.log('   Email:    second@example.com');
  console.log('   Password: password123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
