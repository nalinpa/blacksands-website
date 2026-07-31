const fs = require('fs');
const path = require('path');

const topicMap = {
  auckland: { label: 'Auckland', color: '#0E7490' },
  'guide-akl': { label: 'Guide AKL', color: '#0E7490' },
  'kai-akl': { label: 'Kai AKL', color: '#1A6FA8' },
  'lord-of-the-rings': { label: 'Lord of the Rings', color: '#D97706' },
  platform: { label: 'Platform', color: '#0E7490' },
  'volcanic-akl': { label: 'Volcanic AKL', color: '#3D7A5F' },
};

const posts = [];

for (const topic of Object.keys(topicMap)) {
  const topicDir = path.join('public', 'blog', topic);
  for (const slug of fs.readdirSync(topicDir)) {
    const postDir = path.join(topicDir, slug);
    if (!fs.statSync(postDir).isDirectory()) continue;
    const file = path.join(postDir, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    const tm = topicMap[topic];
    posts.push({
      topic,
      label: tm.label,
      color: tm.color,
      title: titleMatch[1].replace(' | Black Sands', ''),
      desc: descMatch ? descMatch[1] : '',
      url: canonicalMatch ? canonicalMatch[1].replace('https://blacksands.app', '') : `/blog/${topic}/${slug}/`,
    });
  }
}

fs.writeFileSync('blog-posts-data.json', JSON.stringify(posts, null, 2));
console.log(`Extracted ${posts.length} posts`);
