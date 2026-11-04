// Response fixtures copied from guotree/opencode-search-plugin test/cases.ts
// at v4.6.1. The old suite asserts `content`; magpie's search hook accepts
// `content` too, but this package returns `text` (the canonical field).
//
// The extra hits (full content, empty snippet, no URL, image) exercise the
// fallbacks and drops that the old provider-specific tests cover.

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
