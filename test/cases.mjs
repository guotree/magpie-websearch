// Original response fixtures sourced from guotree/opencode-search-plugin test/cases.ts
// at v4.6.1, with expected results in magpie's { title, url, text, age? } shape.
// Cases cover full content, snippet fallback, missing URLs and image filtering.

// Standalone search schemas read 2026-11-05; synthetic malformed rows exercise
// filtering. These are not real account responses.
// https://docs.bigmodel.cn/api-reference/工具-api/网络搜索
// https://docs.z.ai/api-reference/tools/web-search
export const ZHIPU_CASE = {
  response: {
    id: "search-cn", created: 1793836800,
    search_result: [
      { title: "No link", content: "dropped" },
      { title: "Zhipu hit", link: "https://example.com/zhipu", content: "Zhipu snippet", publish_date: "2025-05-23", media: "Example", refer: "ref_1" },
      { link: "https://example.com/zhipu-bare", content: null },
    ],
  },
  expected: [
    { title: "Zhipu hit", url: "https://example.com/zhipu", text: "Zhipu snippet", age: "2025-05-23" },
    { title: "https://example.com/zhipu-bare", url: "https://example.com/zhipu-bare", text: "" },
  ],
}

export const ZAI_CASE = {
  response: {
    id: "search-intl", created: 1793836800,
    search_result: [
      { title: "Z.ai hit", link: "https://example.com/zai", content: "Z.ai snippet", publish_date: "2025-05-23" },
      { title: "No link", content: "dropped" },
      { link: "https://example.com/zai-bare" },
    ],
  },
  expected: [
    { title: "Z.ai hit", url: "https://example.com/zai", text: "Z.ai snippet", age: "2025-05-23" },
    { title: "https://example.com/zai-bare", url: "https://example.com/zai-bare", text: "" },
  ],
}

// StepFun REST reference read 2026-11-05; synthetic nullable/missing fields.
// https://platform.stepfun.com/docs/zh/api-reference/search/search.md
export const STEPFUN_CASE = {
  response: {
    query: "q", category: "",
    results: [
      { title: "Missing URL", snippet: "dropped" },
      { url: "https://example.com/stepfun", position: 1, title: "StepFun hit", time: "2026-03-20T00:00:00", snippet: "StepFun snippet", content: "StepFun full body" },
      { url: "https://example.com/stepfun-body", title: null, time: null, snippet: " ", content: "Body fallback" },
    ],
  },
  expected: [
    { title: "StepFun hit", url: "https://example.com/stepfun", text: "StepFun snippet", age: "2026-03-20T00:00:00" },
    { title: "https://example.com/stepfun-body", url: "https://example.com/stepfun-body", text: "Body fallback" },
  ],
}

export const ANYSEARCH_CASE = {
  response: {
    code: 0,
    data: {
      results: [
        {
          title: "AnySearch hit",
          url: "https://example.com/anysearch",
          snippet: "AnySearch snippet",
        },
        {
          title: "AnySearch full",
          url: "https://example.com/anysearch-full",
          snippet: "short",
          content: "full body",
        },
        {
          title: "No URL",
          snippet: "dropped",
        },
      ],
    },
  },
  expected: [
    {
      url: "https://example.com/anysearch",
      title: "AnySearch hit",
      text: "AnySearch snippet",
    },
    {
      url: "https://example.com/anysearch-full",
      title: "AnySearch full",
      text: "full body",
    },
  ],
}

