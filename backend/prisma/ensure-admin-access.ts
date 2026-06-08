/**
 * Corrige admin@drinkquest.app (o SEED_ADMIN_EMAIL) si quedó con rol USER/BAR.
 * Uso local: npm run admin:ensure-access
 * En Render: se ejecuta vía seed en cada deploy (seedAdminUser).
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@drinkquest.app').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No existe usuario ${email}. Ejecuta: npm run admin:reset-password`);
    process.exit(1);
  }
  if (user.role === Role.SUPER_ADMIN) {
    console.log(`✅ ${email} ya tiene rol SUPER_ADMIN`);
    return;
  }
  await prisma.user.update({
    where: { email },
    data: {
      role: Role.SUPER_ADMIN,
      emailVerified: true,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });
  console.log(`✅ ${email}: ${user.role} → SUPER_ADMIN`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
