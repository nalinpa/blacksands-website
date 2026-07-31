const fs = require('fs');
const path = require('path');

const topicMap = {
  auckland: { label: 'Auckland', color: '#0E7490', app: 'Guide AKL', appUrl: '/guide-akl', meta: 'Auckland' },
  'guide-akl': { label: 'Guide AKL', color: '#0E7490', app: 'Guide AKL', appUrl: '/guide-akl', meta: 'Auckland Guide' },
  'kai-akl': { label: 'Kai AKL', color: '#1A6FA8', app: 'Kai AKL', appUrl: '/kai-akl', meta: 'Auckland Food' },
  'lord-of-the-rings': { label: 'Lord of the Rings', color: '#D97706', app: 'Rings', appUrl: '/lord-of-the-rings', meta: 'Middle-earth' },
  platform: { label: 'Platform', color: '#0E7490', app: 'Black Sands', appUrl: '/work-with-us', meta: 'Product' },
  'volcanic-akl': { label: 'Volcanic AKL', color: '#3D7A5F', app: 'Volcanic AKL', appUrl: '/volcanic-akl', meta: 'Volcanoes' },
};

function extractHead(html) {
  const m = html.match(/<head>([\s\S]*?)<\/head>/i);
  return m ? m[1] : '';
}

function extractBodyContent(html) {
  // Extract article content between <article class="bs-content" ...> and </article>
  const m = html.match(/<article class="bs-content"[^>]*>([\s\S]*?)<\/article>/i);
  if (!m) return '';
  let content = m[1];

  // Transform old inline-styled sections into clean sections preserving text
  // Already uses <section>, <h2>, <p>. We need to strip inline styles and add class lead to first p.

  // Strip inline styles from sections and headings and paragraphs and divs
  content = content.replace(/ style="[^"]*"/g, '');

  // Convert first <p> to lead class (the first paragraph after h1 or article start)
  content = content.replace(/<p>([\s\S]*?)<\/p>/, '<p class="lead">$1</p>');

  // Convert old callout div to blog-callout
  content = content.replace(/<div class="">\s*<span class="coord-label">([^<]+)<\/span>\s*<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a href="([^"]+)" class="btn btn-primary[^"]*">([^<]+)<\/a>\s*<\/div>/g, (match, label, h3, blurb, href, cta) => {
    return `<div class="blog-callout">\n                <span class="blog-callout__label">${label}</span>\n                <h3>${h3}</h3>\n                <p>${blurb.trim()}</p>\n                <a href="${href}" class="blog-callout__cta">${cta}</a>\n            </div>`;
  });

  // Convert related line
  content = content.replace(/<p>(More [^:]+:|Related:)\s*(.*?)<\/p>$/g, (match, prefix, rest) => {
    return `<p class="blog-related">${prefix} ${rest}</p>`;
  });

  return content;
}

function extractMetaLabel(html) {
  const m = html.match(/<span class="coord-label"[^>]*>([^<]+)<\/span>/);
  return m ? m[1].trim() : '';
}

function extractDatePublished(html) {
  const m = html.match(/"datePublished":\s*"([^"]+)"/);
  return m ? m[1] : '2026-06-18';
}

function extractRelated(html) {
  const m = html.match(/<p[^>]*>(More [^:]+:|Related:)\s*(.*?)<\/p>/);
  return m ? `<p class="blog-related">${m[1]} ${m[2]}</p>` : '';
}

function convertPost(file) {
  const html = fs.readFileSync(file, 'utf8');
  const head = extractHead(html);
  const topicDir = path.basename(path.dirname(path.dirname(file)));
  const tm = topicMap[topicDir];
  const bodyClass = topicDir === 'platform' ? 'guide-akl' : topicDir;
  const date = extractDatePublished(html);
  const formattedDate = new Date(date).toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' });

  // Extract article inner content
  const articleMatch = html.match(/<article class="bs-content"[^>]*>([\s\S]*?)<\/article>/i);
  let articleContent = articleMatch ? articleMatch[1] : '';

  // Remove all inline styles
  articleContent = articleContent.replace(/ style="[^"]*"/g, '');

  // Remove the old topic label span that sits before h1
  articleContent = articleContent.replace(/\s*<span class="coord-label">[^<]*<\/span>\s*/g, '');

  // First paragraph -> lead
  articleContent = articleContent.replace(/<p>([\s\S]*?)<\/p>/, '<p class="lead">$1</p>');

  // Transform the callout box
  articleContent = articleContent.replace(/<div>\s*<span class="coord-label">([^<]+)<\/span>\s*<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a href="([^"]+)" class="btn btn-primary[^"]*">([^<]+)<\/a>\s*<\/div>/g, (match, label, h3, blurb, href, cta) => {
    return `<div class="blog-callout">\n                <span class="blog-callout__label">${label}</span>\n                <h3>${h3}</h3>\n                <p>${blurb.trim()}</p>\n                <a href="${href}" class="blog-callout__cta">${cta}</a>\n            </div>`;
  });

  // Transform callout box variant without the coord-label (old inline structure)
  articleContent = articleContent.replace(/<div>\s*<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<a href="([^"]+)" class="btn btn-primary[^"]*">([^<]+)<\/a>\s*<\/div>/g, (match, h3, blurb, href, cta) => {
    return `<div class="blog-callout">\n                <span class="blog-callout__label">${tm.app}</span>\n                <h3>${h3}</h3>\n                <p>${blurb.trim()}</p>\n                <a href="${href}" class="blog-callout__cta">${cta}</a>\n            </div>`;
  });

  // Transform related line (preserve links)
  articleContent = articleContent.replace(/<p>(More [^:]+:|Related:)\s*(.*?)<\/p>\s*$/g, (match, prefix, rest) => {
    return `<p class="blog-related">${prefix} ${rest}</p>`;
  });

  return `<!DOCTYPE html>
<html lang="en-NZ">
<head>${head}
</head>
<body class="blog-post" data-topic="${topicDir}">

    <div x-data="{ navHtml: '' }" x-init="fetch('/components/navbar.html').then(r => r.text()).then(html => navHtml = html).catch(() => {})" x-html="navHtml"></div>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"></script>

    <main class="blog-post__container">
        <nav class="blog-breadcrumb">
            <a href="/blog/">Blog</a> / <a href="/blog/${topicDir}/">${tm.label}</a>
        </nav>

        <article class="blog-post__content">
            <span class="blog-post__meta">
                <span class="blog-post__label">${tm.label} · ${tm.meta}</span>
                <span class="blog-post__dot">·</span>
                <span class="blog-post__date">${formattedDate}</span>
            </span>
${articleContent}
        </article>
    </main>

    <div x-data="{ footerHtml: '' }" x-init="fetch('/components/footer.html').then(r => r.text()).then(html => footerHtml = html).catch(() => {})" x-html="footerHtml"></div>
</body>
</html>`;
}

let count = 0;
for (const topic of Object.keys(topicMap)) {
  const topicDir = path.join('public', 'blog', topic);
  for (const slug of fs.readdirSync(topicDir)) {
    const postDir = path.join(topicDir, slug);
    if (!fs.statSync(postDir).isDirectory()) continue;
    const file = path.join(postDir, 'index.html');
    if (!fs.existsSync(file)) continue;
    const newHtml = convertPost(file);
    fs.writeFileSync(file, newHtml);
    count++;
  }
}
console.log(`Converted ${count} posts`);