export const KEENABLE_CASE = {
  response: {
    query: "a query",
    mode: "pro",
    results: [
      {
        title: "Keenable hit",
        url: "https://example.com/keenable",
        description: "Keenable description",
        snippet: "Keenable snippet",
        published_at: "2026-10-01T12:00:00Z",
      },
      {
        title: "Keenable fallback",
        url: "https://example.com/keenable-fallback",
        description: "Keenable description",
        snippet: "",
      },
      {
        title: "No URL",
        snippet: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/keenable",
      title: "Keenable hit",
      text: "Keenable snippet",
      age: "2026-10-01T12:00:00Z",
    },
    {
      url: "https://example.com/keenable-fallback",
      title: "Keenable fallback",
      text: "Keenable description",
    },
  ],
}

export const LINKUP_CASE = {
  response: {
    results: [
      {
        name: "Linkup hit",
        url: "https://example.com/linkup",
        content: "Linkup content",
      },
      {
        name: "Linkup image",
        url: "https://example.com/image.png",
        content: "",
        type: "image",
      },
      {
        name: "No URL",
        content: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/linkup",
      title: "Linkup hit",
      text: "Linkup content",
    },
  ],
}

export const METASO_CASE = {
  response: {
    credits: 3,
    total: 21,
    webpages: [
      {
        title: "Metaso hit",
        link: "https://example.com/metaso",
        snippet: "Metaso snippet",
        date: "2026-11-04",
      },
      {
        title: "Metaso fallback",
        link: "https://example.com/metaso-fallback",
        snippet: "Solo snippet",
      },
      {
        title: "",
        link: "https://example.com/bare",
      },
      {
        title: "No URL",
        snippet: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/metaso",
      title: "Metaso hit",
      text: "Metaso snippet",
      age: "2026-11-04",
    },
    {
      url: "https://example.com/metaso-fallback",
      title: "Metaso fallback",
      text: "Solo snippet",
    },
    {
      url: "https://example.com/bare",
      title: "https://example.com/bare",
      text: "",
    },
  ],
}

export const QUERIT_CASE = {
  response: {
    error_code: 200,
    results: {
      result: [
        {
          url: "https://example.com/querit",
          title: "Querit hit",
          snippet: "Querit snippet",
          page_age: "2026-10-01",
        },
        {
          url: "https://example.com/querit-sentences",
          title: "Querit sentences",
          sentence: ["first match", "second match"],
        },
        {
          url: "https://example.com/querit-bare",
          title: "Querit bare",
        },
        {
          title: "No URL",
          snippet: "dropped",
        },
      ],
    },
  },
  expected: [
    {
      url: "https://example.com/querit",
      title: "Querit hit",
      text: "Querit snippet",
      age: "2026-10-01",
    },
    {
      url: "https://example.com/querit-sentences",
      title: "Querit sentences",
      text: "first match second match",
    },
    {
      url: "https://example.com/querit-bare",
      title: "Querit bare",
      text: "",
    },
  ],
}

// TinyFish Search reference and anonymous MCP tools/call observed 2026-11-04:
// https://docs.tinyfish.ai/search-api/reference.md
// https://agent.tinyfish.ai/mcp (X-TinyFish-Access-Mode: keyless)
// Synthetic entries add missing fields to exercise the magpie mapping.
export const TINYFISH_CASE = {
  response: {
    query: "TinyFish Search API", total_results: 4, page: 0,
    results: [
      { position: 1, site_name: "docs.tinyfish.ai", title: "Search API", snippet: "Structured search results", url: "https://docs.tinyfish.ai/search-api" },
      { position: 2, title: "No URL", snippet: "dropped" },
      { position: 3, title: "TinyFish news", snippet: "News excerpt", url: "https://example.com/news", date: "Nov 4, 2026" },
      { position: 4, url: "https://example.com/bare", year: 2026, pdf_url: "https://example.com/paper.pdf" },
    ],
  },
  expected: [
    { title: "Search API", url: "https://docs.tinyfish.ai/search-api", text: "Structured search results" },
    { title: "TinyFish news", url: "https://example.com/news", text: "News excerpt", age: "Nov 4, 2026" },
    { title: "https://example.com/bare", url: "https://example.com/bare", text: "" },
  ],
}

export const TINYFISH_MCP_RESPONSE = {
  jsonrpc: "2.0", id: 1,
  result: { content: [{ type: "text", text: JSON.stringify(TINYFISH_CASE.response) }] },
}

// Parallel Search API (GA /v1/search) and MCP web_search observed 2026-11-04:
// https://docs.parallel.ai/api-reference/search/search.md
// https://mcp.parallel.ai/mcp
export const PARALLEL_CASE = {
  response: {
    search_id: "search_123",
    results: [
      {
        url: "https://example.com/parallel",
        title: "Parallel hit",
        publish_date: "2026-11-04",
        excerpts: ["Parallel excerpt 1", "Parallel excerpt 2"],
      },
      {
        url: "https://example.com/no-date",
        title: "No date hit",
        excerpts: ["Solo excerpt"],
      },
      {
        url: "https://example.com/bare",
        title: "",
        excerpts: [],
      },
      {
        title: "No URL",
        excerpts: ["dropped"],
      },
    ],
    session_id: "session_123",
  },
  expected: [
    {
      url: "https://example.com/parallel",
      title: "Parallel hit",
      text: "Parallel excerpt 1\n\nParallel excerpt 2",
      age: "2026-11-04",
    },
    {
      url: "https://example.com/no-date",
      title: "No date hit",
      text: "Solo excerpt",
    },
    {
      url: "https://example.com/bare",
      title: "https://example.com/bare",
      text: "",
    },
  ],
}

export const PARALLEL_MCP_RESPONSE = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    structuredContent: PARALLEL_CASE.response,
  },
}

// SerpApi Google Search API observed 2026-11-04:
// https://serpapi.com/search-api
// https://serpapi.com/organic-results
export const SERPAPI_CASE = {
  response: {
    search_metadata: {
      status: "Success",
    },
    organic_results: [
      {
        position: 1,
        title: "SerpApi hit",
        link: "https://example.com/serpapi",
        snippet: "SerpApi snippet",
        date: "2026-11-04",
      },
      {
        position: 2,
        title: "SerpApi fallback",
        link: "https://example.com/serpapi-fallback",
        snippet: "Solo snippet",
      },
      {
        position: 3,
        title: "",
        link: "https://example.com/bare",
      },
      {
        position: 4,
        title: "No URL",
        snippet: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/serpapi",
      title: "SerpApi hit",
      text: "SerpApi snippet",
      age: "2026-11-04",
    },
    {
      url: "https://example.com/serpapi-fallback",
      title: "SerpApi fallback",
      text: "Solo snippet",
    },
    {
      url: "https://example.com/bare",
      title: "https://example.com/bare",
      text: "",
    },
  ],
}

// Moonshot Basic Web Search API observed 2026-11-05:
// https://platform.kimi.ai/docs/api/tools-search.md
// https://platform.kimi.com/docs/api/tools-search.md
export const MOONSHOT_CASE = {
  response: {
    search_results: [
      {
        url: "https://example.com/moonshot",
        title: "Moonshot hit",
        snippet: "Moonshot snippet",
        text: "Moonshot full text",
        date: "2026-11-05",
      },
      {
        url: "https://example.com/moonshot-fallback",
        title: "Moonshot fallback",
        snippet: "Solo snippet",
      },
      {
        url: "https://example.com/bare",
        title: "",
        snippet: "",
        text: "",
      },
      {
        title: "No URL",
        snippet: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/moonshot",
      title: "Moonshot hit",
      text: "Moonshot snippet",
      age: "2026-11-05",
    },
    {
      url: "https://example.com/moonshot-fallback",
      title: "Moonshot fallback",
      text: "Solo snippet",
    },
    {
      url: "https://example.com/bare",
      title: "https://example.com/bare",
      text: "",
    },
  ],
}

export const MOONSHOT_CN_CASE = {
  response: {
    search_results: [
      {
        url: "https://example.com/moonshot-cn",
        title: "Moonshot CN hit",
        snippet: "Moonshot CN snippet",
        text: "Moonshot CN full text",
        date: "2026-11-05",
      },
      {
        url: "https://example.com/moonshot-cn-fallback",
        title: "Moonshot CN fallback",
        snippet: "Solo CN snippet",
      },
      {
        url: "https://example.com/bare",
        title: "",
        snippet: "",
        text: "",
      },
      {
        title: "No URL",
        snippet: "dropped",
      },
    ],
  },
  expected: [
    {
      url: "https://example.com/moonshot-cn",
      title: "Moonshot CN hit",
      text: "Moonshot CN snippet",
      age: "2026-11-05",
    },
    {
      url: "https://example.com/moonshot-cn-fallback",
      title: "Moonshot CN fallback",
      text: "Solo CN snippet",
    },
    {
      url: "https://example.com/bare",
      title: "https://example.com/bare",
      text: "",
    },
  ],
}
