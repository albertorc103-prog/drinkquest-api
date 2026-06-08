import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/utils/crypto.util';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@drinkquest.app').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: 'DrinkQuest Admin',
        role: Role.SUPER_ADMIN,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`✅ Admin creado: ${email}`);
  } else {
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        role: Role.SUPER_ADMIN,
        emailVerified: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
    });
    console.log(`✅ Contraseña actualizada: ${email}`);
  }
  console.log(`   Rol: SUPER_ADMIN (todos los permisos de plataforma)`);
  console.log(`   Contraseña: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
