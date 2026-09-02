# 3D Snake — Top Down

A fast top-down 3D Snake arena for the Scratch editor.

## Open it

1. Run the editor (`npm start` → http://localhost:8601/)
2. **File → Load from your computer**
3. Choose `examples/3d-snake/3d-snake.sb3`
4. Green flag

## Play

- **WASD** or **arrow keys** to turn
- **Space** to pause
- **Right-drag** the stage to tilt the camera
- **Scroll** to zoom, **Shift+right-drag** to pan
- Eat the gold orb
- Stay inside the walls
- Don’t bite your tail

Score is on the stage. The snake speeds up as you grow.

## Rebuild the `.sb3`

```
node examples/3d-snake/transpile.js
node examples/3d-snake/build-sb3.js
```
