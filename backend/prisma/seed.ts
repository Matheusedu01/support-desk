import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Contas de AGENT/ADMIN não têm rota pública de criação (ver Fase 2 —
// aceitar `role` no registro deixaria qualquer um virar admin). Em produção
// isso seria resolvido por um admin convidando novos agentes; para
// desenvolvimento local, um seed é a forma mais simples de ter essas contas
// disponíveis para testar os fluxos das Fases 4 e 5.
async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { name: "Admin", email: "admin@example.com", passwordHash, role: "ADMIN" },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: {},
    create: { name: "Agente Ana", email: "agent@example.com", passwordHash, role: "AGENT" },
  });

  console.log("Seed concluído:");
  console.log(`  admin: ${admin.email} / password123`);
  console.log(`  agent: ${agent.email} / password123`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
