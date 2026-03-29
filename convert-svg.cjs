const fs = require('fs');

const svg = fs.readFileSync('public/district-map.svg', 'utf8');

// Replace class="district" with className="district"
let reactSvg = svg
  .replace(/class=/g, 'className=')
  .replace(/tabindex=/g, 'tabIndex=')
  .replace(/font-size/g, 'fontSize')
  .replace(/font-weight/g, 'fontWeight')
  .replace(/text-anchor/g, 'textAnchor')
  .replace(/pointer-events/g, 'pointerEvents')
  .replace(/user-select/g, 'userSelect')
  .replace(/fill-opacity/g, 'fillOpacity')
  .replace(/stroke-width/g, 'strokeWidth')
  .replace(/vector-effect/g, 'vectorEffect');

// We also need to extract the inner content of <svg>
let innerSvg = reactSvg.match(/<title id="title">[\s\S]*<\/svg>/)[0];
// remove the closing </svg>
innerSvg = innerSvg.replace(/<\/svg>/, '');

const component = `
import React from 'react';

export function DistrictMapSvg({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 960 620" 
      width="100%" 
      height="100%" 
      preserveAspectRatio="xMidYMid meet" 
      role="img" 
      aria-labelledby="title desc"
    >
      ${innerSvg}
    </svg>
  );
}
`;

fs.writeFileSync('components/district-map-svg.tsx', component);
