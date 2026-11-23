# Sketch Plan · 单镜像（Node 22 自带 SQLite，无需外部数据库）
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4310 \
    DATA_DIR=/data \
    TZ=Asia/Shanghai

COPY index.html auth.html manifest.webmanifest ./
COPY assets ./assets
COPY server ./server

# ./data 在 compose 里绑定挂载；容器内需要写权限，因此保持 root 运行
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4310

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4310)+'/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
