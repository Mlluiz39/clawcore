FROM node:20-alpine

# needed for better-sqlite3 native build and curl
RUN apk add --no-cache python3 make g++ curl wget tar git

# Install gogcli
RUN wget https://github.com/steipete/gogcli/releases/download/v0.12.0/gogcli_0.12.0_linux_amd64.tar.gz && \
    tar -xzf gogcli_0.12.0_linux_amd64.tar.gz gog && \
    chmod +x gog && \
    mv gog /usr/local/bin/gog && \
    rm gogcli_0.12.0_linux_amd64.tar.gz

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY .agents/ ./.agents/

RUN npm run build
RUN npm prune --omit=dev

# Create runtime directories
RUN mkdir -p data tmp outputs

CMD ["node", "dist/index.js"]
