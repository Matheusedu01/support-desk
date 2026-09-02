import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
    // Testes de integração fazem várias chamadas HTTP reais contra o Express
    // + Prisma + Postgres em sequência — o timeout padrão (5s) é apertado
    // demais para isso na primeira execução (conexão fria com o banco).
    testTimeout: 20000,

    // Por padrão o Vitest roda ARQUIVOS de teste em paralelo, em workers
    // separados. Isso é ótimo para testes unitários isolados, mas quebra
    // testes de integração que compartilham um banco de dados real: o
    // `cleanDatabase()` de um arquivo pode apagar, no meio da execução, dados
    // que outro arquivo (rodando ao mesmo tempo, em outro worker) acabou de
    // criar e ainda está usando — foi exatamente isso que causou falhas
    // aleatórias (registro duplicado "passando", FK violation ao criar
    // ticket) na primeira vez que esta suíte rodou contra um Postgres de
    // verdade. `fileParallelism: false` força os arquivos a rodarem em
    // sequência, então só existe um estado do banco por vez.
    fileParallelism: false,
  },
});
