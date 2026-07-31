const fs = require('fs');
const path = require('path');

const topics = [
  { dir: 'auckland', label: 'Auckland', category: 'City Guide' },
  { dir: 'guide-akl', label: 'Guide AKL', category: 'Auckland Guide' },
  { dir: 'kai-akl', label: 'Kai AKL', category: 'Auckland Food' },
  { dir: 'lord-of-the-rings', label: 'Lord of the Rings', category: 'Middle-earth' },
  { dir: 'platform', label: 'Platform', category: 'Product' },
  { dir: 'volcanic-akl', label: 'Volcanic AKL', category: 'Volcanoes' },
];

function fixTopicLanding(file, topic) {
  let html = fs.readFileSync(file, 'utf8');

  // Add Bricolage Grotesque to Google Fonts link if missing
  html = html.replace(
    /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Fira\+Code:[^"]+&family=Plus\+Jakarta\+Sans:[^"]+&display=swap"/,
    'href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Fira+Code:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"'
  );

  // Extract description from meta tag for the lead paragraph
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const description = descMatch ? descMatch[1] : '';

  // Replace redundant meta label "Label · Label" with "Label · Category"
  html = html.replace(
    new RegExp(`<span class="blog-post__label">${topic.label} · ${topic.label}</span>`),
    `<span class="blog-post__label">${topic.label} · ${topic.category}</span>`
  );

  // Add lead paragraph after <h1>Topic</h1> if not present
  if (description && !html.includes('<p class="lead">')) {
    html = html.replace(
      new RegExp(`(<h1>${topic.label}</h1>)`),
      `$1\n            <p class="lead">${description}</p>`
    );
  }

  // Clean up list indentation: replace over-indented rows with consistent 16-space indent
  html = html.replace(/\n                            <li class="blog-row">/g, '\n                <li class="blog-row">');
  html = html.replace(/\n                                <a href=/g, '\n                    <a href=');
  html = html.replace(/\n                                    <h2 class="blog-row__title">/g, '\n                        <h2 class="blog-row__title">');
  html = html.replace(/\n                                    <p class="blog-row__desc">/g, '\n                        <p class="blog-row__desc">');
  html = html.replace(/\n                                <\/a>/g, '\n                    </a>');
  html = html.replace(/\n                            <\/li>/g, '\n                </li>');

  fs.writeFileSync(file, html);
}

for (const topic of topics) {
  const file = path.join('public', 'blog', topic.dir, 'index.html');
  if (!fs.existsSync(file)) continue;
  fixTopicLanding(file, topic);
  console.log('fixed', file);
}
