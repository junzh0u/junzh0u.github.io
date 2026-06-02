module.exports = function (eleventyConfig) {
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
