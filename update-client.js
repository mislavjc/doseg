const fs = require('fs');
let content = fs.readFileSync('components/district-map-themes.tsx', 'utf8');
if (!content.includes('"use client"')) {
  fs.writeFileSync('components/district-map-themes.tsx', '"use client";\n' + content);
}
