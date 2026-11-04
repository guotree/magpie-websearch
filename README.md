# magpie-websearch

[中文说明](README.md) | [English](README.en.md)

为 [magpie](https://usemagpie.ai) 增加的第三方多源网页搜索 API 插件。安装后，这些搜索 API 会出现在 **设置 › 模型 › 网页搜索**（Settings › Models › Web search）中，由 Magpie 统一管理其密钥、启用开关与请求调度顺序。

当前支持厂商：**AnySearch**、**Keenable**、**Linkup**、**Metaso**、**Parallel**、**Querit**、**SerpApi**、**TinyFish**。
其中 AnySearch、Keenable、Parallel 和 TinyFish 支持免 Key 匿名搜索；Linkup、Metaso、Querit 和 SerpApi 需要配置 API Key。详见 [PROVIDERS.md](PROVIDERS.md)。

## 隐私与安全 (Privacy & Security)

- **直连官方端点**：所有搜索请求均严格直接发往各厂商官方 API 端点，或发送至用户显式配置的自定义 Base URL 代理。
- **零对话泄露**：插件仅发送搜索关键词（Query）以及必要的分页/过滤参数。绝不读取、访问或转发任何对话记录、系统提示词、本地文件、工具输出或 Agent 上下文。
- **凭证管理与错误保护**：API Key 由 Magpie 统一管理，按厂商规范通过请求头或鉴权参数发送。SerpApi 的插件错误使用固定说明，省略底层异常和上游正文；其他厂商沿用各自的诊断处理。插件无法控制官方服务或自建代理的访问日志。
- **绝不静默降级**：对于配置了 Key 的搜索项，若 Key 无效或额度耗尽，插件会明确向 Magpie 报告失败，**绝不静默降级为匿名搜索**，确保私有请求不会意外流向公共端点。

## 安装

```sh
magpie plugin add @guotree/magpie-websearch
# 或从 GitHub 安装
magpie plugin add github:guotree/magpie-websearch
```

本插件注册的短名称为 `magpie-websearch`，对应的厂商 Vendor ID 为：

```text
magpie-websearch:anysearch
magpie-websearch:keenable
magpie-websearch:linkup
magpie-websearch:metaso
magpie-websearch:parallel
magpie-websearch:querit
magpie-websearch:serpapi
magpie-websearch:tinyfish
```

## 配置使用

### 图形界面配置

在 Magpie 桌面客户端中：前往 **设置 › 模型 › 网页搜索**（Settings › Models › Web search），添加你需要的搜索引擎，开启开关并调整优先级顺序。
- 对于 AnySearch、Keenable、Parallel、TinyFish，留空 Key 即可使用匿名免 Key 搜索；填写 Key 则使用你的私人账户额度。
- 对于 Linkup、Metaso、Querit、SerpApi，必须填写对应的 API Key。

无需强制配置插件选项。在未配置过滤选项时，默认注册全部 8 个搜索 API，由 Magpie 的网页搜索设置界面决定启用哪些和使用顺序。

### 自定义 Base URL 说明

可选的 **Base URL** 字段用于将请求转发到你自建的兼容服务或反向代理。若使用官方服务，请保持该字段留空。
**当填写自定义 Base URL 时，插件将其视为精确的目标端点地址，请求会直接发往该完整地址，不会自动追加任何路径。**
例如：若你的代理服务器将 Linkup 搜索挂载在 `https://search.example.com/proxy/v1/search`，请直接输入该完整地址；若代理服务在根路径响应，请输入 `https://proxy.example.com/`。

仅支持 HTTP 和 HTTPS 协议；地址中包含认证凭据（username/password）、查询字符串（`?query`）或锚点（`#hash`）将被拒绝。请将 API Key 保留在 Magpie 专用的 Key 输入框中。

对于双模接入厂商（Parallel 和 TinyFish），若在匿名（MCP）和带 Key 模式之间切换，请确保你的自定义地址与当前所选协议匹配（例如匿名填 `/mcp`，带 Key 填实际搜索接口）；留空则会自动选择官方默认端点。详见下文的 [Parallel 搜索](#parallel-搜索) 与 [TinyFish 搜索](#tinyfish-搜索)。

### 命令行配置示例

```sh
# AnySearch、Keenable、Parallel、TinyFish：留空 key 即可开启匿名搜索
magpie search add magpie-websearch:anysearch
magpie search add magpie-websearch:keenable
magpie search add magpie-websearch:parallel
magpie search add magpie-websearch:tinyfish

# 或提供 key 使用自有账户
magpie search add magpie-websearch:anysearch <key>
magpie search add magpie-websearch:keenable <key>
magpie search add magpie-websearch:parallel <key>
magpie search add magpie-websearch:tinyfish <key>

# Linkup：必须提供 key
magpie search add magpie-websearch:linkup <key>

# Metaso：必须提供 key
magpie search add magpie-websearch:metaso <key>

# Querit：必须提供 key
magpie search add magpie-websearch:querit <key>

# SerpApi：必须提供 key
magpie search add magpie-websearch:serpapi <key>

# 使用自定义端点代理
magpie search add magpie-websearch:linkup <key> url=https://search.example.com/proxy/v1/search
```

为一个 API 配置多个 Key 时使用英文逗号分隔，Magpie 会依次轮询并在某个 Key 被拒绝时将其暂时休眠：

休眠会将该 Key 排在同一 API 的健康 Key 之后，不会完全禁用它；只有一个 Key 或全部 Key 都休眠时，宿主仍可能尝试它们。

```sh
magpie search add magpie-websearch:linkup key1,key2
```

调整优先级、停用或移除：

```sh
magpie search move magpie-websearch:anysearch 1
magpie search off magpie-websearch:keenable
magpie search on magpie-websearch:keenable
magpie search rm magpie-websearch:linkup
```

运行 `magpie search` 可列出当前 Magpie 识别的所有搜索 API（包含本插件注入的项）。

### 匿名搜索机制

AnySearch 在同一接口上省略 Authorization 请求头；Keenable 使用 `/v1/search/public` 端点并附带 `keenable.title` 所配置的应用标头；Parallel 免 Key 调用其托管的 MCP 搜索；TinyFish 免 Key 调用其托管的 MCP 搜索并附带 `X-TinyFish-Access-Mode: keyless` 标头。这四者因在插件中声明了 `keyOptional: true`，在 GUI 中留空 Key 即可正常保存和使用。

若配置的 Key 无效或额度用尽，插件会直接报错，**绝不会自动降级为匿名搜索**。对于已有 Key 的条目，编辑时留空 Key 仍会保留原本已存的 Key；若要切换为匿名模式，请先移除条目，再重新无 Key 添加该条目并重新设定参数。

AnySearch 与 Keenable 的匿名额度基于公网出口 IP 共享；Parallel 与 TinyFish 的匿名配额范围及确切上限以上游实际策略为准。当遇到 HTTP 429 时，插件会对该端点的匿名请求启动冷静期（Duration 优先取 `Retry-After`，若无或无效则默认 60 秒）。冷静期间新请求直接返回 429 而不再向远端发起连接，Magpie 会自动回退并调度下一配置通道。缓存中的结果仍可正常读取，且配置了 Key 的请求完全不受匿名冷静期限制。冷静期保存在插件实例内存中，重启后重置。

### Parallel 搜索

Parallel 提供两种访问链路，由 Magpie 传入的 Key 决定：

| 访问方式 | 默认端点 | 请求方式 |
|---|---|---|
| 匿名（Key 留空） | `https://mcp.parallel.ai/mcp` | POST JSON-RPC `tools/call`，调用 `web_search` |
| 配置了 Key | `https://api.parallel.ai/v1/search` | POST，请求头携带 `x-api-key` 与嵌套的 `advanced_settings` |

匿名请求直接调用 `web_search` 工具，无需 session 握手。插件支持读取 JSON 与 SSE 响应，校验 JSON-RPC 与工具级错误，并从结构化内容或文本部分提取结果。带 Key 请求走官方正式 `/v1/search` 接口。两条链路均支持 1–200 字符的关键词检索（Parallel 官方设定的查询长度限制）。

Parallel 托管 MCP 服务默认运行于 `fast` 模式。若配置了 `parallel.mode` 为其他模式（`turbo`、`basic` 或 `advanced`），匿名请求会在发起前直接报错并提示需要填入 Key。在配置 Key 的情况下，REST 接口支持全部四种模式。

Parallel 公开搜索上限为 20 条，插件请求最多 20 条并在本地根据 Magpie 要求与 `parallel.maxResults` 截断。`text` 字段由 `excerpts` 以 `\n\n` 拼接并截断至 `parallel.contentChars`（默认 4000 字符，配置 `0` 保留全文）。`publish_date` 保留原始日期字符串作为 `age`。

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过：免 Key 调用的 `tools/call` 对中英文检索均正常返回 HTTP 200 与搜索结果。配置了 Key 时始终严格走 REST，即便 Key 欠费或无效也绝不静默降级为 MCP。

### TinyFish 搜索

TinyFish 提供两种访问链路，由 Magpie 传入的 Key 决定：

| 访问方式 | 默认端点 | 请求方式 |
|---|---|---|
| 匿名（Key 留空） | `https://agent.tinyfish.ai/mcp` | POST JSON-RPC `tools/call`，调用 `search`，头附带 `X-TinyFish-Access-Mode: keyless` |
| 配置了 Key | `https://api.search.tinyfish.ai/` | GET，URL 参数编码，头附带 `X-API-Key` |

匿名请求直接调用 `search` 工具，无需 session 握手。支持 JSON 与 SSE 响应，自动处理提取。带 Key 请求为无 Body 的 GET 请求。两条链路均支持 1–2000 字符的规范化查询。TinyFish 不接受分页结果数传参，固定返回一页，插件在剔除无 URL 的脏数据后在本地截取前 N 条（`tinyfish.maxResults`）。`text` 为摘要内容，`age` 保留原始日期字符串（包括可读自然语言日期）。

两条链路均支持配置国家地区（location）、语言（language）、域名过滤（include/exclude domains）以及 `web`、`news` 类型。**学术论文搜索（`research_paper`）必须有 Key**，若在匿名下选择该模式会在发起请求前直接报错阻断。

例如配置中文新闻搜索且本地上限为 4 条：

```sh
magpie plugin options magpie-websearch '{"tinyfish":{"language":"zh","domainType":"news","maxResults":4}}'
```

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过。配置了 Key 时始终严格走 REST，绝不静默降级为 MCP。自定义端点须匹配协议类型（例如匿名代理为 `/proxy/mcp`，REST 代理为 `/proxy/search`）。

### SerpApi 搜索

SerpApi 接入官方 Google Search 接口，支持通过 SerpApi 聚合获取全球 Google 自然搜索结果：

- **请求方式**：GET `https://serpapi.com/search`，参数由 URL 编码，凭证通过 `api_key` 参数传递。
- **凭证安全**：SerpApi 的网络、HTTP、解析和状态错误只返回固定说明及必要的状态码，不附带原始异常、响应体、请求 URL 或底层 `cause`。请求不自动跟随重定向。此保护针对插件生成的错误和诊断，不能控制服务端或自建代理的日志，也不会改写正常网页结果内容。
- **结果解析**：仅读取 `organic_results` 自然搜索条目，丢弃无 URL 的条目，保留原始日期作为 `age`。由于 Google 官方已废弃 `num` 结果数参数，单页结果通过本地截取（`serpapi.maxResults`）。
- **空结果与缓存**：接受无错误的空数组，或 `status: "Success"` 加 `organic_results_state: "Fully empty"` 的官方空结果（允许附带空结果错误字符串）。结果字段为 `null`、未知状态和无法解释的错误均抛错且不缓存。合法空结果最多缓存 30 秒，`cacheTTL: 0` 关闭插件缓存。Magpie 在没有其他可用结果时会显示 `found nothing`。
- **自定义参数**：支持配置国家代码（`gl`）、界面语言代码（`hl`）、发起地点（`location`）、Google 域名（`googleDomain`）与安全搜索（`safe`）。

`hl` 控制界面语言，`gl` 为国家偏好，两者不等于严格限制结果语言或来源国家。仅请求一页，不自动翻页；`maxResults` 的 1–10 是插件的本地上限，结果可能更少。关闭插件缓存不会关闭 SerpApi 的服务端缓存。按[官方计费说明](https://serpapi.com/pricing)，成功空结果也可能计费，减少本地条数不会减少单次搜索费用。

## 厂商特性概览

| 显示名称 | Vendor ID | Key 需求 | 特性与说明 |
|---|---|---|---|
| AnySearch (magpie-websearch) | `magpie-websearch:anysearch` | 可选（免Key/有Key） | 意图路由、`cn`/`intl` 分区支持、Markdown/JSON 输出格式 |
| Keenable (magpie-websearch) | `magpie-websearch:keenable` | 可选（免Key/有Key） | 匿名走 `/public` 端点；支持 `pro` 与 `realtime` 模式 |
| Linkup (magpie-websearch) | `magpie-websearch:linkup` | 必填 | 结果为针对问题的精准提炼摘录；深度调整影响召回率而非文本冗余 |
| Metaso (magpie-websearch) | `magpie-websearch:metaso` | 必填 | 秘塔 AI 搜索；支持细分搜索范围（网页、论文等）并保留日期 |
| Parallel (magpie-websearch) | `magpie-websearch:parallel` | 可选（免Key/有Key） | 匿名 MCP（fast 模式）或鉴权 REST；本地摘录合并与条数截断 |
| Querit (magpie-websearch) | `magpie-websearch:querit` | 必填 | 提供摘要或拼接匹配句；可通过 `querit.count` 调整上限 |
| SerpApi (magpie-websearch) | `magpie-websearch:serpapi` | 必填 | Google 自然搜索；插件错误省略敏感请求信息；支持地区语言与安全搜索配置 |
| TinyFish (magpie-websearch) | `magpie-websearch:tinyfish` | 可选（免Key/有Key） | 匿名 MCP 或鉴权 REST；支持新闻/网页/论文检索及地区语言过滤 |

所有由本插件注入的搜索项在 Magpie 界面中均以 `<Provider> (magpie-websearch)` 结尾显示，以清晰标识其来源。内部 Vendor ID 始终保持为 `magpie-websearch:<id>`，保证已有配置及 Key 的持久兼容。

## Magpie 结果处理规范

- `count` 默认上限为 6：适配器在支持的接口中最多申请 6 条结果；对固定返回单页的接口在本地截取前 6 条。
- `text` 会自动剔除 HTML 标签、反转义字符、折叠多余空白并截断至 1500 字节。
- `age` 保留厂商返回的原生时间字符串，插件不作猜测与改写。
- 自动剔除不包含 URL 的无效结果。
- 抛出带有数值型 `status`（401、402、403、429）的错误被 Magpie 识别为服务商拒绝；对于带 Key 请求，Magpie 会休眠该 Key 并尝试下一个。匿名 429 冷却由本插件自主管理；失败时会触发 Magpie 调度下一可用引擎。
- 429 响应的 `Retry-After` 会保留；SerpApi 仅传递校验和规范化后的整数秒数或标准 HTTP 日期，无效值忽略。

## 详细配置参考

所有选项均为可选，包括各厂商的子对象字段以及顶层的 `enable`/`disable` 过滤器。未设置的字段将自动回退到对应的环境变量，若环境变量亦未定义则使用默认值。

在桌面客户端中通过 **Plugins → Installed → Options** 配置，或通过命令行传递 JSON 对象。例如仅调整特定引擎参数而保持全量注册：

```sh
magpie plugin options magpie-websearch '{"linkup":{"depth":"deep","maxResults":4,"timeout":25000,"cacheTTL":600000},"anysearch":{"zone":"cn","language":"zh-CN"}}'
```

保存配置后 Magpie 会自动重载插件宿主进程。

参数解析优先级：**显式插件选项 → 环境变量 → 默认值**。数值类型必须为 JSON 整数；`timeout` 与 `cacheTTL` 单位为毫秒。设置 `timeout: 0` 相当于取消插件自身的超时保护（Magpie 宿主的超时仍生效）；设置 `cacheTTL: 0` 则关闭内存缓存。

各厂商配置项清单：

| 厂商 | 选项名 | 环境变量 | 默认值 | 可选值 / 说明 |
|---|---|---|---|---|
| anysearch | `cacheTTL` | `ANYSEARCH_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| anysearch | `maxResults` | `ANYSEARCH_MAX_RESULTS` | `10` | 1–10；请求结果上限 |
| anysearch | `tag` | `ANYSEARCH_TAG` | 留空 | 意图标签，例如 `code.snippet` |
| anysearch | `zone` | `ANYSEARCH_ZONE` | 留空 | 留空、`cn`、`intl` |
| anysearch | `language` | `ANYSEARCH_LANGUAGE` | 留空 | 语言代码，例如 `zh-CN` |
| anysearch | `format` | `ANYSEARCH_FORMAT` | `markdown` | `markdown`、`json` |
| anysearch | `timeout` | `ANYSEARCH_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| keenable | `cacheTTL` | `KEENABLE_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| keenable | `maxResults` | `KEENABLE_MAX_RESULTS` | `10` | 1–50 |
| keenable | `mode` | `KEENABLE_MODE` | 留空 | 留空、`pro`、`realtime` |
| keenable | `title` | `KEENABLE_TITLE` | `magpie-websearch` | `X-Keenable-Title` 标头，最长 256 字符 |
| keenable | `timeout` | `KEENABLE_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| linkup | `cacheTTL` | `LINKUP_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| linkup | `depth` | `LINKUP_DEPTH` | `fast` | `flash`、`fast`、`standard`、`deep` |
| linkup | `maxResults` | `LINKUP_MAX_RESULTS` | `10` | 1–100 |
| linkup | `contentChars` | `LINKUP_CONTENT_CHARS` | `4000` | 摘录字数上限（`0` 代表不截断） |
| linkup | `timeout` | `LINKUP_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| metaso | `cacheTTL` | `METASO_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| metaso | `scope` | `METASO_SCOPE` | `webpage` | `webpage`、`document`、`paper`、`image`、`video`、`podcast` |
| metaso | `maxResults` | `METASO_MAX_RESULTS` | `10` | 1–50 |
| metaso | `contentChars` | `METASO_CONTENT_CHARS` | `4000` | 摘录字数上限（`0` 代表不截断） |
| metaso | `timeout` | `METASO_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| parallel | `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| parallel | `timeout` | `PARALLEL_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| parallel | `maxResults` | `PARALLEL_MAX_RESULTS` | `10` | 1–20 |
| parallel | `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | 摘录拼接字数上限（`0` 代表不截断） |
| parallel | `mode` | `PARALLEL_MODE` | `fast` | `fast`、`turbo`、`basic`、`advanced`（非 fast 模式需填 Key） |
| querit | `cacheTTL` | `QUERIT_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| querit | `count` | `QUERIT_COUNT` | `8` | 结果数上限，≥ 1 |
| querit | `timeout` | `QUERIT_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `cacheTTL` | `SERPAPI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| serpapi | `timeout` | `SERPAPI_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `maxResults` | `SERPAPI_MAX_RESULTS` | `10` | 1–10；本地截取上限 |
| serpapi | `location` | `SERPAPI_LOCATION` | 留空 | 发起地点，例如 `Austin, Texas, United States` |
| serpapi | `gl` | `SERPAPI_GL` | 留空 | 国家代码，例如 `us` |
| serpapi | `hl` | `SERPAPI_HL` | 留空 | 界面语言代码，例如 `zh-cn` |
| serpapi | `googleDomain` | `SERPAPI_GOOGLE_DOMAIN` | 留空 | Google 域名，例如 `google.com` |
| serpapi | `safe` | `SERPAPI_SAFE` | 留空 | 留空、`active`、`off` |
| tinyfish | `cacheTTL` | `TINYFISH_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| tinyfish | `timeout` | `TINYFISH_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| tinyfish | `maxResults` | `TINYFISH_MAX_RESULTS` | `10` | 本地截取上限，≥ 1 |
| tinyfish | `location` | `TINYFISH_LOCATION` | 留空 | 国家地区代码，如 `US` |
| tinyfish | `language` | `TINYFISH_LANGUAGE` | 留空 | 语言代码，如 `zh` |
| tinyfish | `domainType` | `TINYFISH_DOMAIN_TYPE` | `web` | `web`、`news`、`research_paper`（学术论文模式需填 Key） |
| tinyfish | `includeDomains` | `TINYFISH_INCLUDE_DOMAINS` | 留空 | 包含域名列表（逗号分隔） |
| tinyfish | `excludeDomains` | `TINYFISH_EXCLUDE_DOMAINS` | 留空 | 排除域名列表（逗号分隔） |

### 可选注册过滤 (enable / disable)

顶层的 `enable` 与 `disable` 数组可控制插件向 Magpie 注册哪些 API。传入短名称（如 `linkup`，不带 `magpie-websearch:` 前缀）。

| 过滤器设置 | 实际向 Magpie 注册的 API |
|---|---|
| 省略未设，或 `{}` | 全部 8 个 API 均注册 |
| `"enable": ["linkup", "querit"]` | 仅注册 Linkup 与 Querit |
| `"disable": ["keenable"]` | 注册除 Keenable 外的其余 7 个 |
| `"enable": ["linkup", "querit"], "disable": ["querit"]` | 仅注册 Linkup（`disable` 优先级高于 `enable`） |
| `"enable": []` | 一个都不注册 |
| `"disable": []` | 全部 8 个均注册 |

示例：过滤掉 Keenable，同时指定 Linkup 深度搜索参数：

```sh
magpie plugin options magpie-websearch '{"disable":["keenable"],"linkup":{"depth":"deep","maxResults":4}}'
```

重置并恢复所有插件设置为默认：

```sh
magpie plugin options magpie-websearch off
```

## 开发与本地测试

```sh
npm test          # node:test 单元测试（无依赖）
npm run check     # 校验 index.mjs 导出的 search hook 契约格式
npm run check:bun # 在 Bun 运行时下运行相同测试
npm run smoke:magpie # 在独立沙箱中启动真实 Magpie 进程进行完整烟雾测试
```

Magpie 官方通过托管的 **Bun** 运行插件。基于 Node 的开发测试要求 **Node.js 20.3.0 或更新版本**（依赖 `AbortSignal.any` 组合超时和取消信号）。

`npm run smoke:magpie` 测试脚本要求环境变量 PATH 中存在 `magpie` 可执行文件（或通过 `MAGPIE_BIN` 指定）。脚本会创建独立的沙箱配置环境、隔离账户发现、在随机回环端口启动网关，全面验证插件加载、注册过滤、自定义 URL、超时中断、匿名 429 冷却与降级回退、Parallel 及 TinyFish 的 MCP 与 REST 协议兼容。测试完成后自动清理沙箱，全程使用本地 Fake 服务，不产生真实外部请求与扣费。

测试验证环境基准：**magpie 0.1.2911** 与 **Bun 1.4.4**。

## 鸣谢 (Acknowledgements)

适配器设计与响应测试用例最初基于 [guotree/opencode-search-plugin](https://github.com/guotree/opencode-search-plugin) v4.6.1。

## 开源协议

MIT
