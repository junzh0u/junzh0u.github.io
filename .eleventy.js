const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// markdown-it-callouts is ESM-only, so the config function is async and pulls
// it in via dynamic import().
module.exports = async function (eleventyConfig) {
  const callouts = (await import("markdown-it-callouts")).default;

  // Tokenize fenced code blocks with PrismJS at build time (no client JS).
  // Colors live in style.css under the `.token.*` rules. Prism has no zsh
  // grammar, so alias it to bash — otherwise ```zsh fences render untokenized.
  eleventyConfig.addPlugin(syntaxHighlight, {
    init: function ({ Prism }) {
      require("prismjs/components/")(["bash"]);
      Prism.languages.zsh = Prism.languages.bash;
    },
  });

  // Render Obsidian-style callouts (`> [!info] …`) as styled boxes. A missing
  // title falls back to the prettified type name, matching Obsidian. Styling
  // lives in style.css under `.callout`.
  eleventyConfig.amendLibrary("md", (md) =>
    md.use(callouts, { emptyTitleFallback: "match-type" })
  );

  // Static files copied straight through to the site root.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy({ "src/apple-touch-icon.png": "apple-touch-icon.png" });
  eleventyConfig.addPassthroughCopy({ "src/og-image.png": "og-image.png" });
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });

  // The OG-card is a screenshot source, not a page — copy it, don't render it.
  eleventyConfig.ignores.add("src/assets/og/card.html");

  // Ignore Obsidian's per-vault config dir inside the writing vault.
  eleventyConfig.ignores.add("**/.obsidian/**");

  // Keep raw HTML in Markdown posts (custom embeds work out of the box).
  eleventyConfig.amendLibrary("md", (md) => md.set({ html: true }));

  // Date helpers for writing posts.
  eleventyConfig.addFilter("postDate", (d) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  // Just the year from an ISO date string (e.g. the woodworking meta line).
  eleventyConfig.addFilter("year", (d) => String(d).slice(0, 4));

  // Cache busting: map a site-absolute asset URL (e.g. /assets/css/style.css)
  // back to its source file and append `?v=<content-hash>`. A changed asset
  // gets a fresh URL the instant it deploys, so GitHub Pages' max-age=600 on
  // the bare path no longer serves stale CSS. Assets are passthrough-copied
  // byte-for-byte, so hashing the src file matches what ships. Don't apply to
  // the font preloads — their URLs must stay identical to the url() refs inside
  // style.css (which aren't busted), or the preloaded font goes unused.
  const bustCache = new Map();
  eleventyConfig.on("eleventy.before", () => bustCache.clear());
  eleventyConfig.addFilter("bust", (url) => {
    const cleanUrl = url.split("?")[0];
    if (bustCache.has(cleanUrl)) return bustCache.get(cleanUrl);
    const srcPath = path.join(__dirname, "src", cleanUrl.replace(/^\//, ""));
    let busted = url;
    try {
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(srcPath))
        .digest("hex")
        .slice(0, 8);
      busted = `${cleanUrl}?v=${hash}`;
    } catch {
      // Missing/unreadable source — leave the URL untouched, never break the build.
    }
    bustCache.set(cleanUrl, busted);
    return busted;
  });

  // Draft posts: `draft: true` keeps a file out of production builds (and the
  // live site) while still rendering in serve/watch for local preview.
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
      return false;
    }
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site",
    },
    // Don't run Markdown post bodies through a template engine, so posts can
    // contain literal {{ }} / {% %} (e.g. in code samples) without escaping.
    markdownTemplateEngine: false,
  };
};
