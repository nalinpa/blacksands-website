const fs = require('fs');
const path = require('path');

const topics = [
  { dir: 'lord-of-the-rings', label: 'Lord of the Rings', meta: 'Middle-earth', color: '#D97706' },
  { dir: 'volcanic-akl', label: 'Volcanic AKL', meta: 'Volcanoes', color: '#3D7A5F' },
  { dir: 'kai-akl', label: 'Kai AKL', meta: 'Food', color: '#1A6FA8' },
  { dir: 'guide-akl', label: 'Guide AKL', meta: 'Auckland Guide', color: '#0E7490' },
  { dir: 'auckland', label: 'Auckland', meta: 'Auckland', color: '#0E7490' },
  { dir: 'platform', label: 'Platform', meta: 'Product', color: '#0E7490' },
];

function toNewLanding(oldHtml, topic) {
  // Preserve head metadata
  const headMatch = oldHtml.match(/<head>([\s\S]*?)<\/head>/i);
  let head = headMatch ? headMatch[1] : '';

  // Extract list items
  const listMatch = oldHtml.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  let listHtml = listMatch ? listMatch[1] : '';

  // Transform inline styled list items to new structure with blog-row classes
  listHtml = listHtml.replace(/<li[^>]*>\s*<a href="([^"]+)"[^>]*>\s*<h2[^>]*>(.*?)<\/h2>\s*<p[^>]*>(.*?)<\/p>\s*<\/a>\s*<\/li>/gi, (match, href, title, desc) => {
    return `                <li class="blog-row">
                    <a href="${href}" class="blog-row__link">
                        <h2 class="blog-row__title">${title}</h2>
                        <p class="blog-row__desc">${desc}</p>
                    </a>
                </li>`;
  });

  return `<!DOCTYPE html>
<html lang="en-NZ">
<head>${head}
</head>
<body class="blog-post" data-topic="${topic.dir}">

    <div x-data="{ navHtml: '' }" x-init="fetch('/components/navbar.html').then(r => r.text()).then(html => navHtml = html).catch(() => {})" x-html="navHtml"></div>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"></script>

    <main class="blog-post__container">
        <nav class="blog-breadcrumb">
            <a href="/blog/">Blog</a> / <a href="/blog/${topic.dir}/">${topic.label}</a>
        </nav>

        <article class="blog-post__content">
            <span class="blog-post__meta">
                <span class="blog-post__label">${topic.label} · ${topic.meta}</span>
            </span>
            <h1>${topic.label}</h1>

            <ul class="blog-list">
${listHtml}
            </ul>
        </article>
    </main>

    <div x-data="{ footerHtml: '' }" x-init="fetch('/components/footer.html').then(r => r.text()).then(html => footerHtml = html).catch(() => {})" x-html="footerHtml"></div>
</body>
</html>`;
}

for (const topic of topics) {
  const file = path.join('public', 'blog', topic.dir, 'index.html');
  if (!fs.existsSync(file)) { console.log('skip', file); continue; }
  const oldHtml = fs.readFileSync(file, 'utf8');
  const newHtml = toNewLanding(oldHtml, topic);
  fs.writeFileSync(file, newHtml);
  console.log('updated', file);
}
