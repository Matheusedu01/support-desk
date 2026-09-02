import dotenv from "dotenv";

// Carrega .env.test em vez de .env — os testes de integração fazem
// deleteMany() nas tabelas entre casos (ver helpers.ts), então rodar contra
// o banco de desenvolvimento apagaria dados reais que você criou testando
// manualmente. Precisa acontecer ANTES de qualquer teste importar
// `lib/prisma.ts`, porque o PrismaClient lê DATABASE_URL na hora em que é
// instanciado — por isso isso mora em `setupFiles` do vitest.config.ts, que
// roda antes dos arquivos de teste serem carregados.
dotenv.config({ path: ".env.test" });
