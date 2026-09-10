# 课程表 · 家校助手

课程表 + 天气 + 备忘 + 展示看板的一体化应用。前端 React + Vite,后端是一个**零依赖**的 Node HTTP 服务(只用 `node:` 内置模块,没有一个 npm 运行时依赖),所有数据都保存在容器挂载的本地目录里 —— 换手机、换浏览器、清缓存都还是同一份数据。

<div align="center">
  <img src="public/entrance-icon.png" alt="课程表" width="120">
</div>

## ⚠️ 部署提醒(必读)

**本项目的写接口不校验登录**,是刻意保留的:家长走 `/admin` 是免密入口、看板页也要写备忘,登录只用于 `/superadmin` 管理界面。因此:

- ✅ 部署在**家庭内网 / NAS / 小主机**,没问题
- ❌ **不要直接暴露到公网**。要暴露的话,请在前面套一层反向代理(Nginx / Caddy + Basic Auth,或 frp + 白名单)做整体鉴权

---

## 快速开始 · 拉预构建镜像(推荐)

**1. 新建一个目录,里面放这个 `docker-compose.yml`**:

```yaml
services:
  class-schedule:
    image: ghcr.io/mrbanke/class-schedule:latest
    container_name: class-schedule
    restart: unless-stopped
    ports:
      - "21873:21873"
    volumes:
      - ./data:/app/data
    environment:
      TZ: Asia/Shanghai
      # 你自己的对外访问地址(分享到微信生成图文卡片时会用到)
      # PUBLIC_ORIGIN: "https://your-domain.example.com"
```

**2. 一条命令启动**:

```bash
docker compose up -d
```

**3. 浏览器打开** `http://<机器IP>:21873/superadmin`,首次会引导你创建超管账号,登进去添加学生即可。

镜像支持 `linux/amd64` 和 `linux/arm64`(树莓派、Apple Silicon Mac 都能跑)。

## 快速开始 · 从源码构建

想改代码或者不想拉预构建镜像:

```bash
git clone https://github.com/MRBANKE/class-schedule.git
cd class-schedule
docker compose up -d --build
```

国内网络较慢的话,打开 `docker-compose.yml`,把 `image:` 那行注释掉、启用下面的 `build:` 段,并把 `NPM_REGISTRY` / `NODE_IMAGE` 改成国内镜像(注释里有示例)。

## 访问地址

| 用途 | 地址 | 说明 |
| --- | --- | --- |
| 学生主页 | `http://IP:21873/?id=<学生ID>` | 日常查看当天课程,**必须带 `?id=`** |
| 家长后台 | `http://IP:21873/admin?id=<学生ID>` | 免密进入,改课表 / 课程库 / 备忘 |
| 展示看板 | `http://IP:21873/board?id=<学生ID>` | 平板 / 墨水屏 / 电视常亮用 |
| 超管 | `http://IP:21873/superadmin` | 账号密码,管理学生列表与全局设置 |

学生 ID 在超管里创建学生时生成,后台「基本信息」里可以直接复制各个链接。

## 数据保存与备份

全部在 compose 挂载的 `./data` 目录(容器内 `/app/data`):

```
data/
├── config.json        # 课表配置:学生、课程库、节次、假期(引用头像)
├── memos.json         # 备忘(文字、提醒时间)
├── avatars/           # 头像文件本体
├── attachments/       # 备忘附件本体(图片/视频/音频/文件)+ .meta.json
├── auth.json          # 超管账号(scrypt 加盐哈希)
├── sessions.json      # 登录会话
└── cache/             # 节假日数据缓存(可随时删)
```

- **备份**:`cp -r data data-backup-$(date +%F)`,不必停服务
- **恢复**:把 `data/` 拷回原位,`docker compose up -d`
- **迁移**:整个项目目录(含 `data/`)拷到新机器,再 `docker compose up -d`

## 环境变量

