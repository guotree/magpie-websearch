# 技术参考

[中文说明](technical-reference.md) | [English](technical-reference.en.md) · [返回 README](../README.md)

本页说明配置、协议、结果处理和开发验证。安装与快速上手见 [README](../README.md)，支持状态与接入规范见 [PROVIDERS.md](../PROVIDERS.md)。

- [配置入口](#setup)
- [自定义 Base URL](#custom-base-url)
- [命令行管理](#cli)
- [匿名搜索与限流](#anonymous-search)
- [Parallel](#parallel-search)、[TinyFish](#tinyfish-search)、[SerpApi](#serpapi-search)、[Moonshot 与 Moonshot CN](#moonshot-search)、[StepFun](#stepfun-search)、[Zhipu 与 Z.ai](#zhipu-search) 协议说明
- [Magpie 结果处理](#result-processing)
- [完整配置参考](#configuration)
- [注册过滤](#registration-filters)
- [开发与本地测试](#development)

<a id="setup"></a>

## 配置入口

### 图形界面配置

在 Magpie 桌面客户端中：前往 **设置 › 模型 › 网页搜索**（Settings › Models › Web search），添加你需要的搜索引擎，开启开关并调整优先级顺序。

- 对于 AnySearch、Keenable、Parallel、TinyFish，留空 Key 即可使用匿名免 Key 搜索；填写 Key 则使用你的私人账户额度。
- 对于 Linkup、Metaso、Moonshot、Moonshot CN、Querit、SerpApi、StepFun、Z.ai、Zhipu，必须填写对应的 API Key。

无需强制配置插件选项。在未配置过滤选项时，默认注册全部 13 个搜索 API，由 Magpie 的网页搜索设置界面决定启用哪些和使用顺序。

<a id="custom-base-url"></a>

## 自定义 Base URL

可选的 **Base URL** 字段用于将请求转发到你自建的兼容服务或反向代理。若使用官方服务，请保持该字段留空。
**当填写自定义 Base URL 时，插件将其视为精确的目标端点地址，请求会直接发往该完整地址，不会自动追加任何路径。**
例如：若你的代理服务器将 Linkup 搜索挂载在 `https://search.example.com/proxy/v1/search`，请直接输入该完整地址；若代理服务在根路径响应，请输入 `https://proxy.example.com/`。

仅支持 HTTP 和 HTTPS 协议；地址中包含认证凭据（username/password）、查询字符串（`?query`）或锚点（`#hash`）将被拒绝。请将 API Key 保留在 Magpie 专用的 Key 输入框中。

对于双模接入厂商（Parallel 和 TinyFish），若在匿名（MCP）和带 Key 模式之间切换，请确保你的自定义地址与当前所选协议匹配（例如匿名填 `/mcp`，带 Key 填实际搜索接口）；留空则会自动选择官方默认端点。详见 [Parallel](#parallel-search) 与 [TinyFish](#tinyfish-search) 协议说明。

<a id="cli"></a>

## 命令行管理

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

# Moonshot（国际站）：必须提供 key
magpie search add magpie-websearch:moonshot <key>

# Moonshot CN（国内站）：必须提供 key
magpie search add magpie-websearch:moonshot-cn <key>

# Querit：必须提供 key
magpie search add magpie-websearch:querit <key>

# SerpApi：必须提供 key
magpie search add magpie-websearch:serpapi <key>

# StepFun 国内站：使用国内开放平台的 API Key
magpie search add magpie-websearch:stepfun <china-key>

# Zhipu 国内站、Z.ai 国际站：分别提供本站的 Standard API Key
magpie search add magpie-websearch:zhipu <china-key>
magpie search add magpie-websearch:zai <international-key>

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

<a id="anonymous-search"></a>

## 匿名搜索与限流

AnySearch 在同一接口上省略 Authorization 请求头；Keenable 使用 `/v1/search/public` 端点并附带 `keenable.title` 所配置的应用标头；Parallel 免 Key 调用其托管的 MCP 搜索；TinyFish 免 Key 调用其托管的 MCP 搜索并附带 `X-TinyFish-Access-Mode: keyless` 标头。这四者因在插件中声明了 `keyOptional: true`，在 GUI 中留空 Key 即可正常保存和使用。

若配置的 Key 无效或额度用尽，插件会直接报错，**绝不会自动降级为匿名搜索**。对于已有 Key 的条目，编辑时留空 Key 仍会保留原本已存的 Key；若要切换为匿名模式，请先移除条目，再重新无 Key 添加该条目，并按需恢复自定义地址、顺序与启用状态。

AnySearch 与 Keenable 的匿名额度基于公网出口 IP 共享；Parallel 与 TinyFish 的匿名配额范围及确切上限尚未核实。当遇到 HTTP 429 时，插件会对该 API 最终端点的匿名请求启动冷却期，优先取 `Retry-After` 的秒数或 HTTP 日期；若缺失、无效或已过期则默认 60 秒。冷却期间新请求直接返回 429 而不再向远端发起连接，Magpie 可继续尝试下一个配置通道。缓存中的结果仍可正常读取，且配置了 Key 的请求不受匿名冷却限制。冷却状态保存在插件实例内存中，宿主重载后重置，即使 `cacheTTL: 0` 仍然生效。

<a id="parallel-search"></a>

## Parallel 搜索

Parallel 提供两种访问链路，由 Magpie 传入的 Key 决定：

| 访问方式 | 默认端点 | 请求方式 |
|---|---|---|
| 匿名（Key 留空） | `https://mcp.parallel.ai/mcp` | POST JSON-RPC `tools/call`，调用 `web_search` |
| 配置了 Key | `https://api.parallel.ai/v1/search` | POST，请求头携带 `x-api-key`，请求体包含嵌套的 `advanced_settings` |

匿名请求直接调用 `web_search` 工具，无需 session 握手。插件支持读取 JSON 与 SSE 响应，校验 JSON-RPC 与工具级错误，并从结构化内容或文本部分提取结果。带 Key 请求走官方正式 `/v1/search` 接口。两条链路均支持 1–200 字符的关键词检索（Parallel 官方设定的查询长度限制）。

Parallel 托管 MCP 服务默认运行于 `fast` 模式。若配置了 `parallel.mode` 为其他模式（`turbo`、`basic` 或 `advanced`），匿名请求会在发起前直接报错并提示需要填入 Key。在配置 Key 的情况下，REST 接口支持全部四种模式。

Parallel 公开搜索上限为 20 条，插件通过 REST 请求最多 20 条，并在两条链路上根据 Magpie 要求与 `parallel.maxResults` 截断有效结果。`text` 字段由 `excerpts` 以 `\n\n` 拼接；超过 `parallel.contentChars`（默认 4000 个 Unicode 码点，配置 `0` 保留全部返回文本）时保留前 N 个码点并追加 `…`。`publish_date` 保留原始日期字符串作为 `age`。

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过：免 Key 调用的 `tools/call` 对中英文检索均正常返回 HTTP 200 与搜索结果。配置了 Key 时始终严格走 REST，即便 Key 欠费或无效也绝不静默降级为 MCP。自定义端点对两种协议都按完整地址使用，不追加路径。

<a id="tinyfish-search"></a>

## TinyFish 搜索

TinyFish 提供两种访问链路，由 Magpie 传入的 Key 决定：

| 访问方式 | 默认端点 | 请求方式 |
|---|---|---|
| 匿名（Key 留空） | `https://agent.tinyfish.ai/mcp` | POST JSON-RPC `tools/call`，调用 `search`，头附带 `X-TinyFish-Access-Mode: keyless` |
| 配置了 Key | `https://api.search.tinyfish.ai/` | GET，URL 参数编码，头附带 `X-API-Key` |

匿名请求直接调用 `search` 工具，无需 session 握手。插件支持 JSON 与 SSE 响应，校验 JSON-RPC 和工具级错误，再从结构化内容或文本内容中提取搜索 JSON。带 Key 请求为无 Body 的 GET 请求。两条链路均支持 1–2000 字符的规范化查询，均不发送结果数参数：TinyFish 返回一页，插件在剔除无 URL 条目后，根据 Magpie 请求数与 `tinyfish.maxResults` 截断，不会为补足条数继续翻页。`text` 为摘要内容，`age` 保留原始 `date` 字符串，包括可读自然语言日期；不会把论文的数值型 `year` 转成日期。

两条链路均支持配置国家地区（location）、语言（language）、域名过滤（include/exclude domains）以及 `web`、`news` 类型。**学术论文搜索（`research_paper`）必须有 Key**，若在匿名下选择该模式会在发起请求前直接报错阻断。

未配置地区或语言时由 TinyFish 决定，两者可相互推导，均省略时默认 US/en；插件不根据查询内容推断。用途、分页、日期／年份过滤、缩略图和内联页面抓取尚未开放为插件选项。

例如配置中文新闻搜索且本地上限为 4 条：

```sh
magpie plugin options magpie-websearch '{"tinyfish":{"language":"zh","domainType":"news","maxResults":4}}'
```

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过：免 Key 的 `tools/call` 返回 HTTP 200 和搜索结果，`tools/list` 公布了网页／新闻类型及地区、语言和域名过滤参数。同一 MCP 调用省略免 Key 标头后返回 401；REST 端点无 Key 时即使附带该标头仍返回 401。[REST 参考](https://docs.tinyfish.ai/search-api/reference.md)说明了 API Key 认证，[MCP 指南](https://docs.tinyfish.ai/mcp-integration/index.md)主要说明 OAuth，未完整描述这条匿名链路。上述观察不保证匿名访问永久可用，也不能推定匿名额度与账户额度相同。HTTP 429 使用前述匿名冷却；JSON-RPC 错误码和工具错误文本不视为 HTTP 状态码。

适配器已通过真实匿名搜索验证。带 Key REST 成功路径及 MCP SSE 解析通过本地模拟服务验证，也经过 Magpie 宿主验证；尚未使用真实账户 Key 验证 REST 搜索成功。

配置了 Key 时始终严格走 REST，绝不静默降级为 MCP。切回匿名访问的方法见[匿名搜索与限流](#anonymous-search)。自定义端点须匹配协议类型，例如匿名代理为 `/proxy/mcp`，REST 代理为 `/proxy/search`；两种地址都不会被改写。

<a id="serpapi-search"></a>

## SerpApi 搜索

SerpApi 通过其 Google Search API 获取 Google 自然搜索结果：

- **请求方式**：GET `https://serpapi.com/search`，参数由 URL 编码，凭证通过 `api_key` 参数传递。
- **凭证安全**：SerpApi 的网络、HTTP、解析和状态错误只返回固定说明及必要的状态码，不附带原始异常、响应体、请求 URL 或底层 `cause`。请求不自动跟随重定向。此保护针对插件生成的错误和诊断，不能控制服务端或自建代理的日志，也不会改写正常网页结果内容。
- **结果解析**：仅读取 `organic_results` 自然搜索条目，丢弃无 URL 的条目，保留原始日期作为 `age`。由于 Google 已于 2025 年 9 月废弃 `num` 结果数参数，单页结果通过本地截取（`serpapi.maxResults`）。
- **空结果与缓存**：接受无错误的空数组，或 `status: "Success"` 加 `organic_results_state: "Fully empty"` 的官方空结果（允许附带空结果错误字符串）。结果字段为 `null`、未知状态和无法解释的错误均抛错且不缓存。合法空结果最多缓存 30 秒，`cacheTTL: 0` 关闭插件缓存。Magpie 在没有其他可用结果时会显示 `found nothing`。
- **自定义参数**：支持配置国家代码（`gl`）、界面语言代码（`hl`）、发起地点（`location`）、Google 域名（`googleDomain`）与安全搜索（`safe`）。

`hl` 控制界面语言，`gl` 为国家偏好，两者不等于严格限制结果语言或来源国家。仅请求一页，不自动翻页；`maxResults` 的 1–10 是插件的本地上限，结果可能更少。关闭插件缓存不会关闭 SerpApi 的服务端缓存。按[官方计费说明](https://serpapi.com/pricing)，成功空结果也可能计费，减少本地条数不会减少单次搜索费用。

<a id="moonshot-search"></a>

## Moonshot 与 Moonshot CN 搜索

Moonshot 提供国际站与国内站两个独立的 Basic 网页搜索服务：

| 站点 | 适配器 ID | 默认端点 | 控制台与 Key 获取 |
|---|---|---|---|
| 国际站 | `moonshot` | `https://api.moonshot.ai/v1/tools/search` | `https://platform.kimi.ai/console/api-keys` |
| 国内站 | `moonshot-cn` | `https://api.moonshot.cn/v1/tools/search` | `https://platform.kimi.com/console/api-keys` |

- **协议与请求约束**：首版接入官方独立的 Basic 搜索 API。请求使用 `POST` JSON，携带 `Authorization: Bearer <key>`，使用 `redirect: "error"` 拒绝重定向。摘要模式请求体包含 `text_query` 与 `limit`（1–20 整数，插件自动通过 `sizeFor(count, maxResults, 20)` 计算）；全文模式额外发送 `include_content: true`。不暴露 Pro 搜索、独立 fetch、Responses API、Formula API 或模型内置搜索，不发送服务端 `timeout_seconds` 参数。
- **正文模式与截断**：默认采用摘要模式（`content: "snippet"`），请求体不带 `include_content`，仅提取 `snippet`；若配置为全文模式（`content: "full"`），请求体携带 `"include_content": true`，此时优先使用非空白正文 `text`（保持原始缩进和换行），若正文为空或空白则回退为 `snippet`。文本截断受 `contentChars`（默认 4000 个 Unicode 码点，配置 `0` 取消插件本地截断）限制，截断末尾追加 `…` 且不截断 emoji 代理对。注意 Magpie 宿主另有单条 1500 字节的最终限制。
- **结果解析**：响应必须为包含 `search_results` 数组的 JSON 对象。逐条过滤无 URL 或非对象的条目，若上游返回非空结果但全不可用则报错阻断而不当作空结果。`title` 缺失或空白时回退为 URL，`date` 原始字符串映射为 `age`，丢弃未映射元数据。
- **限流与重置头解析**：遭遇 HTTP 429 时，优先读取规范化秒数或 HTTP 日期的标准 `Retry-After` 头，包括合法的 `0` 秒。若缺失或非法，则读取 `X-RateLimit-Reset`：按官方 Unix 秒时间戳换算，向上取整为相对剩余秒数；仅接受 1–86400 秒的等待值。若原值大于 `1e11` 且秒解释未通过，则尝试按兼容代理的整数毫秒时间戳换算，也须落在同一等待窗口。24 小时上限是插件的本地防御策略，毫秒容错不是官方协议承诺。过期、非法或超限值均忽略，交由宿主默认策略，不截为 24 小时。此上限仅用于该重置头，不改变标准 `Retry-After` 的优先级与处理。
- **账户计费与限速说明**：根据官方计费文档，HTTP 200 且上游原始 `search_results` 数组非空时计费（国际站 $0.002／次，未含适用税费；国内站 ¥0.01／次），上游空结果或失败不计费。本地过滤或截断不会减少单次费用；即使本地过滤后没有可用条目，也不能据此判断本次免费。搜索 QPS 与模型 RPM/TPM 额度相互独立。国际站启用 API 需充值至少 $1。两站 Key 分别配置，插件不共享 Key 或跨站自动重试。
- **自定义 Base URL**：填写时作为精确端点使用，不追加路径，并拒绝带认证信息、查询串或锚点的 URL。

双站均已通过 dummy Key、本地模拟服务与 Magpie 宿主验证，覆盖请求、摘要／全文映射、空结果、超时、429 重置头、Key 轮换与后备调度。尚未使用任一站的真实账户 Key 验证搜索成功、正文返回、实测延迟、真实账户限流或检索质量。

<a id="zhipu-search"></a>

## Zhipu 与 Z.ai 搜索

两站提供独立的 REST 网页搜索，无需模型调用，分别注册、分别配置凭证和缓存：

| 站点 | 适配器 ID | 默认 POST 端点 | 获取 Standard API Key |
|---|---|---|---|
| 国内站 | `zhipu` | `https://open.bigmodel.cn/api/paas/v4/web_search` | <https://bigmodel.cn/apikey/platform> |
| 国际站 | `zai` | `https://api.z.ai/api/paas/v4/web_search` | <https://z.ai/manage-apikey/apikey-list> |

使用 `Authorization: Bearer <key>` 和 JSON，请求拒绝重定向。自定义 Base URL 按精确端点使用，不追加路径。Key 由 Magpie 管理；插件不读取模型凭证，不自动跨站重发。请区分 Standard API Key、个人／团队 Coding Plan Key 和旧 Compatible Key；401 提示检查所属站点和产品类型，不断言一定是跨站用错 Key。

国内站归一化查询后按 Unicode 码点校验 1–70 字符，超长时本地报错，不静默截断。国际站仅要求非空，不额外套用国内长度限制。国内显式发送 `search_intent: false` 执行直接搜索；国际固定 `search-prime`，不发送 `search_intent` 或 `content_size`。`engine` 与 `contentSize` 仅 Zhipu 支持；在 `zai` options 中显式传入时会警告并忽略，包括非法值。

| 国内引擎 | 上游条数 | 域名过滤 | 时间过滤／摘要长度 | 官方价格（元／次） |
|---|---|---|---|---|
| `search_std`（默认） | 1–50 | 支持 | 支持 | 0.01 |
| `search_pro` | 1–50 | 支持 | 支持 | 0.03 |
| `search_pro_sogou` | 10／20／30／40／50 | 支持 | 支持 | 0.05 |
| `search_pro_quark` | 省略 `count`，本地截取 | 未列为支持 | 支持 | 0.05 |

本地有效上限为 `sizeFor(count, maxResults, 50)`。搜狗的请求数向上取档，例如本地需要 6 条则请求 10 条，需要 24 条则请求 30 条，过滤后仍只返回所需条数。搜狗同时设置域名和时间过滤时，上游 `count` 不生效；不追加请求补齐结果。夸克省略 `count`，实际条数由上游决定，`maxResults` 仅限制本地返回数量，不保证能取到 50 条；其默认条数和实际最大条数尚待真实 Key 验证。缓存同时包含上游参数和本地上限，避免夸克或同一搜狗档位的不同数量串用已截断结果。

在夸克引擎下，夸克不支持域名过滤：来自 `ZHIPU_DOMAIN_FILTER` 的非空值会警告并忽略，无论引擎来自 options 还是环境变量，均不阻断插件加载。显式传入非空 `zhipu.domainFilter` 时仍会抛出配置错误，导致包含该 provider 的插件初始化失败；传入空字符串可清除继承的环境变量。

`domainFilter` 映射单个白名单域名 `search_domain_filter`，例如 `www.example.com`，应使用不带协议、路径、逗号列表或通配符的裸域名。插件仅 trim 后透传，不校验或转换域名格式，错误格式可能被上游拒绝。`recency` 可选 `oneDay`、`oneWeek`、`oneMonth`、`oneYear`、`noLimit`；默认 `noLimit` 省略发送。国内 `contentSize` 默认 `medium`（省略发送），选择 `high` 时请求更长摘要，但它不是独立网页正文抓取。两站的返回文本会先保留最多 `contentChars` 个码点（默认 4000，0 取消本地截断）；发生截断时另加一个 `…`，因此最终可能为 `contentChars + 1` 个码点。Magpie 另有单条 1500 字节的最终限制。

国际站价格为 $0.01／次。[官方指南](https://docs.z.ai/guides/tools/web-search)示例使用 `count`、域名和时间过滤，但 [API 参考](https://docs.z.ai/api-reference/tools/web-search) 的这些字段说明提到枚举中不存在的 `search_pro_jina`。适配器按指南发送参数，实际过滤与条数效果尚待真实 Key 验证；不提供 Jina 引擎或国际站 `contentSize`。价格依据[国内定价](https://docs.bigmodel.cn/cn/guide/start/pricing)及[国际定价](https://docs.z.ai/guides/overview/pricing)，不承诺空结果或失败免费。

结果读取 `search_result`：有效字符串 `link` 映射为 `url`，`content` 映射为 `text`，原生 `publish_date` 字符串映射为 `age`；标题为空时回退 URL，顶层请求时间 `created` 不作为网页发布日期。先过滤无链接条目再截断，保持顺序。**插件的校验策略**要求明确的结果数组：缺失、null、错误类型，以及非空但完全无有效链接的结果均报错且不缓存；这不是官方 schema 的必填字段保证。合法空数组最多缓存 30 秒。truthy 的 `error` 或已提供、非 null 且不属于 `0`、`"0"`、`200`、`"200"` 的顶层业务 `code` 即使出现在 HTTP 200 中也会报错，不转成虚假的 HTTP 状态。对这些成功码及 falsy `error` 的容忍是代理兼容策略，仍须通过结果数组校验。

HTTP 拒绝保留数值 `status`、有界的上游诊断及校验后的标准 `Retry-After`（整数秒数或标准 HTTP 日期，包括 0）。429 可能表示限流、余额不足或额度耗尽，不能一概解释为并发上限；业务码 1701／1702／1703 分别指国内搜索并发达限／无可用引擎／无有效数据。Key 休眠、轮换和后备调度交给 Magpie，不增加插件内睡眠或自动重试。超时与宿主取消覆盖请求及正文读取，`timeout: 0` 仍保留 `ctx.abort`。

首版只接入标准 REST。Coding Plan 的 `webSearchPrime` MCP 是另一个访问方式，凭证与计费不能与 REST 混用；两站当前套餐文档采用积分抵扣，不应沿用旧固定月次数或视为匿名免费搜索。协议说明见[国内 REST 参考](https://docs.bigmodel.cn/api-reference/工具-api/网络搜索)、[国内 MCP](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server)和[国际 MCP](https://docs.z.ai/devpack/mcp/search-mcp-server)。

本地验证使用 dummy Key 和模拟服务，覆盖两站请求、国内引擎差异、结果映射、数量及文本限制、缓存、异常响应、超时、429、Key 轮换与后备调度。尚未使用真实账户 Key 验证搜索成功、国际过滤效果、延迟、实际扣费、账户限流或检索质量。

```sh
magpie plugin options magpie-websearch '{"zhipu":{"engine":"search_pro","contentSize":"high","maxResults":6},"zai":{"maxResults":6}}'
```

<a id="stepfun-search"></a>

## StepFun 国内站搜索

使用[官方独立网页搜索 API](https://platform.stepfun.com/docs/zh/api-reference/search/search.md)：`POST https://api.stepfun.com/v1/search`，JSON 请求携带 `Authorization: Bearer <key>`，不调用聊天模型。Key 从 <https://platform.stepfun.com/interface-key> 获取，由 Magpie 管理，不能留空。默认注册 ID 为 `magpie-websearch:stepfun`，显示名为 `StepFun (magpie-websearch)`。

查询先规范化空白并校验非空，文档未公布长度上限，插件不额外截短。请求发送 `query`、`n`，以及可选 `category`：`programming`、`research`、`gov`、`business`；默认省略分类以搜索全部场景。`n` 取 `sizeFor(count, maxResults, 20)`，过滤无链接条目后再本地截取并保留原顺序，不追加请求补足条数。没有公开分页、域名、时间、语言及安全搜索过滤选项。

默认 `content: "snippet"` 优先摘要，摘要为空白时回退到正文；`"full"` 优先 `content` 正文，正文为空白时回退摘要。选中的文本保留原有缩进和换行，再按 `contentChars` 限制为 4000 个 Unicode 码点，截断时追加 `…`，配置 `0` 保留全部。两种模式都受此上限约束，Magpie 仍有单条 1500 字节的后续限制。API 没有公开关闭正文返回的参数，插件不发送 `include_content`；这些选项只影响本地文本选择。

结果读取 `results` 数组，逐条要求 `url` 为非空白字符串，去除首尾空白后使用；不额外校验结果 URL 的协议、语法或可访问性。标题缺失、类型错误或为空白时回退 URL。字符串 `time` 去除首尾空白后作为 `age`，空白或非字符串值省略，不解析成日期或重命名为发布时间：它表示网页的**索引时间**。作为插件校验策略，缺失、null、非数组结果，以及非空但全部无可用 URL 的结果均报错且不缓存；明确的空数组最多缓存 30 秒。HTTP 200 中 truthy 的 `error` 也作为失败处理，不伪造 HTTP 状态。缓存按最终端点、Key、查询、条数、分类、文本模式及预算哈希隔离，每个插件实例独立。

HTTP 失败保留数值 `status`；上游诊断有长度上限，402 使用固定的余额／组织 Credit 提示。401 提示检查国内 Key 与账户权限；429 同时可能表示请求限流、项目或成员 Credit 上限，保留上游错误标识，并透传校验后的标准 `Retry-After`（整数秒或 HTTP 日期，包括 0）；451 提示查询或返回内容审核未通过。Key 休眠、轮换与后备调度由 Magpie 负责，插件不增加睡眠或自动重试。自定义 Base URL 是精确端点，不补路径；请求拒绝重定向。超时和 `ctx.abort` 覆盖请求及正文读取，`timeout: 0` 仍保留宿主取消。

错误详情先提取字符串或数值型 `type`／`code` 并放在消息前，再截断；每个标识保留前 80 个码点，超长时另加 `…`。上游诊断部分最多保留 300 个码点，超长时另加 `… [truncated]`；HTTP 状态前缀、重试提示和操作建议不计入该预算。没有可用结构化字段或正文不是 JSON 时，回退为有界的原始诊断。401／403 等失败响应在正文读取中断或超时后仍保留已知 HTTP 状态，避免阻断 Key 轮换；请求阶段的宿主主动取消则优先报告取消。402 使用固定提示并取消未读响应体，不等待清理完成。

[国内定价](https://platform.stepfun.com/docs/zh/guides/pricing/details.md)为 ¥0.04／次，未明确承诺空结果或失败免费。[速率限制](https://platform.stepfun.com/docs/zh/guides/pricing/rate-limits.md)公布账户分档规则，未单独列出搜索接口的具体限额。[错误码文档](https://platform.stepfun.com/docs/zh/api-reference/error-codes.md)包含 `project_credit_limit_exceeded` 和 `member_project_credit_limit_exceeded` 两类 429，不应都解释为短期限流。

本适配器只支持国内标准 REST。2026-11-05 无 Key 探测国内 REST 返回 401，国际 `/v1/search` 返回 404，国际聊天接口返回 401。[国际站官方文档](https://platform.stepfun.ai/docs/en/guides/developer/integrations/codex.md#connect-stepsearch-mcp)另有 Step Plan 搜索 MCP：`https://api.stepfun.ai/step_plan/v1/mcp/web_search/mcp`（无 Key 返回 401）。它使用另一种协议和套餐通道，不作为本适配器的自动后备地址。

```sh
magpie plugin options magpie-websearch '{"stepfun":{"category":"research","content":"full","maxResults":6,"contentChars":4000}}'
```

本地使用 dummy Key 和模拟服务验证请求、摘要／正文回退、空结果及异常结构、取消／超时、Credit 429、451、Key 轮换与宿主后备调度。宿主用例还覆盖长错误消息保留 Credit 标识，以及 401 正文中断后继续轮换健康 Key。尚未用真实账户 Key 验证搜索成功、正文返回、延迟、扣费、限流或检索质量。

<a id="result-processing"></a>

## Magpie 结果处理规范

- Magpie 当前传入的 `count` 为 6：适配器按所需数量请求并本地截断。搜狗因上游档位约束至少请求 10 条；不可配置结果数的接口仅本地截断。Magpie 最多保留 6 条。
- `text` 会自动剔除 HTML 标签、反转义字符、折叠多余空白并截断至 1500 字节。
- `age` 保留厂商返回的时间字符串格式，仅去除首尾空白；空白或非字符串值省略，不猜测日期或转换时区。StepFun 的该字段是索引时间。
- 自动剔除不包含 URL 的无效结果。
- 抛出带有数值型 `status`（401、402、403、429）的错误被 Magpie 识别为服务商拒绝；对于带 Key 请求，Magpie 会休眠该 Key 并尝试下一个。匿名 429 冷却由本插件自主管理；失败时会触发 Magpie 调度下一可用引擎。
- 429 响应的 `Retry-After` 按适配器策略处理：SerpApi、StepFun、Zhipu 和 Z.ai 仅传递校验和规范化后的整数秒数或标准 HTTP 日期；Moonshot 双站优先传递合法标准头，非法或缺失时按[重置头规则](#moonshot-search)回退；其他适配器沿用通用头透传逻辑。
- 公共 HTTP 层在失败响应正文读取中断或超时后，仍保留已知 `status` 和适配器提取的重试信息；请求阶段的宿主主动取消优先报告取消。此规则不把网络连接失败或 HTTP 200 中的业务错误伪装成 HTTP 拒绝。

<a id="configuration"></a>

## 完整配置参考

所有选项均为可选，包括各厂商的子对象字段以及顶层的 `enable`/`disable` 过滤器。未设置的字段将自动回退到对应的环境变量，若环境变量亦未定义则使用默认值。

在桌面客户端中通过 **Plugins → Installed → Options** 配置，或通过命令行传递 JSON 对象。例如仅调整特定引擎参数而保持全量注册：

```sh
magpie plugin options magpie-websearch '{"linkup":{"depth":"deep","maxResults":4,"timeout":25000,"cacheTTL":600000},"anysearch":{"zone":"cn","language":"zh-CN"}}'
```

每次命令都会替换已保存的完整选项对象，因此需包含所有希望保留的选项。保存后 Magpie 会重载插件宿主进程；各插件实例拥有独立的配置和缓存。

参数解析优先级：**显式插件选项 → 环境变量 → 默认值**。已注册供应商的显式已知字段取值非法时，插件加载失败并报告具体字段；未知字段会被忽略。显式数值必须为符合表中范围的 JSON 安全整数（不超过 9,007,199,254,740,991），不能使用数字字符串；字符串选项会去除首尾空白后校验。

环境变量沿用回退规则：空白值视为未设置；数值无法解析为非负安全整数时使用默认值，合法数值再限制到该字段允许的范围；枚举字符串不合法时记录警告并使用默认值。`timeout` 与 `cacheTTL` 单位为毫秒，`timeout` 最大为 2,147,483,647 毫秒。设置 `timeout: 0` 取消插件自身的超时保护，但 Magpie 宿主的取消信号与期限仍生效；设置 `cacheTTL: 0` 关闭内存缓存。

各 API 使用有容量上限的内存搜索缓存，按最终端点、凭证及请求参数（包括结果数）整体哈希隔离。空结果最多缓存 30 秒。

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
| linkup | `maxResults` | `LINKUP_MAX_RESULTS` | `10` | 1–100；上游限制仍适用 |
| linkup | `contentChars` | `LINKUP_CONTENT_CHARS` | `4000` | 每条摘录的 Unicode 码点上限（`0` 保留全部） |
| linkup | `timeout` | `LINKUP_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| metaso | `cacheTTL` | `METASO_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| metaso | `scope` | `METASO_SCOPE` | `webpage` | `webpage`、`document`、`paper`、`image`、`video`、`podcast` |
| metaso | `maxResults` | `METASO_MAX_RESULTS` | `10` | 1–50 |
| metaso | `contentChars` | `METASO_CONTENT_CHARS` | `4000` | 每条摘录的 Unicode 码点上限（`0` 保留全部） |
| metaso | `timeout` | `METASO_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot | `cacheTTL` | `MOONSHOT_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| moonshot | `timeout` | `MOONSHOT_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot | `maxResults` | `MOONSHOT_MAX_RESULTS` | `10` | 1–20；请求结果上限 |
| moonshot | `content` | `MOONSHOT_CONTENT` | `snippet` | `snippet`（摘要）、`full`（全文正文） |
| moonshot | `contentChars` | `MOONSHOT_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限（`0` 保留全部） |
| moonshot-cn | `cacheTTL` | `MOONSHOT_CN_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| moonshot-cn | `timeout` | `MOONSHOT_CN_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot-cn | `maxResults` | `MOONSHOT_CN_MAX_RESULTS` | `10` | 1–20；请求结果上限 |
| moonshot-cn | `content` | `MOONSHOT_CN_CONTENT` | `snippet` | `snippet`（摘要）、`full`（全文正文） |
| moonshot-cn | `contentChars` | `MOONSHOT_CN_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限（`0` 保留全部） |
| parallel | `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| parallel | `timeout` | `PARALLEL_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0；包含 MCP 流读取 |
| parallel | `maxResults` | `PARALLEL_MAX_RESULTS` | `10` | 1–20 |
| parallel | `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | 每条拼接摘录的 Unicode 码点上限（`0` 保留全部） |
| parallel | `mode` | `PARALLEL_MODE` | `fast` | `fast`、`turbo`、`basic`、`advanced`（非 fast 模式需填 Key） |
| querit | `cacheTTL` | `QUERIT_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| querit | `count` | `QUERIT_COUNT` | `8` | ≥ 1；限制 Magpie 请求数，Querit 自身限制仍适用 |
| querit | `timeout` | `QUERIT_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `cacheTTL` | `SERPAPI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| serpapi | `timeout` | `SERPAPI_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `maxResults` | `SERPAPI_MAX_RESULTS` | `10` | 1–10；本地截取上限 |
| serpapi | `location` | `SERPAPI_LOCATION` | 留空 | 发起地点，例如 `Austin, Texas, United States` |
| serpapi | `gl` | `SERPAPI_GL` | 留空 | 国家代码，例如 `us` |
| serpapi | `hl` | `SERPAPI_HL` | 留空 | 界面语言代码，例如 `zh-cn` |
| serpapi | `googleDomain` | `SERPAPI_GOOGLE_DOMAIN` | 留空 | Google 域名，例如 `google.com` |
| serpapi | `safe` | `SERPAPI_SAFE` | 留空 | 留空、`active`、`off` |
| stepfun | `cacheTTL` | `STEPFUN_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| stepfun | `timeout` | `STEPFUN_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| stepfun | `maxResults` | `STEPFUN_MAX_RESULTS` | `10` | 1–20；请求及本地结果上限 |
| stepfun | `category` | `STEPFUN_CATEGORY` | 留空 | 留空、`programming`、`research`、`gov`、`business` |
| stepfun | `content` | `STEPFUN_CONTENT` | `snippet` | `snippet`（摘要）、`full`（正文）；仅本地选择 |
| stepfun | `contentChars` | `STEPFUN_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| tinyfish | `cacheTTL` | `TINYFISH_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| tinyfish | `timeout` | `TINYFISH_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0；包含 MCP 流读取 |
| tinyfish | `maxResults` | `TINYFISH_MAX_RESULTS` | `10` | ≥ 1；本地上限，不保证上游页大小 |
| tinyfish | `location` | `TINYFISH_LOCATION` | 留空 | 国家地区代码，如 `US`；留空时不发送 |
| tinyfish | `language` | `TINYFISH_LANGUAGE` | 留空 | 语言代码，如 `zh`；留空时不发送 |
| tinyfish | `domainType` | `TINYFISH_DOMAIN_TYPE` | `web` | `web`、`news`、`research_paper`（学术论文模式需填 Key） |
| tinyfish | `includeDomains` | `TINYFISH_INCLUDE_DOMAINS` | 留空 | 包含域名列表（逗号分隔） |
| tinyfish | `excludeDomains` | `TINYFISH_EXCLUDE_DOMAINS` | 留空 | 排除域名列表（逗号分隔） |
| zai | `cacheTTL` | `ZAI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zai | `timeout` | `ZAI_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| zai | `maxResults` | `ZAI_MAX_RESULTS` | `10` | 1–50；本地结果上限 |
| zai | `contentChars` | `ZAI_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zai | `recency` | `ZAI_RECENCY` | `noLimit` | `noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear`；效果待实测 |
| zai | `domainFilter` | `ZAI_DOMAIN_FILTER` | 留空 | 单个白名单域名；效果待实测 |
| zhipu | `cacheTTL` | `ZHIPU_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zhipu | `timeout` | `ZHIPU_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| zhipu | `maxResults` | `ZHIPU_MAX_RESULTS` | `10` | 1–50；本地上限；搜狗请求向上取档，夸克省略 count |
| zhipu | `contentChars` | `ZHIPU_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zhipu | `recency` | `ZHIPU_RECENCY` | `noLimit` | `noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear` |
| zhipu | `domainFilter` | `ZHIPU_DOMAIN_FILTER` | 留空 | 单个白名单域名；夸克不支持 |
| zhipu | `engine` | `ZHIPU_ENGINE` | `search_std` | `search_std`、`search_pro`、`search_pro_sogou`、`search_pro_quark` |
| zhipu | `contentSize` | `ZHIPU_CONTENT_SIZE` | `medium` | `medium`、`high`；上游摘要长度 |

表中的 `contentChars` 表示截断前保留的 Unicode 码点数，不是最终文本长度；截断时还会追加一个 `…`，因此实际长度可能多 1 个码点。

环境变量在创建插件实例时读取，必须存在于 Magpie 进程的环境中。在另一个终端设置变量不会改变已经运行的桌面客户端；桌面使用建议优先配置插件选项。

<a id="registration-filters"></a>

## 可选注册过滤（enable / disable）

顶层的 `enable` 与 `disable` 数组可控制插件向 Magpie 注册哪些 API。传入短名称（如 `linkup`，不带 `magpie-websearch:` 前缀）。

| 过滤器设置 | 实际向 Magpie 注册的 API |
|---|---|
| 省略未设，或 `{}` | 全部 13 个 API 均注册 |
| `"enable": ["linkup", "querit"]` | 仅注册 Linkup 与 Querit |
| `"disable": ["keenable"]` | 注册除 Keenable 外的其余 API |
| `"enable": ["linkup", "querit"], "disable": ["querit"]` | 仅注册 Linkup（`disable` 优先级高于 `enable`） |
| `"enable": []` | 一个都不注册 |
| `"disable": []` | 不排除任何 API；若同时设置 `enable`，仍受其限制 |

示例：过滤掉 Keenable，同时指定 Linkup 深度搜索参数：

```sh
magpie plugin options magpie-websearch '{"disable":["keenable"],"linkup":{"depth":"deep","maxResults":4}}'
```

未知 ID 会被记录并忽略；显式 `enable` 列表不含任何已知 ID 时，不注册 API 并记录警告。过滤器不是数组时，记录警告并忽略；供应商配置字段非法则按[完整配置参考](#configuration)中的规则导致加载失败。

这些过滤器控制注册范围。Magpie 网页搜索界面的开关独立控制已注册 API 是否参与搜索，关闭时保留其 Key 和顺序，无需设置过滤器即可使用。

移除所有已保存的插件选项，包括供应商覆盖项与过滤器：

```sh
magpie plugin options magpie-websearch off
```

全部 13 个 API 会重新注册。供应商配置优先取环境变量，否则使用默认值。若只想移除过滤器，请保存包含所有需要保留的供应商配置的完整选项对象。

<a id="development"></a>

## 开发与本地测试

新增供应商配置时，环境变量按“供应商短 ID 转大写下划线形式 + `_` + 配置字段转大写下划线形式”命名，例如 `moonshot-cn.maxResults` 对应 `MOONSHOT_CN_MAX_RESULTS`，`cacheTTL` 对应后缀 `CACHE_TTL`。配置字段名须为字符串，使用 camelCase；该约定由本地适配器定义。公共 helper 据此剥离完整字段后缀，生成正确的错误字段名；保留历史别名或使用其他命名时，应显式传入供应商短 ID 作为最后一个 `namespace` 参数。完整规则见[供应商接入规范](../PROVIDERS.md#configuration-naming)。

正文截断复用 `truncateCodePoints(text, limit)`：调用者传入字符串和已校验的非负整数，函数不校验类型、不裁剪空白或归一化文本；0 保留全部，超长时保留前 N 个码点并另加 `…`。只遍历保留前缀及额外一个码点，不展开全文。正文选择与字段容错由适配器负责。

`requestResponse`／`requestJSON` 可接收同步 `errorDetailFromBody(raw, response)` 回调，在非成功 HTTP 响应的正文读取完成后、诊断截断前格式化厂商详情；返回非字符串或抛错时回退原始正文。该状态的固定 `messages`、敏感模式与隐藏 402 正文的策略优先，不调用该回调。回调不处理 HTTP 200 中的业务错误，此类错误由适配器自行校验。正文读取失败仍保留已知 HTTP 状态及重试信息，请求阶段的宿主主动取消优先。

```sh
npm test          # node:test 单元测试（无依赖）
npm run check     # 校验 search hook 契约并运行单元测试
npm run check:bun # 在 Bun 下运行相同检查与测试（需单独安装 Bun）
npm run smoke:magpie # 在独立沙箱中启动真实 Magpie 进程进行完整烟雾测试
```

Magpie 通过其管理的 **Bun** 运行插件。基于 Node 的开发命令要求 **Node.js 20.3.0 或更新版本**，依赖 `AbortSignal.any` 组合超时和取消信号；`check:bun` 直接在 Bun 下运行。本插件使用 Magpie 的 `search` hook；`package.json` 中的 `opencode` 关键词用于 Magpie 的 npm 插件发现。

`npm run smoke:magpie` 测试脚本要求环境变量 PATH 中存在 `magpie` 可执行文件（或通过 `MAGPIE_BIN` 指定）。脚本创建独立的沙箱配置环境、隔离账户发现、在随机回环端口启动网关，验证插件加载、注册过滤、自定义 URL、超时中断、匿名 429 冷却与后备调度、Parallel 及 TinyFish 的 MCP／REST，以及 SerpApi、StepFun、Moonshot 双站和 Zhipu／Z.ai 的带 Key 协议。Moonshot 用例覆盖秒／毫秒重置头、超限值忽略与 Key 休眠排序；Zhipu／Z.ai 用例覆盖搜狗档位、本地截断、业务错误、查询长度、Key 轮换和跨站后备凭证隔离；StepFun 用例覆盖分类、正文、异常结果、Credit 429、451 和 Key 轮换。测试完成后自动清理沙箱，搜索请求只访问本地模拟服务并使用 dummy Key，不调用付费搜索；Magpie 自身启动时仍可能独立获取模型目录等公共资源。

可用 `MAGPIE_PLUGIN_DIR` 指定解包后的 npm 插件目录，目录名应保持为 `magpie-websearch` 以维持 Vendor ID。`MAGPIE_SMOKE_ROOT` 可覆盖测试沙箱使用的系统临时目录。CI 分别运行 Node 22／24、Bun 检查和解包后的 npm 包 Magpie 验证，三个作业之间没有顺序依赖。

2026-11-05 本地验证使用 **Node.js 24.19.0、Bun 1.4.4、magpie 0.1.3026**。Node 与 Bun 均通过 219 项测试，包含 StepFun 国内站、长错误标识和 401 正文中断后 Key 轮换的 Magpie 沙箱验证通过。Bun 通过 `npm exec --yes --package=bun -- bun run check:bun` 从 npm 缓存临时运行，不增加项目依赖。此前 **magpie 0.1.2911／0.1.2964** 的记录属于历史验证；这些记录均不代表最低支持版本。

本地文件夹安装以文件夹名作为插件短名称。包名为 `@guotree/magpie-websearch`，文件夹名为 `magpie-websearch` 时，两种安装方式均使用 `magpie-websearch:*` ID。
