# Build multi-stage: a imagem final não carrega o compilador TypeScript nem
# os arquivos .ts fonte — só o JavaScript já compilado e as dependências de
# produção. Isso mantém a imagem que efetivamente roda bem menor do que se
# tudo fosse feito num único estágio.

# --- Estágio 1: instala TODAS as dependências (precisa de devDependencies
#     para compilar TypeScript no próximo estágio) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Estágio 2: gera o Prisma Client e compila TypeScript -> JavaScript ---
FROM deps AS build
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# --- Estágio 3: imagem final. Só dependências de produção + JS compilado ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# O Prisma Client gerado no estágio de build é específico do schema.prisma
# deste projeto — copiamos o resultado já gerado em vez de rodar
# `prisma generate` de novo aqui.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3333
CMD ["node", "dist/server.js"]
