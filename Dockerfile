# syntax=docker/dockerfile:1

# 默认走官方源,GitHub Actions 与全球用户都能顺利构建。
# 国内网络较慢?用 --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
# 走国内镜像;docker-compose.yml 里也有一处相同的开关。
ARG NODE_IMAGE=node:22-alpine

# ---------- 构建前端 ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# 同上,国内用户可用 --build-arg NPM_REGISTRY=https://registry.npmmirror.com 加速
ARG NPM_REGISTRY="https://registry.npmjs.org"

COPY package.json package-lock.json* ./
# 用 npm ci:严格按 lockfile 安装,构建可复现,且 package.json 与 lock 不一致时直接报错
RUN npm config set registry "$NPM_REGISTRY" \
    && npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- 运行 ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/dist \
    PORT=21873 \
    HOST=0.0.0.0 \
    TZ=Asia/Shanghai

# su-exec 供 entrypoint 降权用(见下)
RUN apk add --no-cache tzdata su-exec

# 服务端零 npm 依赖(只用 node: 内置模块),因此不需要 node_modules
# --chown 必须加:不然这两份文件归 root,切到 node 用户后读不了,容器会一直 EACCES 重启
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 21873

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||21873)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 不写死 USER node:容器以 root 进入 entrypoint,把 bind-mount 挂进来的 ./data
# (归属来自宿主机,构建期 chown 会被运行时覆盖)chown 给 node 后,再 su-exec 降权运行。
# 这样全新宿主机上 docker compose up 一条命令即可,不会因数据目录归 root 而 EACCES 崩溃循环。
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.mjs"]
