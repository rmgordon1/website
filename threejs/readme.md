# Tide Runner

A small three.js game. You spawn on a pier with a large sea creature waiting
alongside; walk down to her, press <kbd>E</kbd> to climb on, and ride her out
onto the water.

Inspired by [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater),
though that project runs on its own WebGPU/WGSL engine — this one is plain
three.js and WebGL, so none of the code is shared.

## Setup

```bash
npm install     # only the first time
npm run dev     # local dev server
npm run build   # production build in dist/
npm test        # headless checks for the maths and controllers
```

## Controls

| Key | Ashore | At the helm |
| --- | --- | --- |
| <kbd>W</kbd> <kbd>S</kbd> | Walk forward / back | Throttle ahead / astern |
| <kbd>A</kbd> <kbd>D</kbd> | Strafe | Steer |
| Mouse | Look | Swing the camera |
| <kbd>Shift</kbd> | Sprint | More throttle |
| <kbd>Space</kbd> | Jump | — |
| <kbd>E</kbd> | Climb on | Step back onto the pier |
| <kbd>V</kbd> | — | Toggle the helm view |
| <kbd>H</kbd> | Hide the controls panel | |
| <kbd>Esc</kbd> | Release the mouse | |

Boarding only works from the gap in the pier railing where she lies
alongside. Coming back in, you need to be near the pier and almost stopped.

## How it is put together

| Path | Contents |
| --- | --- |
| `src/game/` | `Game` (scene, loop, state machine), keyboard/mouse input, HUD |
| `src/world/` | Wave maths, ocean shader, island terrain, the pier, sky and lighting |
| `src/entities/` | The vessel: authored dimensions, model loading, handling, wake, placeholder hull |
| `src/player/` | First-person walking controller with dock collision |
| `test/` | Headless smoke checks, run with `npm test` |

The ocean is a sum of four directional sine waves. `src/world/waves.js` is the
single source of truth: it exports both the GLSL used to displace the water
mesh and the JavaScript used to float the boat, so the hull always sits on the
surface you can see. The island is an analytic radial profile with noise masked
off near the shore, which keeps the beach and the pier footing predictable.

The vessel is `static/boat2.glb` (Draco compressed, 60.8k triangles). It is
fitted into an authored envelope on load rather than used at its native scale,
so swapping the model cannot quietly change how she handles or whether she fits
her berth — see `src/entities/dimensions.js` and `boatModel.js`. A procedural
hull stands in while it loads, and remains as the fallback if it fails.

Everything else is generated in code — no other model or texture assets.

## Inspecting models

`tools/inspect-glb.cjs` decodes a Draco-compressed GLB in Node and renders
orthographic PNG previews, which is useful for checking an export without a
browser:

```bash
node tools/inspect-glb.cjs static/boat2.glb 0 /tmp/preview
```
