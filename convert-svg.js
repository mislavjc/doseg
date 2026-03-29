const fs = require('fs');

const svg = fs.readFileSync('public/district-map.svg', 'utf8');

// Replace class="district" with className="district"
let reactSvg = svg
  .replace(/class=/g, 'className=')
  .replace(/tabindex=/g, 'tabIndex=')
  .replace(/viewBox/g, 'viewBox')
  .replace(/preserveAspectRatio/g, 'preserveAspectRatio');

// Convert inline styles or other attributes if needed
// Actually, let's just make a simple component
const component = `
import React from 'react';

export function DistrictMapSvg({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 620" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="title desc">
        ${reactSvg.match(/<title id="title">[\s\S]*<\/g>/)[0]}
      </svg>
    </div>
  );
}
`;

fs.writeFileSync('components/district-map-svg.tsx', component);
