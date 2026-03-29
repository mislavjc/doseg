const fs = require('fs');

let content = fs.readFileSync('components/district-map-svg.tsx', 'utf8');

// Replace tabIndex="0" with tabIndex={0}
content = content.replace(/tabIndex="0"/g, 'tabIndex={0}');

fs.writeFileSync('components/district-map-svg.tsx', content);
