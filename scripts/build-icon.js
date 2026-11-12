'use strict';
// Builds images/extension-icon.png (128x128, the size the manifest reference gives for icons.default)
// from the official primary logo, unmodified. Source of the logo: windmill-labs/windmilldocs
// static/img/brand/logos/windmill-logo-primary.svg, the "Primary" variant in the brand guidelines
// (brand_guidelines/visual_identity/2_logo): "Use on light backgrounds", "Clear space = 0.25x logo height
// on all sides". So: white square, logo scaled proportionally and centred with 0.25x height of clear space.
// Usage: node scripts/build-icon.js   (needs the dev dependency @resvg/resvg-js)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SIZE = 128;
const root = path.join(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'images', 'windmill-logo-primary.svg'), 'utf8');
const [, lw, lh] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logo).map(Number);
const h = SIZE / 1.5; // logo height + 2 x 0.25 x logo height = canvas
const w = (h * lw) / lh;
const inner = logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="#FFFFFF"/>
<svg x="${(SIZE - w) / 2}" y="${(SIZE - h) / 2}" width="${w}" height="${h}" viewBox="0 0 ${lw} ${lh}" fill="none">${inner}</svg>
</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
fs.writeFileSync(path.join(root, 'images', 'extension-icon.png'), png);
console.log(`images/extension-icon.png ${SIZE}x${SIZE}, logo ${w.toFixed(1)}x${h.toFixed(1)}`);
