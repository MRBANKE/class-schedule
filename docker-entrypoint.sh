#!/bin/sh
set -e

# 数据目录是从宿主机挂进来的(compose 里的 ./data),Docker 会以 root 身份创建它,
# 而服务本身以非 root 的 node 用户运行 —— 不先交接归属,一启动就写不了课表。
# 所以:以 root 进来,修好权限,再降权成 node 执行真正的命令。
if [ "$(id -u)" = "0" ]; then
  DATA_DIR="${DATA_DIR:-/app/data}"
  mkdir -p "$DATA_DIR"
  # 已经是 node 的就不重复 chown:附件多了以后递归 chown 会拖慢启动
  if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec su-exec node "$@"
fi

exec "$@"
