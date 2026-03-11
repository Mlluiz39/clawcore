# ==========================================
# Etapa 1: Build do Frontend (Vite + React)
# ==========================================
FROM node:20-alpine as build

WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências de forma limpa
RUN npm ci

# Copia todo o código fonte
COPY . .

# Faz o build estático do Vite
RUN npm run build

# ==========================================
# Etapa 2: Servidor Web (Nginx)
# ==========================================
FROM nginx:alpine

# Copia a configuração customizada do Nginx (para SPA e Proxy da API)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados no build para a pasta do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Inicia o Nginx em foreground
CMD ["nginx", "-g", "daemon off;"]
