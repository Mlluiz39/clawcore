FROM node:20-alpine

# needed for better-sqlite3 native build
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY .agents/ ./.agents/

RUN npm run build
RUN npm prune --omit=dev

# Create runtime directories
RUN mkdir -p data tmp outputs

CMD ["node", "dist/index.js"]
