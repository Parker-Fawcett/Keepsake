// One-off icon renderer: keepsake-icon.svg -> PNGs for the PWA manifest.
// Run: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const base = readFileSync(new URL('../public/keepsake-icon.svg', import.meta.url))
// Maskable icons must bleed to the edge; the rounded corners become square.
const maskable = base.toString().replace('rx="36"', 'rx="0"')

await sharp(base).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(base).resize(512, 512).png().toFile('public/icon-512.png')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icon-maskable-512.png')
await sharp(base).resize(180, 180).png().toFile('public/apple-touch-icon.png')
console.log('icons written')
