# Node 22 é obrigatório: better-sqlite3@13 declara engines ">=22" e seus
# prebuilds são compilados para a ABI do Node 22+. Em Node 20 o módulo nativo
# carrega e derruba o processo com SIGSEGV no primeiro uso (não há erro de
# instalação — o npm só emite um aviso EBADENGINE e segue).
FROM node:22-alpine

# python3/make/g++ → build nativo de fallback (se o prebuild não servir)
# su-exec         → drop de privilégio para o usuário `node` no entrypoint
RUN apk add --no-cache python3 make g++ curl wget tar git su-exec

# ── gogcli (skill gog) ──────────────────────────────────────────────────────
# Versão pinada + checksum conferido: um `wget` sem verificação aceitaria
# qualquer binário que a URL devolvesse (supply chain).
ARG GOGCLI_VERSION=0.12.0
ARG GOGCLI_SHA256=a03fccbd67ea2e59a26a56e92de8918577f4bebe4b2f946823419777827cdab2

RUN wget -q "https://github.com/steipete/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_amd64.tar.gz" -O /tmp/gogcli.tar.gz \
    && echo "${GOGCLI_SHA256}  /tmp/gogcli.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/gogcli.tar.gz -C /tmp gog \
    && install -m 0755 /tmp/gog /usr/local/bin/gog \
    && rm -rf /tmp/gogcli.tar.gz /tmp/gog

WORKDIR /app

COPY package*.json ./
# --strict-engines não existe no npm 10; o gate real de versão do Node é a
# imagem base acima. Aqui só garantimos que o build falha se um prebuild nativo
# não puder ser instalado.
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY .agents/ ./.agents/

RUN npm run build \
    && npm prune --omit=dev

# Marca o runtime como produção: além do comportamento das libs, é o que liga a
# flag `secure` no cookie de sessão (exigido pelo Caddy, que serve via HTTPS).
ENV NODE_ENV=production

# Diretórios de runtime, já com dono do usuário sem privilégio. O entrypoint
# refaz o chown quando algum deles chega por bind mount com uid divergente.
# Só estes precisam ser graváveis — dist/ e node_modules/ ficam como root.
RUN mkdir -p data tmp outputs public /home/node/.config \
    && chown -R node:node /app/data /app/tmp /app/outputs /app/public /home/node

COPY ops/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

# O container inicia como root só para o entrypoint ajustar o dono dos volumes
# bind-mounted e cai imediatamente para `node` via su-exec. O processo Node
# (o único que expõe superfície de ataque) nunca roda como root.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
