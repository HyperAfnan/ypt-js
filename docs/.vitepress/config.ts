import { defineConfig } from "vitepress";

function normalizeBase(value: string): string {
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.DOCS_BASE ?? "/");

export default defineConfig({
  title: "ypt-js",
  description: "Unofficial TypeScript client for the Yeolpumta (YPT) study app",

  base,
  lang: "en-US",
  cleanUrls: false,
  lastUpdated: true,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }],
    ["meta", { name: "theme-color", content: "#3fb950" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "ypt-js documentation" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Unofficial TypeScript client for the Yeolpumta (YPT) study app",
      },
    ],
  ],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "ypt-js",

    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "API", link: "/api-reference" },
      { text: "Upstream", link: "/upstream-api" },
      { text: "Contributing", link: "/contributing" },
      {
        text: "GitHub",
        link: "https://github.com/HyperAfnan/ypt-js",
      },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Documentation map", link: "/overview" },
          { text: "Getting started", link: "/getting-started" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Authentication", link: "/authentication" },
          { text: "Groups & telemetry", link: "/groups" },
          { text: "Error handling", link: "/error-handling" },
          { text: "Cookbook", link: "/cookbook" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API reference", link: "/api-reference" },
          { text: "Upstream API", link: "/upstream-api" },
          { text: "Architecture", link: "/architecture" },
        ],
      },
      {
        text: "Project",
        items: [{ text: "Contributing", link: "/contributing" }],
      },
    ],

    search: {
      provider: "local",
      options: {
        detailedView: true,
      },
    },

    socialLinks: [{ icon: "github", link: "https://github.com/HyperAfnan/ypt-js" }],

    editLink: {
      pattern: "https://github.com/HyperAfnan/ypt-js/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    outline: {
      level: [2, 3],
      label: "On this page",
    },

    docFooter: {
      prev: "Previous",
      next: "Next",
    },

    lastUpdated: {
      text: "Last updated",
      formatOptions: { dateStyle: "medium", timeStyle: "short" },
    },

    footer: {
      message: "Unofficial client. Not affiliated with YPT / TGCLab.",
      copyright: "Released under the MIT License",
    },
  },
});
