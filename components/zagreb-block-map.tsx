"use client"
import React from 'react'

export const ZAGREB_DISTRICTS_GRID = [
  { id: 'podsljeme', name: 'Podsljeme', short: 'POD', col: 2, row: 0, score: 13 },
  { id: 'podsused-vrapce', name: 'Podsused - Vrapče', short: 'POV', col: 0, row: 1, score: 31 },
  { id: 'crnomerec', name: 'Črnomerec', short: 'ČRN', col: 1, row: 1, score: 31 },
  { id: 'gornji-grad', name: 'Gornji grad - Medveščak', short: 'GGM', col: 2, row: 1, score: 52 },
  { id: 'maksimir', name: 'Maksimir', short: 'MAK', col: 3, row: 1, score: 40 },
  { id: 'gornja-dubrava', name: 'Gornja Dubrava', short: 'GDU', col: 4, row: 1, score: 20 },
  { id: 'sesvete', name: 'Sesvete', short: 'SES', col: 5, row: 1, score: 17 },
  { id: 'stenjevec', name: 'Stenjevec', short: 'STE', col: 0, row: 2, score: 41 },
  { id: 'tresnjevka-sjever', name: 'Trešnjevka - sjever', short: 'TSJ', col: 1, row: 2, score: 62 },
  { id: 'donji-grad', name: 'Donji grad', short: 'DGR', col: 2, row: 2, score: 100 },
  { id: 'pescenica', name: 'Peščenica - Žitnjak', short: 'PŠČ', col: 3, row: 2, score: 33 },
  { id: 'donja-dubrava', name: 'Donja Dubrava', short: 'DDU', col: 4, row: 2, score: 42 },
  { id: 'tresnjevka-jug', name: 'Trešnjevka - jug', short: 'TJU', col: 1, row: 3, score: 52 },
  { id: 'trnje', name: 'Trnje', short: 'TRN', col: 2, row: 3, score: 83 },
  { id: 'novi-zagreb-zapad', name: 'Novi Zagreb - zapad', short: 'NZZ', col: 1, row: 4, score: 36 },
  { id: 'novi-zagreb-istok', name: 'Novi Zagreb - istok', short: 'NZI', col: 2, row: 4, score: 56 },
  { id: 'brezovica', name: 'Brezovica', short: 'BRZ', col: 1, row: 5, score: 17 },
];

function getScoreColor(score: number) {
  // A color scale from light to dark teal/green, matching the US map image
  if (score >= 80) return '#398f71'; // Darkest
  if (score >= 60) return '#4ea586';
  if (score >= 40) return '#66bba1';
  if (score >= 30) return '#81d2bb';
  if (score >= 20) return '#a1e7d5';
  return '#c4f8ea'; // Lightest
}

function getTextColor(_score: number) {
  // Use dark text for all blocks to match the US map style
  return '#0f172a';
}

export function ZagrebBlockMap() {
  const numCols = 6;
  const numRows = 6;

  return (
    <div className="w-full flex justify-center py-12 bg-[#fbfbf9] rounded-xl overflow-hidden">
      <div 
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))`,
          width: '100%',
          maxWidth: '600px',
          aspectRatio: '1 / 1'
        }}
      >
        {Array.from({ length: numRows * numCols }).map((_, i) => {
          const col = i % numCols;
          const row = Math.floor(i / numCols);
          const district = ZAGREB_DISTRICTS_GRID.find(d => d.col === col && d.row === row);

          if (!district) {
            return <div key={`empty-${col}-${row}`} className="w-full h-full" />;
          }

          const bgColor = getScoreColor(district.score);
          const textColor = getTextColor(district.score);

          return (
            <div 
              key={district.id} 
              className="w-full h-full flex flex-col items-center justify-center p-2 relative group transition-transform hover:z-10 cursor-pointer"
              style={{ backgroundColor: bgColor, color: textColor }}
              title={`${district.name} - Score: ${district.score}`}
            >
              <span className="font-medium text-base sm:text-xl tracking-wide">{district.short}</span>
              
              {/* Tooltip on hover */}
              <div className="absolute opacity-0 group-hover:opacity-100 pointer-events-none -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded whitespace-nowrap z-20 transition-opacity">
                {district.name}: {district.score}/100
                {/* little triangle pointer */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
