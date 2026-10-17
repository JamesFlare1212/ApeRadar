# 架构与行为

## Game client discovery and region selection

`game-discovery.ts` reads current WGC path-pointer records and modern nested Steam
KeyValues libraries/manifests. It performs bounded reads, validates Steam app ID
552990, rejects manifest path traversal, resolves canonical installation paths,
and merges Windows paths without case sensitivity. Discovery never launches the
game or modifies its files.

`game-client.ts` verifies PE executable headers, the current 64-bit layout, and the
build recorded as installed by WGC. An incomplete installed build is rejected;
an older build is not silently substituted. Clients without WGC metadata use the
newest complete numeric build directory. Installation labels such as `WW` remain
separate from the API region.

AUTO is the default for new settings. Region detection compares the active server
in the game preferences with the latest realm in a bounded startup-log tail. The
preferences reader extracts only the relevant section because other game element
names need not be valid XML. Startup logs older than 24 hours are ignored. Missing,
unrecognized, unsupported, and conflicting evidence have explicit results; no
region is guessed. A manually selected region takes precedence.

Each query resolves its routing before consulting player caches. Settings changes
cancel pending resolution and requests, and disabling mixed regions restores the
primary region for both teams. Monitor generations prevent a paused or replaced
scan from importing a battle. API health checks report unresolved routing without
probing an arbitrary region.

The settings page discovers clients on entry, selects a sole candidate only when
the path is empty, and preserves an existing path or manual region selection. It
shows directory validation, evidence timestamps, conflicts, and waiting-for-arena
states separately. Browser development previews can use `APERADAR_DATA_DIR` for an
isolated database, matching the desktop test workflow.

## 工作区边界

项目使用 pnpm workspace，参考 T3 Code 将应用拆分为 `apps/desktop`、`apps/server`、`apps/web`，跨应用逻辑放在 `packages/shared`。根目录维护统一命令、锁文件、TypeScript 基础选项及跨包测试，各包独立声明依赖与类型检查配置。

- `@aperadar/shared`：可在浏览器和 Node 中使用的类型、Zod 校验、统计算法与摘要。
- `@aperadar/server`：Node 服务、SQLite、文件解析与监测、API 调度；船表位于其 `resources/`。
- `@aperadar/web`：React 界面与设计令牌；仅 Vite 开发配置依赖服务端，浏览器代码通过类型桥访问服务。
- `@aperadar/desktop`：Electron 主进程、preload、图标、构建和烟雾验证脚本，依赖 server 与 shared。

共享包通过 exports 导出 TypeScript 源码，Vite/esbuild 解析 workspace 链接并完成打包。`pnpm build` 先检查全部包与测试的类型，再构建 web 和 desktop；server 与 shared 随主进程打包。桌面打包配置在 `apps/desktop/electron-builder.json`，将 web 的 dist、server 的船表及根目录版权声明映射到成品，Windows 输出保留在根目录 `release/`。

开发资源路径根据各配置或脚本文件的位置确定。浏览器数据库仍在根目录 `.data/web/`，集成测试与桌面验证仍使用根目录 `.test-data/`，报告统一写入 `artifacts/`。生产应用从 app 路径读取打包资源，数据库使用 Electron userData。

Renderer 只持有可序列化状态与界面逻辑。它通过 `RadarBridge` 的逐项方法访问主进程；没有任意 IPC、路径读取、SQL 或 shell 入口。生产页面由 `aperadar://app/` 提供，只能加载打包的本地资源。

主进程拥有 `RadarService`。服务管理当前对局、取消令牌、逐玩家进度、自动监测和事件发布；`RadarDatabase` 负责 SQLite；`WargamingApi` 负责受限域名、HTTP 状态、超时、退避与协议解析。共享的 TypeScript 类型并不能替代边界检查，因此文件、设置、关注项与 IPC 参数还使用 Zod 校验。

浏览器开发模式在 Vite 中挂载同一个 Node 服务，接口只绑定 loopback、检查 Host/Origin，并要求写操作的本地客户端标头。SSE 用于状态变更。生产桌面不启动 HTTP 服务。

## 对局生命周期

1. 有界读取 JSON 或 replay 第一块，校验阵容 schema；不加载整个大型 replay。
2. 解析主/次区服，按本地船表补充展示信息；车辆 ID 不当作账号 ID。
3. 导入新对局时取消旧 controller，并保存未查询的本地快照。
4. 查询优先读取未过期缓存；缺失项进入最多六个并发 HTTP 槽位，按时间错开发送。
5. 每位玩家分别回写，回调必须同时匹配 controller、battle ID 与玩家 key。旧请求即使忽略 abort，也不能覆盖新对局。
6. 完成后保存快照与历史；失败项维持 unavailable，不写成 hidden/零胜率，也不进入有效缓存。

单船分模式请求不齐全时，保留账号公开统计并显示部分错误；本舰指标不伪装成零场。取消保留已取得数据。切换显示胜率或主题不会取消查询；更改区服/数据源会清理旧路由的统计。

## SQLite

- `settings`：单行经过校验的设置。
- `battles`：以确定性 battle ID 保存 JSON 快照；历史按开始时间排序，界面最多读取最近100条。
- `metadata`：当前快照指针。
- `watchlist`：主键为 region/account_id，保存手动标记和备注。
- `statistics_cache`：按 API/区服/昵称/船号缓存，有 expires_at 索引；仅完整公开数据或明确隐藏状态进入缓存。

使用 WAL、busy timeout、参数化语句与对局保存事务。数据库 schema 为 user_version 1；未来更改需要显式迁移，不应覆盖用户数据。

## 设计系统

原始 HSL、尺寸、字体与动效仅定义在 primitive 层；背景/前景/主色/双方阵营等是 semantic 别名；按钮、卡片、输入和表格有 component 令牌。暗色主题覆盖 semantic 层。Tailwind v4 在 `@theme inline` 映射语义 token，界面使用本地 Inter 字体、系统中文字体与 Font Awesome Free SVG 图标。图标通过统一的 Icon 组件设置尺寸和装饰性语义，按需导入并本地打包，Font Awesome CSS 显式加载且关闭运行时样式注入。

Radix 提供对话框与下拉菜单。受控对话框显式恢复触发元素焦点；阵容保留游戏文件中的原始顺序，战绩查询只更新原位置，搜索与舰种筛选保持剩余行的相对顺序。图表提供文本说明，姓名遮蔽也应用到摘要与 CSV。

## 外部依赖与取舍

网络适配器按已恢复的客户端协议实现，不推定第三方服务内部机制。WG 采用三次共享请求与每玩家一次本舰请求；Vortex 可在明确隐藏时提前结束后续详情。代理只影响指定 WG 请求，界面明确它会收到查询信息。没有整场上传模块。

应用使用 Electron 内置 Node 24 的 `node:sqlite`，无需 native addon 重编译。主进程与 preload 由 esbuild 输出 CJS，React 由 Vite 构建；设置和资料页面懒加载。资源在 asar 内，数据库始终放用户数据目录。

Windows打包使用已安装的 Electron distribution。Vite 忽略缓存、打包输出、研究和数据目录，避免 Windows 在开发文件监听期间锁住正在重命名的打包临时目录。正式包不需要 Vite 或本地开发服务器。
