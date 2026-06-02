const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function (eleventyConfig) {
  // Tokenize fenced code blocks with PrismJS at build time (no client JS).
  // Colors live in style.css under the `.token.*` rules.
  eleventyConfig.addPlugin(syntaxHighlight);

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
    // Process bare .html files (e.g. the /chat redirect) through Nunjucks too.
    htmlTemplateEngine: "njk",
    // Don't run Markdown post bodies through a template engine, so posts can
    // contain literal {{ }} / {% %} (e.g. in code samples) without escaping.
    markdownTemplateEngine: false,
  };
};
