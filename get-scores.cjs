const fs = require('fs');
const content = fs.readFileSync('public/district-map.svg', 'utf8');

const regex = /<title>([^<]+?)\n([0-9]+)\/100/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`${match[1].trim()}: ${match[2]}`);
}
