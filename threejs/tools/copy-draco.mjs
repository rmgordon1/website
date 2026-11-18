/**
 * Copies three's own Draco decoder into static/draco/, so the decoder always
 * matches the installed three version. Runs before `npm run dev` and
 * `npm run build`; static/draco/ is git-ignored for that reason.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = new URL('../node_modules/three/examples/jsm/libs/draco/gltf/', import.meta.url)
const to = new URL('../static/draco/', import.meta.url)
const FILES = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']

mkdirSync(to, { recursive: true })
for (const file of FILES) copyFileSync(new URL(file, from), new URL(file, to))
console.log(`draco decoder copied to ${fileURLToPath(to)}`)
