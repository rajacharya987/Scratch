# Golden Hour 3D Driving — editable source

## The files to use

| What you want to change | File to edit |
| --- | --- |
| Game rules, cars, camera, scenery, colours, HUD, and Scratch blocks | [`scripts/build-game-sb3.mjs`](scripts/build-game-sb3.mjs) |
| The generated Scratch project definition | `golden_hour_3d_driving.json` — generated; do not treat as the source of truth |
| The playable Scratch project | `golden_hour_3d_driving.sb3` — generated; load this into the 3D Scratch editor |
| Check that the generated project is valid | `scratch-test-deserialize.js` |
| 3D camera implementation | `packages/scratch-render/src/unified/StageScene.js` |
| Custom 3D blocks, including the car camera block | `packages/scratch-vm/src/extensions/scratch3_threed/index.js` |

`scripts/build-game-sb3.mjs` is the **main editable source**. It creates every target, variable, Scratch block, 3D mesh, material, and monitor. The JSON and SB3 are rebuilt from it, so edits to those generated files will be overwritten the next time you build.

## Rebuild after editing

Open PowerShell in this folder and run:

```powershell
node scripts\build-game-sb3.mjs
node scratch-test-deserialize.js
```

This rewrites these two files:

```text
golden_hour_3d_driving.json
golden_hour_3d_driving.sb3
```

Then choose **File → Load from your computer** in the local 3D Scratch editor and select `golden_hour_3d_driving.sb3`.

## Source layout

The generator is deliberately split into small functions. Each returns the native Scratch block JSON for one type of game object.

| Function / section | Changes this part of the game |
| --- | --- |
| `variables` | Speed, RPM, nitro, distance, camera, and golden-hour time values |
| `stageBlocks()` | Sky, sun, clouds, fog, lighting, ground, and time cycle |
| `playerBlocks()` | Vehicle mesh, acceleration, brakes, steering, boost, road limits, reset, and camera keys |
| `roadBlocks(initialZ)` | The five infinitely recycled road pieces |
| `propBlocks(config)` | Centre markers, guard rails, trees, and rocks |
| `dustBlocks(index)` | Dust particles behind the car |
| `createProject()` | Number and starting positions of all targets, 3D materials, and visible monitors |
| `hudSvg` | The 2D controls banner at the bottom of the stage |

## Common edits

### Make the car faster

In `playerBlocks()`, change these values:

```js
v.change('speed', num(0.32)) // normal acceleration
v.change('speed', num(0.74)) // nitro acceleration
ifThen(gt(v.value('speed'), num(28)), [v.set('speed', num(28))]) // maximum speed
```

For example, changing `28` to `40` raises the maximum speed. You may also want to make the `0.32` acceleration higher.

### Change the car colour

In the `reset` array inside `playerBlocks()`:

```js
three(b, 'setMaterialColor', {COLOR: text('#D63B3B')})
```

Use any hex colour, such as `#1769E8` for blue.

### Change camera views

The `follow(...)` calls in `playerBlocks()` define the six views selected with `C`:

```js
follow(0, 56, 155, 60, 52) // chase
follow(0, 96, 300, 90, 62) // wide
follow(0, 32, 84, 70, 46)  // close
follow(0, 24, -28, 150, 64) // hood
follow(0, 18, -4, 125, 74) // cockpit
follow(-150, 94, 178, 45, 58) // cinematic
```

The first three numbers are the local camera offset: left/right, height, and front/back. `lookAhead` controls how far forward the camera aims; the last number is field of view.

### Add or remove scenery

In `createProject()`:

- Change `for (let i = 0; i < 20; i++)` to alter the number of trees.
- Change `for (let i = 0; i < 8; i++)` to alter the number of rocks.
- Change `for (let i = 0; i < 6; i++)` to alter the number of dust particles.
- Edit the `color`, `scale`, `initialX`, `initialY`, `initialZ`, and recycle values passed to `propBlocks(...)`.

## Controls built into the game

| Key | Action |
| --- | --- |
| `W` or Up arrow | Drive / accelerate |
| `S` or Down arrow | Brake |
| `A` / Left arrow | Steer left |
| `D` / Right arrow | Steer right |
| Space or Shift | Nitrous boost |
| `C` | Cycle the six cameras |
| `R` | Reset the car and telemetry |

## Important

This is a project for the custom **3D-enabled Scratch editor in this repository**. Standard Scratch on scratch.mit.edu does not include the `3D` extension, so it cannot run this project there without these editor changes.

