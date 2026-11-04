// Response fixtures sourced from guotree/opencode-search-plugin test/cases.ts
// at v4.6.1, with expected results in magpie's { title, url, text, age? } shape.
// Cases cover full content, snippet fallback, missing URLs and image filtering.

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