在 `docker-compose.yml` 的 `environment` 里改,改完 `docker compose up -d`。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `21873` | 容器内监听端口(改对外端口请改 compose 的 `ports`) |
| `PUBLIC_ORIGIN` | 空 | 对外访问根地址,如 `https://kcb.example.com`。分享到微信 / QQ 生成图文卡片时,配图和链接要用绝对地址;留空则按请求头推断(反代后面可能不准) |
| `DATA_DIR` | `/app/data` | 数据目录,不建议改 |
| `TZ` | `Asia/Shanghai` | 时区。错了会导致"今天是周几"和上课高亮不对 |
| `MAX_UPLOAD_MB` | `512` | 单个附件上限(要传长视频就调大) |
| `MAX_JSON_MB` | `64` | 配置/备忘单次提交上限 |
| `PRUNE_GRACE_HOURS` | `6` | 附件回收宽限期:刚上传还没保存进备忘的附件,这段时间内不会被清掉 |

## 常用命令

```bash
docker compose logs -f          # 看日志
docker compose restart          # 重启(数据不丢)
docker compose down             # 停掉(数据不丢,在 ./data 里)
docker compose pull             # 拉最新镜像
docker compose up -d            # 拉完后重启使用新镜像
```

## 分享到微信显示图文卡片

把学生课表链接发到微信,想显示成带图文的卡片而不是一串网址 —— 已经内置支持,不需要公众号 / 小程序 / 后端签名:

- 服务端会按 `?id=` 给每个页面注入 Open Graph 标签(`og:title` / `og:description` / `og:image` / `og:url`)
  - **标题** = 该学生的标题
  - **描述** = 后台「分享描述」里填的内容,留空则按标题自动生成
  - **配图** = 该学生的头像(没设头像时用入口图)
- 前提:`PUBLIC_ORIGIN` 要配成用户实际访问的域名(微信要求配图 / 链接是绝对地址)

两个使用注意(属于微信机制,与本项目代码无关):

1. **直接把链接粘到聊天框仍是纯文本**。微信只对"在内置浏览器里打开过再分享"的链接抓卡片。首次可以:发到「文件传输助手」→ 长按 →「搜一搜」→「访问网页」→ 右上角「···」→「分享给朋友」,这次就是卡片了;之后再分享都会优先显示卡片
2. **新域名可能被拦("无法确认安全性")**。到 <https://urlsec.qq.com> 提交申诉,一般 1–2 个工作日解除

分享配图建议正方形(微信按 478×478 裁剪)、`< 2MB`、JPG / PNG —— 后台上传的头像满足即可。

## 本地开发

需要两个进程:后端提供 `/api`,Vite 提供热更新并把 `/api` 代理过去。

```bash
npm install
npm run dev:server   # 后端,数据落在 ./.data,端口 8787
npm run dev          # 前端 http://localhost:3000
```

其他脚本:

```bash
npm run typecheck    # tsc
npm run lint         # oxlint
npm run build        # 产出 dist/
npm run serve        # 用后端直接托管 dist/(生产模式,默认端口 21873)
```

## 项目结构

```
server/            零 npm 依赖的后端(只用 node: 内置模块)
├── index.mjs      HTTP 入口:静态托管 dist/ + /api 路由
├── store.mjs      数据落盘:原子写(.tmp + rename)、写入串行排队、附件回收
├── static.mjs     静态文件:MIME、ETag/304、Range/206(视频拖进度条)、SPA 回落
└── upstream.mjs   外网代理:中国天气网、节假日数据(带缓存与降级)

src/api/
├── client.ts      前端唯一的数据出入口:启动时 /api/state 灌满缓存,
│                  读走同步缓存、写乐观更新 + PUT,失败回滚;
│                  轮询 /api/rev 做跨设备同步
└── migrate.ts     老浏览器数据(localStorage / IndexedDB)一次性上传
```

天气取自中国天气网,由后端反代(浏览器直连会被跨域拦掉);节假日优先走后端 `/api/holidays/<年>`,后端会去试几个公开数据源并把结果缓存到 `data/cache/`,拿不到时回落到缓存,离线也能用。

## License

[MIT](LICENSE) © 2026 MRBANK
