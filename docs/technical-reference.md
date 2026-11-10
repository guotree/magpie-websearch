# 技术参考

[中文说明](technical-reference.md) | [English](technical-reference.en.md) · [返回 README](../README.md)

本页说明配置、协议、结果处理和开发验证。安装与快速上手见 [README](../README.md)，支持状态与接入规范见 [PROVIDERS.md](../PROVIDERS.md)。

- [配置入口](#setup)
- [自定义 Base URL](#custom-base-url)
- [命令行管理](#cli)
- [匿名搜索与限流](#anonymous-search)
- [Parallel](#parallel-search)、[TinyFish](#tinyfish-search)、[SerpApi](#serpapi-search)、[Moonshot 与 Moonshot CN](#moonshot-search)、[Zhipu 与 Z.ai](#zhipu-search)、[StepFun](#stepfun-search)、[Perplexity](#perplexity-search)、[Bocha](#bocha-search)、[Ollama](#ollama-search)、[Jina](#jina-search)、[Kagi](#kagi-search)、[Serper](#serper-search) 协议说明
- [Magpie 结果处理](#result-processing)
- [完整配置参考](#configuration)
- [注册过滤](#registration-filters)
- [开发与本地测试](#development)

<a id="setup"></a>

## 配置入口

### 图形界面配置

在 Magpie 桌面客户端中：前往 **设置 › 模型 › 网页搜索**（Settings › Models › Web search），添加你需要的搜索引擎，开启开关并调整优先级顺序。

- 对于 AnySearch、Keenable、Parallel、TinyFish，留空 Key 即可使用匿名免 Key 搜索；填写 Key 则使用你的私人账户额度。
- 对于 Bocha、Jina、Kagi、Linkup、Metaso、Moonshot、Moonshot CN、Ollama、Perplexity、Querit、SerpApi、Serper、StepFun，以及 Z.ai／Zhipu 的标准 REST 与 Coding Plan MCP，必须填写对应产品的 Key。

无需强制配置插件选项。在未配置过滤选项时，默认注册全部 21 个搜索 API，由 Magpie 的网页搜索设置界面决定启用哪些和使用顺序。

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

# Bocha：必须提供 key
magpie search add magpie-websearch:bocha <key>

# Jina、Kagi：分别提供对应服务的 API Key
magpie search add magpie-websearch:jina <key>
magpie search add magpie-websearch:kagi <key>

# Linkup：必须提供 key
magpie search add magpie-websearch:linkup <key>

# Metaso：必须提供 key
magpie search add magpie-websearch:metaso <key>

# Moonshot（国际站）：必须提供 key
magpie search add magpie-websearch:moonshot <key>

# Moonshot CN（国内站）：必须提供 key
magpie search add magpie-websearch:moonshot-cn <key>

# Ollama 云端搜索：必须提供官方账户 API Key
magpie search add magpie-websearch:ollama <key>

# Perplexity：使用官方 API Key
magpie search add magpie-websearch:perplexity <key>

# Querit：必须提供 key
magpie search add magpie-websearch:querit <key>

# SerpApi：必须提供 key
magpie search add magpie-websearch:serpapi <key>

# Serper：独立于 SerpApi 的 API Key
magpie search add magpie-websearch:serper <key>

# StepFun 国内站：使用国内开放平台的 API Key
magpie search add magpie-websearch:stepfun <china-key>

# Zhipu 国内站、Z.ai 国际站：分别提供本站的 Standard API Key
magpie search add magpie-websearch:zhipu <china-key>
magpie search add magpie-websearch:zai <international-key>

# Coding Plan MCP：必须使用对应站点的个人／团队 Coding Plan Key
magpie search add magpie-websearch:zhipu-coding <china-coding-plan-key>
magpie search add magpie-websearch:zai-coding <international-coding-plan-key>

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

Parallel 公开搜索上限为 20 条，插件通过 REST 请求最多 20 条，并在两条链路上根据 Magpie 要求与 `parallel.resultLimit` 截断有效结果。`text` 字段由 `excerpts` 以 `\n\n` 拼接；超过 `parallel.contentChars`（默认 4000 个 Unicode 码点，配置 `0` 保留全部返回文本）时保留前 N 个码点并追加 `…`。`publish_date` 保留原始日期字符串作为 `age`。

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过：免 Key 调用的 `tools/call` 对中英文检索均正常返回 HTTP 200 与搜索结果。配置了 Key 时始终严格走 REST，即便 Key 欠费或无效也绝不静默降级为 MCP。自定义端点对两种协议都按完整地址使用，不追加路径。

<a id="tinyfish-search"></a>

## TinyFish 搜索

TinyFish 提供两种访问链路，由 Magpie 传入的 Key 决定：

| 访问方式 | 默认端点 | 请求方式 |
|---|---|---|
| 匿名（Key 留空） | `https://agent.tinyfish.ai/mcp` | POST JSON-RPC `tools/call`，调用 `search`，头附带 `X-TinyFish-Access-Mode: keyless` |
| 配置了 Key | `https://api.search.tinyfish.ai/` | GET，URL 参数编码，头附带 `X-API-Key` |

匿名请求直接调用 `search` 工具，无需 session 握手。插件支持 JSON 与 SSE 响应，校验 JSON-RPC 和工具级错误，再从结构化内容或文本内容中提取搜索 JSON。带 Key 请求为无 Body 的 GET 请求。两条链路均支持 1–2000 字符的规范化查询，均不发送结果数参数：TinyFish 返回一页，插件在剔除无 URL 条目后，根据 Magpie 请求数与 `tinyfish.resultLimit` 截断，不会为补足条数继续翻页。`text` 为摘要内容，`age` 保留原始 `date` 字符串，包括可读自然语言日期；不会把论文的数值型 `year` 转成日期。

两条链路均支持配置国家地区（location）、语言（language）、域名过滤（include/exclude domains）以及 `web`、`news` 类型。**学术论文搜索（`research_paper`）必须有 Key**，若在匿名下选择该模式会在发起请求前直接报错阻断。

未配置地区或语言时由 TinyFish 决定，两者可相互推导，均省略时默认 US/en；插件不根据查询内容推断。用途、分页、日期／年份过滤、缩略图和内联页面抓取尚未开放为插件选项。

例如配置中文新闻搜索且本地上限为 4 条：

```sh
magpie plugin options magpie-websearch '{"tinyfish":{"language":"zh","domainType":"news","resultLimit":4}}'
```

匿名访问已于 **2026-11-04** 在官方 MCP 端点实测通过：免 Key 的 `tools/call` 返回 HTTP 200 和搜索结果，`tools/list` 公布了网页／新闻类型及地区、语言和域名过滤参数。同一 MCP 调用省略免 Key 标头后返回 401；REST 端点无 Key 时即使附带该标头仍返回 401。[REST 参考](https://docs.tinyfish.ai/search-api/reference.md)说明了 API Key 认证，[MCP 指南](https://docs.tinyfish.ai/mcp-integration/index.md)主要说明 OAuth，未完整描述这条匿名链路。上述观察不保证匿名访问永久可用，也不能推定匿名额度与账户额度相同。HTTP 429 使用前述匿名冷却；JSON-RPC 错误码和工具错误文本不视为 HTTP 状态码。

适配器已通过真实匿名搜索验证。带 Key REST 成功路径及 MCP SSE 解析通过本地模拟服务验证，也经过 Magpie 宿主验证；尚未使用真实账户 Key 验证 REST 搜索成功。

配置了 Key 时始终严格走 REST，绝不静默降级为 MCP。切回匿名访问的方法见[匿名搜索与限流](#anonymous-search)。自定义端点须匹配协议类型，例如匿名代理为 `/proxy/mcp`，REST 代理为 `/proxy/search`；两种地址都不会被改写。

<a id="serpapi-search"></a>

## SerpApi 搜索

SerpApi 通过其 Google Search API 获取 Google 自然搜索结果：

- **请求方式**：GET `https://serpapi.com/search`，参数由 URL 编码，凭证通过 `api_key` 参数传递。
- **凭证安全**：SerpApi 的网络、HTTP、解析和状态错误只返回固定说明及必要的状态码，不附带原始异常、响应体、请求 URL 或底层 `cause`。请求不自动跟随重定向。此保护针对插件生成的错误和诊断，不能控制服务端或自建代理的日志，也不会改写正常网页结果内容。
- **结果解析**：仅读取 `organic_results` 自然搜索条目，丢弃无 URL 的条目，保留原始日期作为 `age`。由于 Google 已于 2025 年 9 月废弃 `num` 结果数参数，单页结果通过本地截取（`serpapi.resultLimit`）。
- **空结果与缓存**：接受无错误的空数组，或 `status: "Success"` 加 `organic_results_state: "Fully empty"` 的官方空结果（允许附带空结果错误字符串）。结果字段为 `null`、未知状态和无法解释的错误均抛错且不缓存。合法空结果最多缓存 30 秒，`cacheTTL: 0` 关闭插件缓存。Magpie 在没有其他可用结果时会显示 `found nothing`。
- **自定义参数**：支持配置国家代码（`gl`）、界面语言代码（`hl`）、发起地点（`location`）、Google 域名（`googleDomain`）与安全搜索（`safe`）。

`hl` 控制界面语言，`gl` 为国家偏好，两者不等于严格限制结果语言或来源国家。仅请求一页，不自动翻页；`resultLimit` 的 1–10 是插件的本地上限，结果可能更少。关闭插件缓存不会关闭 SerpApi 的服务端缓存。按[官方计费说明](https://serpapi.com/pricing)，成功空结果也可能计费，减少本地条数不会减少单次搜索费用。

<a id="moonshot-search"></a>

## Moonshot 与 Moonshot CN 搜索

Moonshot 提供国际站与国内站两个独立的 Basic 网页搜索服务：

| 站点 | 适配器 ID | 默认端点 | 控制台与 Key 获取 |
|---|---|---|---|
| 国际站 | `moonshot` | `https://api.moonshot.ai/v1/tools/search` | `https://platform.kimi.ai/console/api-keys` |
| 国内站 | `moonshot-cn` | `https://api.moonshot.cn/v1/tools/search` | `https://platform.kimi.com/console/api-keys` |

- **协议与请求约束**：首版接入官方独立的 Basic 搜索 API。请求使用 `POST` JSON，携带 `Authorization: Bearer <key>`，使用 `redirect: "error"` 拒绝重定向。摘要模式请求体包含 `text_query` 与 `limit`（1–20 整数，插件自动通过 `resolveResultCount(count, countPolicy)` 计算）；全文模式额外发送 `include_content: true`。不暴露 Pro 搜索、独立 fetch、Responses API、Formula API 或模型内置搜索，不发送服务端 `timeout_seconds` 参数。
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

本地有效上限通过 `resolveResultCount(count, countPolicy)` 计算，最多 50 条。搜狗的请求数向上取档，例如本地需要 6 条则请求 10 条，需要 24 条则请求 30 条，过滤后仍只返回所需条数。搜狗同时设置域名和时间过滤时，上游 `count` 不生效；不追加请求补齐结果。夸克省略 `count`，实际条数由上游决定，`resultLimit` 仅限制本地返回数量，不保证能取到 50 条；其默认条数和实际最大条数尚待真实 Key 验证。缓存同时包含上游参数和本地上限，避免夸克或同一搜狗档位的不同数量串用已截断结果。

在夸克引擎下，夸克不支持域名过滤：来自 `ZHIPU_DOMAIN_FILTER` 的非空值会警告并忽略，无论引擎来自 options 还是环境变量，均不阻断插件加载。显式传入非空 `zhipu.domainFilter` 时仍会抛出配置错误，导致包含该 provider 的插件初始化失败；传入空字符串可清除继承的环境变量。

`domainFilter` 映射单个白名单域名 `search_domain_filter`，例如 `www.example.com`，应使用不带协议、路径、逗号列表或通配符的裸域名。插件仅 trim 后透传，不校验或转换域名格式，错误格式可能被上游拒绝。`recency` 可选 `oneDay`、`oneWeek`、`oneMonth`、`oneYear`、`noLimit`；默认 `noLimit` 省略发送。国内 `contentSize` 默认 `medium`（省略发送），选择 `high` 时请求更长摘要，但它不是独立网页正文抓取。两站的返回文本会先保留最多 `contentChars` 个码点（默认 4000，0 取消本地截断）；发生截断时另加一个 `…`，因此最终可能为 `contentChars + 1` 个码点。Magpie 另有单条 1500 字节的最终限制。

国际站价格为 $0.01／次。[官方指南](https://docs.z.ai/guides/tools/web-search)示例使用 `count`、域名和时间过滤，但 [API 参考](https://docs.z.ai/api-reference/tools/web-search) 的这些字段说明提到枚举中不存在的 `search_pro_jina`。适配器按指南发送参数，实际过滤与条数效果尚待真实 Key 验证；不提供 Jina 引擎或国际站 `contentSize`。价格依据[国内定价](https://docs.bigmodel.cn/cn/guide/start/pricing)及[国际定价](https://docs.z.ai/guides/overview/pricing)，不承诺空结果或失败免费。

结果读取 `search_result`：有效字符串 `link` 映射为 `url`，`content` 映射为 `text`，原生 `publish_date` 字符串映射为 `age`；标题为空时回退 URL，顶层请求时间 `created` 不作为网页发布日期。先过滤无链接条目再截断，保持顺序。**插件的校验策略**要求明确的结果数组：缺失、null、错误类型，以及非空但完全无有效链接的结果均报错且不缓存；这不是官方 schema 的必填字段保证。合法空数组最多缓存 30 秒。truthy 的 `error` 或已提供、非 null 且不属于 `0`、`"0"`、`200`、`"200"` 的顶层业务 `code` 即使出现在 HTTP 200 中也会报错，不转成虚假的 HTTP 状态。对这些成功码及 falsy `error` 的容忍是代理兼容策略，仍须通过结果数组校验。

HTTP 拒绝保留数值 `status`、有界的上游诊断及校验后的标准 `Retry-After`（整数秒数或标准 HTTP 日期，包括 0）。429 可能表示限流、余额不足或额度耗尽，不能一概解释为并发上限；业务码 1701／1702／1703 分别指国内搜索并发达限／无可用引擎／无有效数据。Key 休眠、轮换和后备调度交给 Magpie，不增加插件内睡眠或自动重试。超时与宿主取消覆盖请求及正文读取，`timeout: 0` 仍保留 `ctx.abort`。

Coding Plan 搜索现作为两个独立 provider 接入，绝不与上述 REST 通道混用：

| 站点 | 适配器 ID | Streamable HTTP MCP 端点 | Key 类型 |
|---|---|---|---|
| 国内站 | `zhipu-coding` | `https://open.bigmodel.cn/api/mcp/web_search_prime/mcp` | 个人／团队 Coding Plan Key |
| 国际站 | `zai-coding` | `https://api.z.ai/api/mcp/web_search_prime/mcp` | 个人／团队 Coding Plan Key |

结果缓存未命中时建立独立 session，顺序为 `initialize` → `notifications/initialized` → `tools/list` → `tools/call` → 尽力 `DELETE`；缓存命中直接返回结果。初始化、发现和工具调用共享 `timeout` 的一次总预算（默认 25000 毫秒），不会每阶段重复获得完整超时；DELETE 清理在该预算之外，使用独立 1000 毫秒上限。`timeout: 0` 只关闭主调用的 provider deadline，仍保留宿主取消，DELETE 仍有自身超时。请求支持 JSON 与 SSE，回传 `Mcp-Session-Id` 和协商后的 `MCP-Protocol-Version`，拒绝重定向；HTTP 拒绝正文不会写入错误，以防代理反射 Key 或 session ID。

MCP 模块集中在 `src/mcp/`，按生命周期策略拆分：[stateless.mjs](../src/mcp/stateless.mjs) 直接调用工具，[session.mjs](../src/mcp/session.mjs) 管理初始化会话；两者平级并共同依赖 [response.mjs](../src/mcp/response.mjs) 解析 JSON／SSE、匹配 RPC ID 与校验 JSON-RPC。共享 reader 不解释工具结果，`isError` 由各自的 `tools/call` 边界校验。是否携带认证头与是否初始化会话是两个独立维度。

两条 MCP 通路经共享 reader 读取的 JSON-RPC 结果响应（初始化、工具发现、工具调用）设置 **10 MiB（10,485,760 字节）** 的本地防御预算，按实际读取的响应体字节累计，包含同一 SSE 流内的行、注释和通知，不依赖 `Content-Length`。超限取消流、释放 reader 并报错，不把正文写入错误或缓存；已建立的 session 仍尝试 DELETE。内容解析器在每层字符串 JSON 解码前另外按 UTF-8 字节检查相同预算。该数值不是上游服务限制；普通 REST、`notifications/initialized` 确认及 DELETE 确认正文使用独立的通用 HTTP 预算（成功 16 MiB、错误 64 KiB）。session 只根据内部超时错误类型归一化总预算，服务器返回的相似错误文本仍作为 RPC 错误报告。

会话入口为 `callSessionMCPTool()`，按调用方给出的工具名列表执行发现与选择。`clientInfo.name` 固定为 `magpie-websearch`，`clientInfo.version` 在模块加载时通过 `createRequire()` 从包根目录 `package.json` 读取。

搜索内容解析独立放在 [search-results.mjs](../src/mcp/search-results.mjs)，不依赖 HTTP 或 session。`mcp/stateless.mjs` 中的 `callMCPSearch()` 组合单次调用和这个解析器；Coding Plan provider 则在会话调用后直接使用解析器，并显式启用 `search_result` 别名、结构化字符串解码和最多三层 JSON 解码。默认策略保持 Parallel／TinyFish 的 `results` 与单层文本 JSON 规则。解析器保留 envelope 元数据，别名归一化为首选数组字段；URL 过滤、结果映射、文本截断和缓存仍由 provider 负责。

每次结果缓存未命中都会重新执行 `tools/list`，优先 `web_search_prime`，兼容官方页面展示的 `webSearchPrime`；前者来自服务返回名称的报告，当前项目尚未用真实 Coding Plan Key 确认。始终发送 `search_query`；仅当本次 `inputSchema.properties` 声明时发送 `count`、`search_recency_filter`、`search_domain_filter`、`content_size`。schema 缺少 `count` 时在本地截断；已配置非默认筛选值但 schema 未声明对应字段时，在 `tools/call` 前明确报错，不静默忽略。这里按属性存在与否选择参数，不是完整 JSON Schema 验证：不在本地执行 `maxLength`、`minimum`／`maximum` 等约束，由服务端校验。

结果优先解析 `structuredContent`，再解析 `content[]` 的文本；允许顶层数组、`results`、`search_result` 及最多三层的字符串 JSON 解码。`link`／`url` 须通过统一的结果 URL 策略（仅绝对 `http:`／`https:`，并拒绝凭证、控制字符和超长地址）；优先使用合法的 `link`，否则回退到合法的 `url`。文本优先取字符串 `content`，否则取字符串 `snippet`；`publish_date` 映射 `age`。先过滤无可用 URL 项再应用本地上限。合法空数组最多缓存 30 秒，非空但完全不可用或无法解析的 payload 报错且不缓存。

每个 provider 实例另有最多 200 项的工具发现元数据缓存，按站点、端点和 Key 的哈希隔离，仅用于重建结果缓存 identity；它不保存或复用网络 session，结果缓存未命中仍会重新发现工具。

Coding Plan Key 与 Standard API Key 不通用；国内／国际凭证、端点、工具发现和缓存完全隔离。MCP 失败不会自动调用按次计费 REST，也不会跨站重发。官方套餐文档使用共享 credits，实施时公布的 Web Search MCP 系数为每次 1.2 credits；它不是匿名或无限额度。官方 Remote MCP 页面说明可供兼容客户端使用，但未明确把 Magpie 列为官方支持客户端，因此当前标记为实验性，使用者应先确认最新 Usage Policy；本项目不声称获得官方 Magpie 支持。

协议依据见[国内 REST 参考](https://docs.bigmodel.cn/api-reference/工具-api/网络搜索)、[国内 MCP](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server)、[国际 MCP](https://docs.z.ai/devpack/mcp/search-mcp-server)与 [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)。

本地验证使用 dummy Key 和模拟服务，覆盖 REST 两站请求、国内引擎差异，以及 Coding Plan 双站的完整 MCP 生命周期、JSON／SSE、结果映射、数量及文本限制、缓存、异常响应、超时、429、Key 轮换与显式后备调度。Magpie 0.1.3141 本地宿主验证不使用真实账户。尚未使用真实 Standard 或 Coding Plan Key 验证搜索成功、国际过滤效果、延迟、实际扣费、账户限流或检索质量。

```sh
magpie plugin options magpie-websearch '{"zhipu":{"engine":"search_pro","contentSize":"high","resultLimit":6},"zai":{"resultLimit":6},"zhipu-coding":{"resultLimit":6},"zai-coding":{"resultLimit":6}}'
```

<a id="stepfun-search"></a>

## StepFun 国内站搜索

使用[官方独立网页搜索 API](https://platform.stepfun.com/docs/zh/api-reference/search/search.md)：`POST https://api.stepfun.com/v1/search`，JSON 请求携带 `Authorization: Bearer <key>`，不调用聊天模型。Key 从 <https://platform.stepfun.com/interface-key> 获取，由 Magpie 管理，不能留空。默认注册 ID 为 `magpie-websearch:stepfun`，显示名为 `StepFun (magpie-websearch)`。

查询先规范化空白并校验非空，文档未公布长度上限，插件不额外截短。请求发送 `query`、`n`，以及可选 `category`：`programming`、`research`、`gov`、`business`；默认省略分类以搜索全部场景。`n` 取 `resolveResultCount(count, countPolicy)`，最多 20 条；过滤无链接条目后再本地截取并保留原顺序，不追加请求补足条数。没有公开分页、域名、时间、语言及安全搜索过滤选项。

默认 `content: "snippet"` 优先摘要，摘要为空白时回退到正文；`"full"` 优先 `content` 正文，正文为空白时回退摘要。选中的文本保留原有缩进和换行，再按 `contentChars` 限制为 4000 个 Unicode 码点，截断时追加 `…`，配置 `0` 保留全部。两种模式都受此上限约束，Magpie 仍有单条 1500 字节的后续限制。API 没有公开关闭正文返回的参数，插件不发送 `include_content`；这些选项只影响本地文本选择。

结果读取 `results` 数组，逐条要求 `url` 通过统一的结果 URL 策略（仅绝对 `http:`／`https:`，并拒绝凭证、控制字符和超长地址）。标题缺失、类型错误或为空白时回退 URL。字符串 `time` 去除首尾空白后作为 `age`，空白或非字符串值省略，不解析成日期或重命名为发布时间：它表示网页的**索引时间**。作为插件校验策略，缺失、null、非数组结果，以及非空但全部无可用 URL 的结果均报错且不缓存；明确的空数组最多缓存 30 秒。HTTP 200 中 truthy 的 `error` 也作为失败处理，不伪造 HTTP 状态。缓存按最终端点、Key、查询、条数、分类、文本模式及预算哈希隔离，每个插件实例独立。

HTTP 失败保留数值 `status`；上游诊断有长度上限，402 使用固定的余额／组织 Credit 提示。401 提示检查国内 Key 与账户权限；429 同时可能表示请求限流、项目或成员 Credit 上限，保留上游错误标识，并透传校验后的标准 `Retry-After`（整数秒或 HTTP 日期，包括 0）；451 提示查询或返回内容审核未通过。Key 休眠、轮换与后备调度由 Magpie 负责，插件不增加睡眠或自动重试。自定义 Base URL 是精确端点，不补路径；请求拒绝重定向。超时和 `ctx.abort` 覆盖请求及正文读取，`timeout: 0` 仍保留宿主取消。

错误详情先提取字符串或数值型 `type`／`code` 并放在消息前，再截断；每个标识保留前 80 个码点，超长时另加 `…`。上游诊断部分最多保留 300 个码点，超长时另加 `… [truncated]`；HTTP 状态前缀、重试提示和操作建议不计入该预算。没有可用结构化字段或正文不是 JSON 时，回退为有界的原始诊断。401／403 等失败响应在正文读取中断或超时后仍保留已知 HTTP 状态，避免阻断 Key 轮换；请求阶段的宿主主动取消则优先报告取消。402 使用固定提示并取消未读响应体，不等待清理完成。

[国内定价](https://platform.stepfun.com/docs/zh/guides/pricing/details.md)为 ¥0.04／次，未明确承诺空结果或失败免费。[速率限制](https://platform.stepfun.com/docs/zh/guides/pricing/rate-limits.md)公布账户分档规则，未单独列出搜索接口的具体限额。[错误码文档](https://platform.stepfun.com/docs/zh/api-reference/error-codes.md)包含 `project_credit_limit_exceeded` 和 `member_project_credit_limit_exceeded` 两类 429，不应都解释为短期限流。

本适配器只支持国内标准 REST。2026-11-05 无 Key 探测国内 REST 返回 401，国际 `/v1/search` 返回 404，国际聊天接口返回 401。[国际站官方文档](https://platform.stepfun.ai/docs/en/guides/developer/integrations/codex.md#connect-stepsearch-mcp)另有 Step Plan 搜索 MCP：`https://api.stepfun.ai/step_plan/v1/mcp/web_search/mcp`（无 Key 返回 401）。它使用另一种协议和套餐通道，不作为本适配器的自动后备地址。

```sh
magpie plugin options magpie-websearch '{"stepfun":{"category":"research","content":"full","resultLimit":6,"contentChars":4000}}'
```

本地使用 dummy Key 和模拟服务验证请求、摘要／正文回退、空结果及异常结构、取消／超时、Credit 429、451、Key 轮换与宿主后备调度。宿主用例还覆盖长错误消息保留 Credit 标识，以及 401 正文中断后继续轮换健康 Key。尚未用真实账户 Key 验证搜索成功、正文返回、延迟、扣费、限流或检索质量。

<a id="perplexity-search"></a>

## Perplexity 搜索

使用[官方独立网页搜索 API](https://docs.perplexity.ai/api-reference/search-post)：`POST https://api.perplexity.ai/search`，JSON 请求携带 `Authorization: Bearer <key>`，不调用模型或 Agent 接口。Key 从 <https://console.perplexity.ai/project/keys> 获取，由 Magpie 管理，不能留空。默认注册 ID 为 `magpie-websearch:perplexity`，显示名为 `Perplexity (magpie-websearch)`。

请求发送 `query`、`max_results` 与 `search_type`，并按配置发送可选筛选参数：
- `searchType` 支持 `web`（默认，官方默认，全面检索）与 `fast`（同构响应，低延迟）。首版不开放批次留待另行评估的 `people` 搜索类型。
- `recency`：映射 `search_recency_filter`，可选 `hour`、`day`、`week`、`month`、`year`；默认留空表示不限制。
- `country`：映射 `country`，去除首尾空白并转为大写后接受空值或两位字母代码（如 `us` 转为 `US`）；显式非法值抛出 TypeError，环境变量非法值记录警告并退回空筛选。不校验代码是否实际分配给某个国家。
- `language`：映射 `search_language_filter` 数组，按逗号拆分、去除各项首尾空白和空项并转为小写后，接受最多 20 项两位字母代码（如 `EN, zh` 转为 `en,zh`）；显式超限或非法抛出 TypeError，环境变量非法值记录警告并退回空数组。不校验代码是否实际分配给某种语言。空字符串显式覆盖环境配置。
- `resultLimit`：显式配置允许 1–20，作为宿主 `count` 的上限；未配置时跟随宿主，无有效宿主数量时回退到 10。

`snippet` 为与查询相关的抽取文本；保留其原有的缩进与换行，按 `contentChars`（默认 4000 码点，`0` 保留全部）进行本地码点截断，截断时追加 `…`。空 snippet 仍保留对应有效 URL。结果中 `url` 必须通过统一结果 URL 策略；无可用 URL 的项直接剔除；标题缺失或空白时回退至 URL。`age` 优先取非空字符串 `date`，为空时回退至非空字符串 `last_updated`，两者均无时省略，不借用 `server_time`。

空结果数组（`results: []`）正常返回并短缓存（至多 30 秒）；非空数组但无一条可用结果则报错且不缓存。HTTP 200 中 truthy 的 `error` 字段触发业务错误（不伪造 HTTP status）。HTTP 失败保留数值 `status`；标准 `Retry-After`（整数秒或规范 HTTP 日期）经清理后透传；超时与取消均不写缓存。

[定价](https://docs.perplexity.ai/docs/getting-started/pricing#search-api-pricing)为 `web` 每千次成功请求 5 美元，`fast` 每千次成功请求 1 美元；成功但空结果仍计费。API 独立预付费，不要求 Pro；部分新账户的一次性 10 美元赠金（60天过期）不作为普遍免费层。

```sh
magpie plugin options magpie-websearch '{"perplexity":{"searchType":"fast","recency":"week","country":"US","language":"en,zh","resultLimit":10}}'
```

本地使用合成 fixture、Node/Bun 单元测试以及真实 Magpie 0.1.3097 宿主沙箱验证了请求格式、模式与筛选参数、空结果/畸形结果、超时、429 Retry-After、Key 轮换与 Linkup 调度 fallback。真实 Key 未验证，真实检索召回、时延与实际 429 响应头未作线上测试；完整测试数量见[开发与本地测试](#development)。

<a id="bocha-search"></a>

## Bocha 搜索

使用[官方独立网页搜索 API](https://open.bochaai.com/)：`POST https://api.bochaai.com/v1/web-search`，JSON 请求携带 `Authorization: Bearer <key>`，不调用第三方模型或 Agent 通道。Key 从 <https://open.bochaai.com/api-keys> 获取，由 Magpie 管理，不能留空。默认注册 ID 为 `magpie-websearch:bocha`，显示名为 `Bocha (magpie-websearch)`。

请求发送 `query`、`count`、`summary`，以及可选 `freshness`：
- `query`：规范化首尾及重复空白并校验非空，空值在请求前拦截报错。
- `count`：通过 `resolveResultCount(count, countPolicy)` 计算；未配置上限时跟随宿主，显式 `resultLimit` 允许 1–50，无有效宿主数量时回退到 10。
- `summary`：默认 `false`，仅选择普通摘要 `snippet`。生成摘要必须显式开启；`summary` 选项只接受 JSON 布尔值，字符串 `"true"` 会抛出 `TypeError`。未设置选项时，`BOCHA_SUMMARY` 去除首尾空白后只接受精确的 `true`／`false`，空值为 false，其他值警告并回退 false。开启时优先选择非空白字符串 `summary`，缺失、空白或类型错误时回退字符串 `snippet`，均无时为空字符串；保留所选文本的原有缩进与换行，不额外调用生成模型。
- `freshness`：时间筛选字符串。支持 `noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear`、`YYYY-MM-DD`、`YYYY-MM-DD..YYYY-MM-DD`；只校验配置类型并去除首尾空白，不在本地校验日期或范围，内容由上游校验。显式空字符串可清除环境时间过滤；空值省略字段，显式 `noLimit` 原样发送。

结果读取 `data.webPages.value` 数组，逐条要求为非数组对象且 `url` 通过统一的结果 URL 策略（仅绝对 `http:`／`https:`，并拒绝凭证、控制字符和超长地址）；先过滤再截取上限并保持排序，非空数组无可用项时报错且不缓存，空数组正常返回。`name` 映射标题，缺失、类型错误或为空白时回退 URL。`age` 优先取非空白字符串 `datePublished`，为空时回退至字符串 `dateLastCrawled`，两者均无时省略；原样保留厂商时间字符串（包括时区标识），不转换时区。

结构校验与错误处理：响应须为非数组对象；`data` 缺失或非对象时报错；`data.webPages` 缺失或为 `null` 时视为合法无结果并短缓存（至多 30 秒）；存在的 `webPages` 须为非数组对象，`value` 必须为数组。HTTP 200 下若已定义的 `code` 既非数值 200 也非字符串 `"200"`，或 `error` 为 truthy，抛出业务错误；诊断按 `code`、`log_id`（分别限制 80 码点）、第一个非空白 message／msg 排序，再进行总长限制，不赋予伪造的 HTTP status 且不写缓存。HTTP 失败保留数值 `status`，包括 401 正文中断；401 追加检查 API Key 的链接（指向 `https://open.bochaai.com/api-keys`），403 追加检查账户权限与余额的链接（指向 `https://open.bochaai.com/overview`），不断言所有 403 都是余额不足。标准 `Retry-After` 整数秒（包括 0）或规范 HTTP 日期经校验清理后透传。

[控制台总览](https://open.bochaai.com/overview)公开“免费领取1000次调用资源包”，具体资格、有效期、是否覆盖生成摘要以账户和官方最新政策为准。生成摘要可能产生额外费用；调研时[价格文档](https://aq6ky2b8nql.feishu.cn/wiki/JYSbwzdPIiFnz4kDYPXcHSDrnZb)需要飞书登录，未读到正文，固定单价、QPS 及空结果是否收费均未核实。历史报价或未加载表单的零元值不作为当前价格；插件不自动退回旧域名。

```sh
magpie plugin options magpie-websearch '{"bocha":{"summary":false,"freshness":"oneWeek","resultLimit":10},"ollama":{"resultLimit":5,"contentChars":2000}}'
```

这条命令会替换完整 options 对象，须同时包含其他希望保留的配置。需要生成摘要时将 `summary` 显式改为 `true`，并先核对账户计费。

<a id="ollama-search"></a>

## Ollama 云端搜索

使用[官方独立网页搜索 API](https://docs.ollama.com/capabilities/web-search.md)：`POST https://ollama.com/api/web_search`，JSON 请求携带 `Authorization: Bearer <key>`。Key 为官方云端账户 API Key，从 <https://ollama.com/settings/keys> 获取，由 Magpie 管理，不能留空；不调用本地 11434 服务、本地模型或 `web_fetch` 工具。默认注册 ID 为 `magpie-websearch:ollama`，显示名为 `Ollama (magpie-websearch)`。

请求仅发送 `query` 与 `max_results`：
- `query`：规范化空白后校验非空。
- `max_results`：通过 `resolveResultCount(count, countPolicy)` 计算；未配置上限时跟随宿主，最多 10 条。显式 `resultLimit` 允许 1–10，无有效宿主数量时回退到 5。

结果读取 `results` 数组，逐条要求为对象且 `url` 通过统一结果 URL 策略；自动剔除不含可用 URL 的项，非空数组无可用项时报错且不缓存。标题缺失或空白时回退 URL。`content` 原文按 `contentChars`（默认 2000 码点，`0` 保留全部）进行本地前缀码点截断，截断时追加 `…`。官方响应不包含日期字段，映射结果省略 `age`，不从正文推测日期。

非字符串 `content` 映射为空字符串，即使上游附带未约定时间字段也省略 `age`。截断仅遍历保留前缀及额外一个码点；本地限制控制映射与缓存体积，Magpie 仍将每条文本处理为最多 1500 字节，不保证模型获得完整正文。

空数组（`results: []`）正常返回并短缓存（至多 30 秒）。HTTP 200 下 `error` 为 truthy 时抛出业务错误（不伪造 HTTP status）。HTTP 失败保留数值 `status`；标准 `Retry-After`（整数秒或规范 HTTP 日期）经清理后透传；超时与取消不写缓存。

[官方发布说明](https://ollama.com/blog/web-search)公布了个人免费层，但固定免费额度、超出后的每次搜索定价及 QPS 配额尚未公开核实；[当前定价页](https://ollama.com/pricing)的模型套餐价格不能外推为搜索额度。

```sh
magpie plugin options magpie-websearch '{"ollama":{"resultLimit":5,"contentChars":2000}}'
```

两家均使用合成 fixture、Node/Bun 单元测试及真实 Magpie 0.1.3097 宿主沙箱验证：Bocha 普通／生成摘要、时效筛选和业务诊断，Ollama 正文截断，以及共同的精确端点、空结果／畸形结果、超时、429 Retry-After、Linkup 后备、429 与 401 正文中断后的顺序 Key 轮换及健康 Key 优先。只使用调用参数 Key，不读取环境 API Key、OSP 凭证、模型配置或本地 Ollama 配置。每实例创建缓存，身份包含端点、请求、凭证和本地文本选择参数；只缓存映射后的成功结果。真实 Key 未验证，线上成功、扣费、检索质量与速率限制未实测。

<a id="jina-search"></a>

## Jina 搜索

使用 [Jina Search API](https://docs.jina.ai/api.md)：`POST https://s.jina.ai/search`，JSON 请求携带 `Authorization: Bearer <key>` 和 `Accept: application/json`。Key 从 <https://jina.ai/?sui=apikey> 获取，由 Magpie 管理，不能留空。请求发送规范化后的非空查询 `q` 和 `num`，后者取 `resolveResultCount(count, countPolicy)`，最多 20 条；可选 `gl`、`hl`、`location` 去除首尾空白后透传，空值省略。

默认 `content: "snippet"` 发送 `X-Respond-With: no-content`，本地仅提取字符串 `description`。`content: "full"` 省略该头，优先非空白字符串 `content`，缺失或空白时回退 `description`。两种模式都按 `contentChars`（默认 4000 码点，0 保留全部）截断选中文本，超长时追加 `…`。默认超时为摘要 25000 毫秒、全文 60000 毫秒，显式 `timeout` 或有效 `JINA_TIMEOUT` 覆盖模式默认值。这里说明适配器发送的选项；本地 dummy 服务不证明线上正文抓取行为或费用。

响应读取 `data` 数组，先过滤 `url` 未通过统一结果 URL 策略的条目，再应用结果上限；非空数组全不可用时报错。标题缺失或空白时回退 URL；`publishedTime` 字符串去除首尾空白后映射为 `age`。若已提供的 `code` 不为数值 200、`status` 不为数值 20000，则视为业务错误；`error` 仅容忍缺失、null、空字符串或空数组，其他值均报错。不伪造 HTTP 状态；缺失、null 或非数组 `data` 报错。

```sh
magpie plugin options magpie-websearch '{"jina":{"content":"full","contentChars":4000,"resultLimit":6}}'
```

<a id="kagi-search"></a>

## Kagi 搜索

使用 [Kagi Search API](https://redocly-api-docs.kagi.com/api/docs/openapi/search/search.md)：`POST https://kagi.com/api/v1/search`，JSON 请求携带 `Authorization: Bearer <key>`。Key 从 <https://kagi.com/api/keys> 获取，由 Magpie 管理，不能留空。请求发送规范化的非空 `query`、固定 `workflow: "search"`，以及取 `resolveResultCount(count, countPolicy)` 的 `limit`（最多 1024；未配置上限时跟随宿主，无有效宿主数量时回退到 10）。这是返回结果上限，不表示上游一定能返回对应数量。

非空 `lens` 映射 `lens_id`，支持命名 Lens 或共享 Lens ID／URL；否则非空 `recency` 映射 `lens.time_relative`（`day`、`week`、`month`）。两者同时配置时 Lens 优先，并在创建适配器时警告；显式 `lens: ""` 可清除环境变量以恢复时间筛选。`region` 映射 `filters.region`。插件不发送 `extract`，不请求额外正文提取。

响应须含对象 `data`；`data.search` 缺失或为空数组时返回 `[]`，其他集合不作为网页结果。`data.search` 为 null／非数组、或非空但没有可用 URL 时报错。有效条目先过滤再截取，`title` 缺失或空白时回退 URL，`snippet` 映射 `text`，字符串 `time` 映射 `age`；适配器没有独立的 `contentChars` 选项。`error` 仅容忍缺失、null 或空数组，其他值均触发业务错误，不伪造 HTTP 状态。

```sh
magpie plugin options magpie-websearch '{"kagi":{"recency":"week","region":"cn","resultLimit":6}}'
```

<a id="serper-search"></a>

## Serper 搜索

使用 `POST https://google.serper.dev/search`，JSON 请求以 `X-API-KEY` 头认证，Key 从 <https://serper.dev/> 获取，由 Magpie 管理，不能留空。它独立于 SerpApi：后者使用 GET 和 URL 中的 `api_key`。请求发送规范化的非空 `q`、固定 `num: 10`，以及可选 `gl`、`hl`、`tbs`；`tbs` 支持 `qdr:h`、`qdr:d`、`qdr:w`、`qdr:m`、`qdr:y`，默认留空省略。显式 `resultLimit`（1–10）与宿主 `count` 仅决定本地截取条数；未配置时跟随宿主且最多 10 条，不改变发送的 `num`。只请求一页，不补足结果。

仅映射 `organic`：过滤 `link` 未通过统一结果 URL 策略的条目后截取，`title` 缺失或空白时回退 URL，字符串 `snippet` 映射 `text`，字符串 `date` 映射 `age`。`organic` 缺失但含对象 `knowledgeGraph`／`answerBox` 或数组 `peopleAlsoAsk`／`relatedSearches` 时返回 `[]`；其他缺失、null／非数组、或非空但无可用链接的结果报错。非空白字符串 `message` 触发业务错误；`error` 仅容忍缺失、null 或空数组，其他值均报错，不伪造 HTTP 状态。适配器没有独立的文本长度选项；缓存身份包含本地条数上限。

```sh
magpie plugin options magpie-websearch '{"serper":{"gl":"cn","hl":"zh-cn","tbs":"qdr:w","resultLimit":6}}'
```

这三家均拒绝重定向，自定义 Base URL 按精确端点使用；HTTP 失败保留数值 `status`，标准 `Retry-After` 经校验清理后透传。配置、缓存及凭证按插件实例隔离，合法空结果最多缓存 30 秒。以上命令会替换完整 options 对象，须包含其他希望保留的配置。合成 fixture、单元测试及 Magpie 0.1.3097 本地沙箱已覆盖请求、结果映射、超时、429、Key 轮换及 Linkup 后备；真实 Key 搜索、计费、质量和线上限流未验证。Magpie 仍会对每条 `text` 应用 1500 字节的最终限制。

<a id="result-processing"></a>

## Magpie 结果处理规范

- Magpie v0.1.3062 起，内置 `web_search` 支持可选 `count`，默认 6，范围 1–20；旧版内置 MCP 固定传入 6。适配器跟随传入数量，再应用显式配置上限和供应商限制，不把当前宿主的 20 条范围硬编码成插件上限。
- 搜狗因上游档位约束至少请求 10 条；Serper 固定请求 `num: 10`；不可配置结果数的接口仅本地截断。有效结果过滤后按所需数量截取，不会通过分页或额外请求补齐不足的条数。
- `text` 会自动剔除 HTML 标签、反转义字符、折叠多余空白并截断至 1500 字节。
- `age` 保留厂商返回的时间字符串格式，仅去除首尾空白；空白或非字符串值省略，不猜测日期或转换时区。StepFun 的该字段是索引时间。
- 结果 `url` 必须是可解析的绝对 `http:`／`https:` 字符串；插件会去除首尾空白并返回规范化后的 `href`。含其他 scheme、URL 内嵌凭证、C0/C1 或 bidi 标记／嵌入／隔离控制符、行分隔符，或原始或规范化后超过 8192 个 UTF-16 代码单元的 URL 会被丢弃。插件不检查可达性，也不会访问结果 URL；它不阻止 localhost／私网字面地址，因此不在这一层做 SSRF 过滤。非空结果中全部 URL 不可用时按畸形结果报错且不缓存；显式空数组仍是合法空结果。标题缺失或空白时回退到规范化后的 URL。
- 抛出带有数值型 `status`（401、402、403、429）的错误被 Magpie 识别为服务商拒绝；对于带 Key 请求，Magpie 会休眠该 Key 并尝试下一个。匿名 429 冷却由本插件自主管理；失败时会触发 Magpie 调度下一可用引擎。
- 429 响应的 `Retry-After` 按适配器策略处理：Bocha、Jina、Kagi、Ollama、Perplexity、SerpApi、Serper、StepFun、Zhipu 和 Z.ai 仅传递校验和规范化后的整数秒数或标准 HTTP 日期；Moonshot 双站优先传递合法标准头，非法或缺失时按[重置头规则](#moonshot-search)回退；其他适配器沿用通用头透传逻辑。
- 公共 HTTP 层对普通 REST 响应设置本地字节预算：成功响应最多 **16 MiB（16,777,216 字节）**，失败响应正文最多 **64 KiB（65,536 字节）**。按 `fetch` 解压后的实际读取字节累计，不依赖 `Content-Length`；超限会取消流并报错，不返回部分结果、不写缓存。非 2xx 超限仍保留数值型 `status` 和适配器提取的重试信息，429 保留重试提示。该预算是本地防御策略，不是上游限制；MCP 的 10 MiB 预算见 [MCP 结果解析](#zhipu-search)。
- 公共 HTTP 层在失败响应正文读取中断或超时后，仍保留已知 `status` 和适配器提取的重试信息；请求阶段的宿主主动取消优先报告取消。此规则不把网络连接失败或 HTTP 200 中的业务错误伪装成 HTTP 拒绝。
- 所有搜索请求均拒绝 HTTP 重定向；自定义 Base URL 仍作为精确端点。标准化后的空查询在发送请求前报错。Linkup、Metaso 和 Querit 与其他要求 Key 的通道一样修剪 Key 首尾空白，空白 Key 不会发送。
- AnySearch、Keenable、Linkup、Metaso、Querit、Parallel 和 TinyFish 要求结果字段为数组，可用行的 URL 必须通过统一结果 URL 策略。显式空数组仍正常返回并最多缓存 30 秒；畸形字段或非空候选数组全无可用行则报错且不缓存。Linkup 先排除图片行，纯图片结果仍可得到合法空数组；Metaso 保留 `webpages` → `results` → `papers` → `documents` → `data` 的 nullish 回退顺序。
- AnySearch、Querit 和 Moonshot 双站的业务错误消息最多保留 300 码点，超长另加 `… [truncated]`；AnySearch、Querit 的动态业务码和请求标识各保留最多 80 码点，超长另加 `…`。预算不包含固定前缀和标记。短错误格式保持不变，不因业务消息伪造 HTTP status。

<a id="configuration"></a>

## 完整配置参考

所有选项均为可选，包括各厂商的子对象字段以及顶层的 `enable`/`disable` 过滤器。未设置的字段将自动回退到对应的环境变量；若环境变量亦未定义，则使用表中默认值。`resultLimit` 的默认值是“未设置”，此时跟随宿主 `count`，不套用固定数量。

在桌面客户端中通过 **Plugins → Installed → Options** 配置，或通过命令行传递 JSON 对象。例如仅调整特定引擎参数而保持全量注册：

```sh
magpie plugin options magpie-websearch '{"linkup":{"depth":"deep","resultLimit":4,"timeout":25000,"cacheTTL":600000},"anysearch":{"zone":"cn","language":"zh-CN"}}'
```

每次命令都会替换已保存的完整选项对象，因此需包含所有希望保留的选项。保存后 Magpie 会重载插件宿主进程；各插件实例拥有独立的配置和缓存。

参数解析优先级：**显式插件选项 → 环境变量 → 默认值**；数量选项的新旧名称优先级见下文。已注册供应商的显式已知字段取值非法时，插件加载失败并报告具体字段；未知字段会被忽略。显式数值必须为符合表中范围的 JSON 安全整数（不超过 9,007,199,254,740,991），不能使用数字字符串；字符串选项会去除首尾空白后校验。

所有供应商统一使用可选的 `resultLimit` 设置用户上限，未设置表示自动跟随宿主。内部 `countPolicy` 分别保存用户上限 `configuredLimit`、缺少宿主数量时的回退值 `fallbackCount`、适配器上限 `providerMax`，不把三者统称为默认最大结果数：

- 未设置选项且没有合法的对应环境变量时，跟随宿主传入的有效 `count`，受供应商／适配器上限约束。
- 显式选项或合法环境变量作为用户上限；取宿主数量、用户上限和供应商上限的最小值。选项优先于环境变量，用户设置更小的值仍然生效。
- 宿主未传有效正数 `count` 时才使用回退数量：多数供应商为 10，Ollama 为 5，Querit 为 8；显式配置存在时用其值作为回退。空白或非法环境变量不会产生额外上限，合法环境值仍按字段范围限制。

下表数量选项默认“未设置”，表示不额外限制宿主 `count`，并不保证能取得对应条数。已有用户显式保存的 10 或 5 仍然是上限；如需恢复自动跟随，应从完整 options 对象中移除相应字段，并清除对应环境变量。

旧配置保留为兼容别名并给出迁移提示：`maxResults` → `resultLimit`、`*_MAX_RESULTS` → `*_RESULT_LIMIT`；Querit 为 `count` → `resultLimit`、`QUERIT_COUNT` → `QUERIT_RESULT_LIMIT`。优先级为新选项 → 旧选项 → 新环境变量 → 旧环境变量。新环境变量非空但非法时按未配置处理，不回退读取旧环境变量；空白的新环境变量视同未设置，会继续读取旧环境变量。供应商协议字段不变，例如 Linkup 请求体仍使用 `maxResults`，Querit 请求体和宿主工具参数仍使用 `count`。

环境变量遵循各自的回退规则：空白值视为未设置；`timeout`、`cacheTTL` 等数值无法解析为非负安全整数时使用默认值，合法数值再限制到该字段允许的范围；枚举字符串不合法时记录警告并使用默认值。数量环境变量例外：非空但非法的 `*_RESULT_LIMIT` 不构成用户上限，只有宿主没有有效 `count` 时才使用 `fallbackCount`。`timeout` 与 `cacheTTL` 单位为毫秒，`timeout` 最大为 2,147,483,647 毫秒。设置 `timeout: 0` 取消插件自身的超时保护，但 Magpie 宿主的取消信号与期限仍生效；设置 `cacheTTL: 0` 关闭内存缓存。

各 API 使用有容量上限的内存搜索缓存，按最终端点、凭证及请求参数（包括结果数）整体哈希隔离。空结果最多缓存 30 秒。

各厂商配置项清单：

| 厂商 | 选项名 | 环境变量 | 默认值 | 可选值 / 说明 |
|---|---|---|---|---|
| anysearch | `cacheTTL` | `ANYSEARCH_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| anysearch | `resultLimit` | `ANYSEARCH_RESULT_LIMIT` | 未设置 | 1–10；显式请求结果上限 |
| anysearch | `tag` | `ANYSEARCH_TAG` | 留空 | 意图标签，例如 `code.snippet` |
| anysearch | `zone` | `ANYSEARCH_ZONE` | 留空 | 留空、`cn`、`intl` |
| anysearch | `language` | `ANYSEARCH_LANGUAGE` | 留空 | 语言代码，例如 `zh-CN` |
| anysearch | `format` | `ANYSEARCH_FORMAT` | `markdown` | `markdown`、`json` |
| anysearch | `timeout` | `ANYSEARCH_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| bocha | `cacheTTL` | `BOCHA_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| bocha | `timeout` | `BOCHA_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| bocha | `resultLimit` | `BOCHA_RESULT_LIMIT` | 未设置 | 1–50；显式请求及本地结果上限 |
| bocha | `freshness` | `BOCHA_FRESHNESS` | 留空 | 时间筛选，如 `oneWeek`、`YYYY-MM-DD..YYYY-MM-DD`；留空时不发送 |
| bocha | `summary` | `BOCHA_SUMMARY` | `false` | `false`（普通摘要）、`true`（生成摘要）；显式布尔值 |
| jina | `cacheTTL` | `JINA_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| jina | `content` | `JINA_CONTENT` | `snippet` | `snippet`（摘要）、`full`（全文正文） |
| jina | `timeout` | `JINA_TIMEOUT` | 摘要 `25000`；全文 `60000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消；覆盖模式默认 |
| jina | `resultLimit` | `JINA_RESULT_LIMIT` | 未设置 | 1–20；显式请求及本地结果上限 |
| jina | `contentChars` | `JINA_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| jina | `gl` | `JINA_GL` | 留空 | 国家代码，例如 `us` |
| jina | `hl` | `JINA_HL` | 留空 | 语言代码，例如 `zh-cn` |
| jina | `location` | `JINA_LOCATION` | 留空 | 城市或地理位置字符串 |
| kagi | `cacheTTL` | `KAGI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| kagi | `timeout` | `KAGI_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| kagi | `resultLimit` | `KAGI_RESULT_LIMIT` | 未设置 | 1–1024；显式请求及本地结果上限 |
| kagi | `lens` | `KAGI_LENS` | 留空 | 命名或共享 Lens ID / URL；优先于 `recency` |
| kagi | `recency` | `KAGI_RECENCY` | 留空 | 留空、`day`、`week`、`month`；未设 lens 时生效 |
| kagi | `region` | `KAGI_REGION` | 留空 | 国家代码，如 `cn`、`us`，映射 `filters.region` |
| keenable | `cacheTTL` | `KEENABLE_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| keenable | `resultLimit` | `KEENABLE_RESULT_LIMIT` | 未设置 | 1–50；显式上限 |
| keenable | `mode` | `KEENABLE_MODE` | 留空 | 留空、`pro`、`realtime` |
| keenable | `title` | `KEENABLE_TITLE` | `magpie-websearch` | `X-Keenable-Title` 标头，最长 256 字符 |
| keenable | `timeout` | `KEENABLE_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| linkup | `cacheTTL` | `LINKUP_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| linkup | `depth` | `LINKUP_DEPTH` | `fast` | `flash`、`fast`、`standard`、`deep` |
| linkup | `resultLimit` | `LINKUP_RESULT_LIMIT` | 未设置 | 1–100；显式上限，上游限制仍适用 |
| linkup | `contentChars` | `LINKUP_CONTENT_CHARS` | `4000` | 每条摘录的 Unicode 码点上限（`0` 保留全部） |
| linkup | `timeout` | `LINKUP_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| metaso | `cacheTTL` | `METASO_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| metaso | `scope` | `METASO_SCOPE` | `webpage` | `webpage`、`document`、`paper`、`image`、`video`、`podcast` |
| metaso | `resultLimit` | `METASO_RESULT_LIMIT` | 未设置 | 1–50；显式上限 |
| metaso | `contentChars` | `METASO_CONTENT_CHARS` | `4000` | 每条摘录的 Unicode 码点上限（`0` 保留全部） |
| metaso | `timeout` | `METASO_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot | `cacheTTL` | `MOONSHOT_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| moonshot | `timeout` | `MOONSHOT_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot | `resultLimit` | `MOONSHOT_RESULT_LIMIT` | 未设置 | 1–20；显式请求结果上限 |
| moonshot | `content` | `MOONSHOT_CONTENT` | `snippet` | `snippet`（摘要）、`full`（全文正文） |
| moonshot | `contentChars` | `MOONSHOT_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限（`0` 保留全部） |
| moonshot-cn | `cacheTTL` | `MOONSHOT_CN_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| moonshot-cn | `timeout` | `MOONSHOT_CN_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| moonshot-cn | `resultLimit` | `MOONSHOT_CN_RESULT_LIMIT` | 未设置 | 1–20；显式请求结果上限 |
| moonshot-cn | `content` | `MOONSHOT_CN_CONTENT` | `snippet` | `snippet`（摘要）、`full`（全文正文） |
| moonshot-cn | `contentChars` | `MOONSHOT_CN_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限（`0` 保留全部） |
| ollama | `cacheTTL` | `OLLAMA_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| ollama | `timeout` | `OLLAMA_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| ollama | `resultLimit` | `OLLAMA_RESULT_LIMIT` | 未设置 | 1–10；显式请求及本地结果上限 |
| ollama | `contentChars` | `OLLAMA_CONTENT_CHARS` | `2000` | 每条 content 的 Unicode 码点上限；0 保留全部 |
| parallel | `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| parallel | `timeout` | `PARALLEL_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0；包含 MCP 流读取 |
| parallel | `resultLimit` | `PARALLEL_RESULT_LIMIT` | 未设置 | 1–20；显式上限 |
| parallel | `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | 每条拼接摘录的 Unicode 码点上限（`0` 保留全部） |
| parallel | `mode` | `PARALLEL_MODE` | `fast` | `fast`、`turbo`、`basic`、`advanced`（非 fast 模式需填 Key） |
| perplexity | `cacheTTL` | `PERPLEXITY_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| perplexity | `timeout` | `PERPLEXITY_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| perplexity | `resultLimit` | `PERPLEXITY_RESULT_LIMIT` | 未设置 | 1–20；显式请求及本地结果上限 |
| perplexity | `searchType` | `PERPLEXITY_SEARCH_TYPE` | `web` | `web`、`fast`；首版不开放 `people` |
| perplexity | `recency` | `PERPLEXITY_RECENCY` | 留空 | 留空、`hour`、`day`、`week`、`month`、`year`；映射 `search_recency_filter` |
| perplexity | `country` | `PERPLEXITY_COUNTRY` | 留空 | 去空白并转大写后校验为 2 位字母，如 `us` → `US`；留空时不发送 |
| perplexity | `language` | `PERPLEXITY_LANGUAGE` | 留空 | 按逗号拆分、去空白／空项并转小写后校验；最多 20 项 2 位字母，如 `EN, zh` → `en,zh` |
| perplexity | `contentChars` | `PERPLEXITY_CONTENT_CHARS` | `4000` | 每条 snippet 的 Unicode 码点上限；0 保留全部 |
| querit | `cacheTTL` | `QUERIT_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| querit | `resultLimit` | `QUERIT_RESULT_LIMIT` | 未设置 | ≥ 1；显式结果数上限，Querit 自身限制仍适用 |
| querit | `timeout` | `QUERIT_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `cacheTTL` | `SERPAPI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| serpapi | `timeout` | `SERPAPI_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| serpapi | `resultLimit` | `SERPAPI_RESULT_LIMIT` | 未设置 | 1–10；显式本地截取上限 |
| serpapi | `location` | `SERPAPI_LOCATION` | 留空 | 发起地点，例如 `Austin, Texas, United States` |
| serpapi | `gl` | `SERPAPI_GL` | 留空 | 国家代码，例如 `us` |
| serpapi | `hl` | `SERPAPI_HL` | 留空 | 界面语言代码，例如 `zh-cn` |
| serpapi | `googleDomain` | `SERPAPI_GOOGLE_DOMAIN` | 留空 | Google 域名，例如 `google.com` |
| serpapi | `safe` | `SERPAPI_SAFE` | 留空 | 留空、`active`、`off` |
| serper | `cacheTTL` | `SERPER_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| serper | `timeout` | `SERPER_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| serper | `resultLimit` | `SERPER_RESULT_LIMIT` | 未设置 | 1–10；显式本地上限（上游固定单页 10 条） |
| serper | `gl` | `SERPER_GL` | 留空 | 国家代码，例如 `cn`、`us` |
| serper | `hl` | `SERPER_HL` | 留空 | 界面语言代码，例如 `zh-cn`、`en` |
| serper | `tbs` | `SERPER_TBS` | 留空 | 留空、`qdr:h`、`qdr:d`、`qdr:w`、`qdr:m`、`qdr:y` |
| stepfun | `cacheTTL` | `STEPFUN_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| stepfun | `timeout` | `STEPFUN_TIMEOUT` | `25000` | 0–2147483647 毫秒；0 关闭插件超时，保留宿主取消 |
| stepfun | `resultLimit` | `STEPFUN_RESULT_LIMIT` | 未设置 | 1–20；显式请求及本地结果上限 |
| stepfun | `category` | `STEPFUN_CATEGORY` | 留空 | 留空、`programming`、`research`、`gov`、`business` |
| stepfun | `content` | `STEPFUN_CONTENT` | `snippet` | `snippet`（摘要）、`full`（正文）；仅本地选择 |
| stepfun | `contentChars` | `STEPFUN_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| tinyfish | `cacheTTL` | `TINYFISH_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| tinyfish | `timeout` | `TINYFISH_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0；包含 MCP 流读取 |
| tinyfish | `resultLimit` | `TINYFISH_RESULT_LIMIT` | 未设置 | ≥ 1；显式本地上限，不保证上游页大小 |
| tinyfish | `location` | `TINYFISH_LOCATION` | 留空 | 国家地区代码，如 `US`；留空时不发送 |
| tinyfish | `language` | `TINYFISH_LANGUAGE` | 留空 | 语言代码，如 `zh`；留空时不发送 |
| tinyfish | `domainType` | `TINYFISH_DOMAIN_TYPE` | `web` | `web`、`news`、`research_paper`（学术论文模式需填 Key） |
| tinyfish | `includeDomains` | `TINYFISH_INCLUDE_DOMAINS` | 留空 | 包含域名列表（逗号分隔） |
| tinyfish | `excludeDomains` | `TINYFISH_EXCLUDE_DOMAINS` | 留空 | 排除域名列表（逗号分隔） |
| zai | `cacheTTL` | `ZAI_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zai | `timeout` | `ZAI_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| zai | `resultLimit` | `ZAI_RESULT_LIMIT` | 未设置 | 1–50；显式本地结果上限 |
| zai | `contentChars` | `ZAI_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zai | `recency` | `ZAI_RECENCY` | `noLimit` | `noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear`；效果待实测 |
| zai | `domainFilter` | `ZAI_DOMAIN_FILTER` | 留空 | 单个白名单域名；效果待实测 |
| zai-coding | `cacheTTL` | `ZAI_CODING_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zai-coding | `timeout` | `ZAI_CODING_TIMEOUT` | `25000` | 初始化至工具返回的总超时；0 保留宿主取消；DELETE 另有 1000ms 上限 |
| zai-coding | `resultLimit` | `ZAI_CODING_RESULT_LIMIT` | 未设置 | ≥ 1；schema 支持时上送 `count`，否则本地截断 |
| zai-coding | `contentChars` | `ZAI_CODING_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zai-coding | `recency` | `ZAI_CODING_RECENCY` | `noLimit` | `noLimit` 或 `oneDay`／`oneWeek`／`oneMonth`／`oneYear`；取决于实时 schema |
| zai-coding | `domainFilter` | `ZAI_CODING_DOMAIN_FILTER` | 留空 | 单个域名；仅 schema 支持时发送 |
| zai-coding | `contentSize` | `ZAI_CODING_CONTENT_SIZE` | 留空 | 留空、`medium`、`high`；仅 schema 支持时发送 |
| zhipu | `cacheTTL` | `ZHIPU_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zhipu | `timeout` | `ZHIPU_TIMEOUT` | `25000` | 超时时间（毫秒），≥ 0 |
| zhipu | `resultLimit` | `ZHIPU_RESULT_LIMIT` | 未设置 | 1–50；显式本地上限；搜狗向上取档，夸克省略 count |
| zhipu | `contentChars` | `ZHIPU_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zhipu | `recency` | `ZHIPU_RECENCY` | `noLimit` | `noLimit`、`oneDay`、`oneWeek`、`oneMonth`、`oneYear` |
| zhipu | `domainFilter` | `ZHIPU_DOMAIN_FILTER` | 留空 | 单个白名单域名；夸克不支持 |
| zhipu | `engine` | `ZHIPU_ENGINE` | `search_std` | `search_std`、`search_pro`、`search_pro_sogou`、`search_pro_quark` |
| zhipu | `contentSize` | `ZHIPU_CONTENT_SIZE` | `medium` | `medium`、`high`；上游摘要长度 |
| zhipu-coding | `cacheTTL` | `ZHIPU_CODING_CACHE_TTL` | `600000` | 缓存时间（毫秒），≥ 0 |
| zhipu-coding | `timeout` | `ZHIPU_CODING_TIMEOUT` | `25000` | 初始化至工具返回的总超时；0 保留宿主取消；DELETE 另有 1000ms 上限 |
| zhipu-coding | `resultLimit` | `ZHIPU_CODING_RESULT_LIMIT` | 未设置 | ≥ 1；schema 支持时上送 `count`，否则本地截断 |
| zhipu-coding | `contentChars` | `ZHIPU_CODING_CONTENT_CHARS` | `4000` | 每条文本的 Unicode 码点上限；0 保留全部 |
| zhipu-coding | `recency` | `ZHIPU_CODING_RECENCY` | `noLimit` | `noLimit` 或 `oneDay`／`oneWeek`／`oneMonth`／`oneYear`；取决于实时 schema |
| zhipu-coding | `domainFilter` | `ZHIPU_CODING_DOMAIN_FILTER` | 留空 | 单个域名；仅 schema 支持时发送 |
| zhipu-coding | `contentSize` | `ZHIPU_CODING_CONTENT_SIZE` | 留空 | 留空、`medium`、`high`；仅 schema 支持时发送 |

表中的 `contentChars` 表示截断前保留的 Unicode 码点数，不是最终文本长度；截断时还会追加一个 `…`，因此实际长度可能多 1 个码点。

环境变量在创建插件实例时读取，必须存在于 Magpie 进程的环境中。在另一个终端设置变量不会改变已经运行的桌面客户端；桌面使用建议优先配置插件选项。

<a id="registration-filters"></a>

## 可选注册过滤（enable / disable）

顶层的 `enable` 与 `disable` 数组可控制插件向 Magpie 注册哪些 API。传入短名称（如 `linkup`，不带 `magpie-websearch:` 前缀）。

| 过滤器设置 | 实际向 Magpie 注册的 API |
|---|---|
| 省略未设，或 `{}` | 全部 21 个 API 均注册 |
| `"enable": ["linkup", "querit"]` | 仅注册 Linkup 与 Querit |
| `"disable": ["keenable"]` | 注册除 Keenable 外的其余 API |
| `"enable": ["linkup", "querit"], "disable": ["querit"]` | 仅注册 Linkup（`disable` 优先级高于 `enable`） |
| `"enable": []` | 一个都不注册 |
| `"disable": []` | 不排除任何 API；若同时设置 `enable`，仍受其限制 |

示例：过滤掉 Keenable，同时指定 Linkup 深度搜索参数：

```sh
magpie plugin options magpie-websearch '{"disable":["keenable"],"linkup":{"depth":"deep","resultLimit":4}}'
```

未知 ID 会被记录并忽略；显式 `enable` 列表不含任何已知 ID 时，不注册 API 并记录警告。过滤器不是数组时，记录警告并忽略；供应商配置字段非法则按[完整配置参考](#configuration)中的规则导致加载失败。

这些过滤器控制注册范围。Magpie 网页搜索界面的开关独立控制已注册 API 是否参与搜索，关闭时保留其 Key 和顺序，无需设置过滤器即可使用。

移除所有已保存的插件选项，包括供应商覆盖项与过滤器：

```sh
magpie plugin options magpie-websearch off
```

全部 21 个 API 会重新注册。供应商配置优先取环境变量，否则使用默认值。若只想移除过滤器，请保存包含所有需要保留的供应商配置的完整选项对象。

<a id="development"></a>

## 开发与本地测试

新增供应商配置时，环境变量按“供应商短 ID 转大写下划线形式 + `_` + 配置字段转大写下划线形式”命名，例如 `moonshot-cn.resultLimit` 对应 `MOONSHOT_CN_RESULT_LIMIT`，`cacheTTL` 对应后缀 `CACHE_TTL`。配置字段名须为字符串，使用 camelCase；该约定由本地适配器定义。数量策略统一通过 `configCountPolicy` 解析，历史别名通过 `legacyOption`／`legacyEnv` 声明；其他配置保留历史环境别名时，可显式传入供应商短 ID 作为 `namespace`。完整规则见[供应商接入规范](../PROVIDERS.md#configuration-naming)。

正文截断复用 `truncateCodePoints(text, limit)`：调用者传入字符串和已校验的非负整数，函数不校验类型、不裁剪空白或归一化文本；0 保留全部，超长时保留前 N 个码点并另加 `…`。只遍历保留前缀及额外一个码点，不展开全文。正文选择与字段容错由适配器负责。

`requestResponse`／`requestJSON` 可接收同步 `errorDetailFromBody(raw, response)` 回调，在非成功 HTTP 响应的正文读取完成后、诊断截断前格式化厂商详情；返回非字符串或抛错时回退原始正文。该状态的固定 `messages`、敏感模式与隐藏 402 正文的策略优先，不调用该回调。回调不处理 HTTP 200 中的业务错误，此类错误由适配器自行校验。正文读取失败仍保留已知 HTTP 状态及重试信息，请求阶段的宿主主动取消优先。默认成功体预算为 16 MiB、失败体预算为 64 KiB；测试可通过内部选项 `maxResponseBytes`／`maxErrorBytes` 缩小预算，不将其作为用户配置暴露。

```sh
npm test          # node:test 单元测试（无依赖）
npm run check     # 校验 search hook 契约并运行单元测试
npm run check:bun # 在 Bun 下运行相同检查与测试（PATH 中需有 Bun；临时运行方法见下文）
npm run smoke:magpie # 在独立沙箱中启动真实 Magpie 进程进行完整烟雾测试
```

Magpie 通过其管理的 **Bun** 运行插件。基于 Node 的开发命令要求 **Node.js 20.3.0 或更新版本**，依赖 `AbortSignal.any` 组合超时和取消信号；`check:bun` 直接在 Bun 下运行。本插件使用 Magpie 的 `search` hook；`package.json` 中的 `opencode` 关键词用于 Magpie 的 npm 插件发现。

Node 与 Bun 的测试入口均通过 `scripts/test.mjs` 枚举 `test/` 目录中的 `*.test.mjs` 普通文件，再以参数数组启动当前运行时；不依赖 shell 展开 glob，也不把 `harness.mjs` 和 `cases.mjs` 作为独立测试文件。新增符合命名规则的测试文件无需修改 package.json。

`npm run smoke:magpie` 测试脚本要求环境变量 PATH 中存在 `magpie` 可执行文件（或通过 `MAGPIE_BIN` 指定）。脚本创建独立的沙箱配置环境、隔离账户发现、在随机回环端口启动网关，验证插件加载、注册过滤、自定义 URL、宿主 `count` 传递与显式 `resultLimit` 上限、超时中断、匿名 429 冷却与后备调度、Parallel 及 TinyFish 的 MCP／REST，以及 SerpApi、Perplexity、StepFun、Bocha、Ollama、Jina、Kagi、Serper、Moonshot 双站和 Zhipu／Z.ai 的带 Key 协议。Moonshot 用例覆盖秒／毫秒重置头、超限值忽略与 Key 休眠排序；Zhipu／Z.ai REST 用例覆盖搜狗档位、本地截断、业务错误、查询长度、Key 轮换和跨站后备凭证隔离，Coding Plan 用例覆盖双站完整 MCP session、JSON／SSE、总超时、401 轮换、429 与不隐式降级 REST；StepFun 用例覆盖分类、正文、异常结果、Credit 429、451 和 Key 轮换；Perplexity 用例覆盖 fast 模式、筛选参数、异常、超时、429 Retry-After、Key 轮换与后备调度；Bocha 用例覆盖普通摘要默认值、显式开启生成摘要与时效筛选、业务错误 code/msg/log_id、429 Retry-After 与健康 Key 轮换；Ollama 用例覆盖前缀码点截断、429 Retry-After 与顺序 Key 轮换；Jina 用例覆盖摘要／全文、正文截断与请求头切换；Kagi 用例覆盖 Lens 优先级、清空 Lens 后恢复时间筛选及地区过滤；Serper 用例覆盖固定 num、本地截取与 SerpApi 的端点／凭证隔离。测试完成后自动清理沙箱，搜索请求只访问本地模拟服务并使用 dummy Key，不调用付费搜索；Magpie 自身启动时仍可能独立获取模型目录等公共资源。

可用 `MAGPIE_PLUGIN_DIR` 指定解包后的 npm 插件目录，目录名应保持为 `magpie-websearch` 以维持 Vendor ID。`MAGPIE_SMOKE_ROOT` 可覆盖测试沙箱使用的系统临时目录。CI 分别运行 Node 22／24、Bun 检查和解包后的 npm 包 Magpie 验证，三个作业之间没有顺序依赖。

0.7.0 发布时的本地验证使用 **Node.js 24.19.0、Bun 1.4.4、magpie 0.1.3141**，Node 与 Bun 均通过 329 项测试（26 个测试文件），完整 Magpie 沙箱验证通过。2026-11-07 本轮加固后，**Node.js 20.3.0、Node.js 24.19.0 和 Bun 1.4.4 均通过 371 项测试（28 个测试文件）**；Windows npm/cmd 的 `check:bun` 入口也通过。完整宿主沙箱在 **magpie 0.1.3216** 通过，覆盖注册、数量、超时、匿名冷却、Key 轮换、后备调度和双站 MCP 生命周期。新增测试验证畸形结果不缓存、合法空结果及字段回退、Key/query 守卫、真实 HTTP 重定向拒绝、诊断截断、REST 16 MiB／64 KiB 字节预算、MCP 精确字节预算和超限清理，以及伪装超时的 RPC 文本。

结果 URL scheme 校验新增 9 项回归测试；当前 Node 套件为 **380 项并通过**，覆盖协议白名单、URL 凭证、控制字符、超长地址、全非法结果、过滤发生在截取之前、字段映射，以及 Coding Plan 的 `link`／`url` 回退。Bun 与 Magpie 宿主 smoke 需在发布前重新运行；这里不把尚未运行的结果写成已验证。

Bun 通过 `npm exec --yes --package=bun@1.4.4 -- bun run check:bun` 临时运行，不增加项目依赖或 lockfile。Windows 可通过 `MAGPIE_BIN` 指定实际的 Magpie 可执行文件；未设置时使用 PATH 中的 `magpie`。这些验证使用本地模拟服务与 dummy Key，不代表真实账户搜索、质量或计费验证。此前 **magpie 0.1.2911／0.1.2964／0.1.3026／0.1.3035／0.1.3041／0.1.3097** 的记录属于历史验证；这些记录均不代表最低支持版本。

本地文件夹安装以文件夹名作为插件短名称。包名为 `@guotree/magpie-websearch`，文件夹名为 `magpie-websearch` 时，两种安装方式均使用 `magpie-websearch:*` ID。
