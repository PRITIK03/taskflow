const { PrismaClient } = require('@prisma/client');

// Single shared Prisma Client instance across the whole app.
// Creating a new PrismaClient() in every file would open a new
// connection pool each time — bad for performance and scalability.
const prisma = new PrismaClient();

module.exports = prisma;
