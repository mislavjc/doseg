"use client";
import React, { useState } from 'react';
import { DistrictMapSvg } from './district-map-svg';
import { ZagrebBlockMap } from './zagreb-block-map';

const THEMES = [
  {
    id: 'blueprint-overlay-original',
    name: '1. Blueprint Original',
    description: 'The original 2px dashed white lines over colored fills.',
    classes: 'bg-slate-200 dark:bg-slate-900',
    css: `
      .theme-blueprint-overlay-original .district {
        fill: currentColor;
        fill-opacity: 0.2 !important;
        stroke: rgba(255,255,255,0.9);
        stroke-width: 2px;
        stroke-dasharray: 4 4;
        stroke-linecap: round;
      }
      .theme-blueprint-overlay-original .district:hover {
        fill-opacity: 0.4 !important;
        stroke-width: 3px;
        stroke-dasharray: 8 4;
      }
      .theme-blueprint-overlay-original .label { fill: #475569; font-weight: 500; }
      .theme-blueprint-overlay-original .score { fill: #0f172a; }
      @media (prefers-color-scheme: dark) {
        .theme-blueprint-overlay-original .label { fill: #94a3b8; }
        .theme-blueprint-overlay-original .score { fill: #f8fafc; }
      }
    `
  },
  {
    id: 'blueprint-thick',
    name: '2. Wider Blueprint',
    description: 'Thicker 4px dashed lines that make the boundaries more prominent.',
    classes: 'bg-slate-200 dark:bg-slate-900',
    css: `
      .theme-blueprint-thick .district {
        fill: currentColor;
        fill-opacity: 0.15 !important;
        stroke: rgba(255,255,255,1);
        stroke-width: 4px;
        stroke-dasharray: 8 6;
        stroke-linecap: round;
      }
      .theme-blueprint-thick .district:hover {
        fill-opacity: 0.3 !important;
        stroke-width: 5px;
        stroke-dasharray: 12 6;
      }
      .theme-blueprint-thick .label { fill: #475569; font-weight: 600; }
      .theme-blueprint-thick .score { fill: #0f172a; }
      @media (prefers-color-scheme: dark) {
        .theme-blueprint-thick .label { fill: #94a3b8; }
        .theme-blueprint-thick .score { fill: #f8fafc; }
      }
    `
  },
  {
    id: 'blueprint-massive',
    name: '3. Massive Strokes',
    description: 'Extremely thick 8px strokes, blending the borders into a thick net.',
    classes: 'bg-slate-200 dark:bg-slate-900',
    css: `
      .theme-blueprint-massive .district {
        fill: currentColor;
        fill-opacity: 0.1 !important;
        stroke: rgba(255,255,255,0.8);
        stroke-width: 8px;
        stroke-dasharray: 10 10;
        stroke-linejoin: round;
      }
      .theme-blueprint-massive .district:hover {
        fill-opacity: 0.2 !important;
        stroke-width: 10px;
        stroke: rgba(255,255,255,1);
      }
      .theme-blueprint-massive .label { fill: #334155; font-weight: 700; }
      .theme-blueprint-massive .score { fill: #0f172a; }
      @media (prefers-color-scheme: dark) {
        .theme-blueprint-massive .label { fill: #cbd5e1; }
        .theme-blueprint-massive .score { fill: #f8fafc; }
      }
    `
  },
  {
    id: 'blueprint-solid',
    name: '4. Solid Wide Outline',
    description: 'Replaces dashes with a solid 3.5px white line for a cleaner look.',
    classes: 'bg-slate-200 dark:bg-slate-900',
    css: `
      .theme-blueprint-solid .district {
        fill: currentColor;
        fill-opacity: 0.25 !important;
        stroke: rgba(255,255,255,1);
        stroke-width: 3.5px;
        stroke-linejoin: round;
      }
      .theme-blueprint-solid .district:hover {
        fill-opacity: 0.45 !important;
        stroke-width: 5px;
      }
      .theme-blueprint-solid .label { fill: #475569; font-weight: 500; }
      .theme-blueprint-solid .score { fill: #0f172a; }
      @media (prefers-color-scheme: dark) {
        .theme-blueprint-solid .label { fill: #94a3b8; }
        .theme-blueprint-solid .score { fill: #f8fafc; }
      }
    `
  },
  {
    id: 'blueprint-dark',
    name: '5. Dark Blueprint Wide',
    description: 'A deeply saturated dark background with glowing 3px lines.',
    classes: 'bg-slate-950',
    css: `
      .theme-blueprint-dark .district {
        fill: currentColor;
        fill-opacity: 0.1 !important;
        stroke: currentColor;
        stroke-width: 3px;
        stroke-dasharray: 6 6;
        stroke-linecap: round;
        filter: drop-shadow(0 0 6px currentColor);
      }
      .theme-blueprint-dark .district:hover {
        fill-opacity: 0.3 !important;
        stroke-width: 5px;
        stroke-dasharray: 10 6;
      }
      .theme-blueprint-dark .label { fill: #94a3b8; font-weight: 500; }
      .theme-blueprint-dark .score { fill: #f8fafc; }
    `
  }
];

export function DistrictThemesGallery() {
  const [viewMode, setViewMode] = useState<'geo' | 'block'>('geo');
  const [activeThemeId, setActiveThemeId] = useState(THEMES[0].id);
  const activeTheme = THEMES.find(t => t.id === activeThemeId) || THEMES[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center mb-2">
        <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg inline-flex">
          <button
            type="button"
            onClick={() => setViewMode('geo')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'geo'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Geographic Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode('block')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'block'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Grid Block Map
          </button>
        </div>
      </div>

      {viewMode === 'geo' ? (
        <>
          <style>{THEMES.map(t => t.css).join('\n')}</style>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {THEMES.map(theme => (
              <button
                type="button"
                key={theme.id}
                onClick={() => setActiveThemeId(theme.id)}
                className={`p-3 text-left border rounded-lg transition-all ${
                  activeThemeId === theme.id 
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-1 ring-blue-500' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-300'
                }`}
              >
                <div className="font-semibold text-sm">{theme.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {theme.description}
                </div>
              </button>
            ))}
          </div>

          <div className={`w-full overflow-hidden rounded-[16px] ${activeTheme?.classes} theme-${activeTheme?.id}`}>
            <div className="w-full h-full min-h-[400px] md:min-h-[600px] flex items-center justify-center p-4 sm:p-8">
              <DistrictMapSvg className="w-full h-full max-h-[80vh] object-contain drop-shadow-xl" />
            </div>
          </div>
        </>
      ) : (
        <ZagrebBlockMap />
      )}
    </div>
  );
}
