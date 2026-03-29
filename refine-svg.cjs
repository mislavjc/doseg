const fs = require('fs');

let content = fs.readFileSync('components/district-map-svg.tsx', 'utf8');

// Replace fill="#..." with style={{ color: "#..." }} fill="var(--district-fill, currentColor)"
content = content.replace(/fill="(#[0-9a-fA-F]+)"/g, 'style={{ color: "$1" }} fill="var(--district-fill, currentColor)"');

// remove the <style> block and everything inside it
content = content.replace(/<style>[\s\S]*?<\/style>/, '');

fs.writeFileSync('components/district-map-svg.tsx', content);
