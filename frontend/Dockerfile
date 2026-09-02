# --- Estágio 1: compila a SPA para arquivos estáticos (HTML/CSS/JS) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# A URL da API é embutida DENTRO dos arquivos JS gerados pelo Vite (via
# import.meta.env — ver src/api/client.ts) no momento do BUILD, não do
# arranque do container. Por isso precisa ser um ARG de build, não uma
# variável de ambiente lida em tempo de execução como seria no backend.
ARG VITE_API_URL=http://localhost:3333/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Estágio 2: serve os arquivos estáticos com Nginx. Nenhum Node.js,
#     nenhuma dependência do projeto sobrevive até aqui — só HTML/CSS/JS
#     puros e um servidor web, o que deixa a imagem final bem pequena. ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
