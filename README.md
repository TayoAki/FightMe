# FightMe

An original arena fighting game for playing with friends. You fight in 3D on a round rooftop, as in
Dragon Ball Sparking Zero or Naruto Storm, but with mechanics taken from 2D and tag fighters. Every
fighter picks a **style**, so players used to different games can face each other.

It runs in the browser (TypeScript + three.js). The characters are placeholder mannequins for now. The
plan is to let players upload their own rigged 3D models (Tripo3D, VRM and other GLB files) and give each
one a style.

## Styles

| Style | Inspired by | What it plays like |
|---|---|---|
| **Street** | Street Fighter 6 | Drive gauge (Parry, Perfect Parry, Drive Rush, Drive Impact, Drive Reversal, Burnout), fireballs and uppercuts, special and super cancels, three supers including a beam |
| **Tag** | Marvel Tokon, 2XKO | A team of two (Volt the rushdown striker, Nova the zoner) sharing one health bar. Call the partner in for assists (3 s cooldown), tag in mid-combo (5 s cooldown), and use a team super |

Only the mechanics are borrowed. All names, characters, numbers and art are our own.

Every style shares the arena rules:
- **Lock-on.** You always face your opponent.
- **Dashes.** A homing dash chases the opponent. A side dash circles them and dodges straight attacks,
  fireballs and beams.
- **Guard button.** Guard covers your front and sides, but not your back, and throws beat it.
- **Walls.** The arena's fence is a wall that wall-splat moves pin you against.
- **Beam clashes.** When two beams meet, both players mash, and the winner blasts the loser.

A Tag team shares 9,000 health against a solo fighter's 10,000, to balance its two characters and
assists. The full move lists are on the How to Play screen and in `src/ui/movelist.ts`.

## Controls

Six buttons for every style: **Light, Heavy, Special, Jump, Guard, Dash**. Specials and heavies change
with the stick: toward the opponent, away from them, or sideways.

| | Move | Light · Heavy · Special | Jump · Guard · Dash | Pause |
|---|---|---|---|---|
| P1 keyboard | W A S D | U · I · O | J · K · L | Esc |
| P2 keyboard | Arrow keys | Numpad 7 · 8 · 9 (or Ins · Home · PgUp) | Numpad 4 · 5 · 6 (or Del · End · PgDn) | Backspace |
| Gamepad (Xbox names) | D-pad or left stick | X · Y · B | A · RB · LB | Start |

On a gamepad, RT is Light + Heavy (Drive Parry, or the Tag assist) and LT is Heavy + Special (Drive
Impact, or tag). The first gamepad plays P1 and the second plays P2; the title screen can swap them.
Left and right on the stick follow the screen, and up and down move into and out of it. The shared
camera swings round as the fighters circle each other.

**Training mode:**
- **Tab** cycles the dummy: stand, guard all, guard after the first hit, side dash, jump, or CPU.
- **M** toggles infinite meters, **H** shows hitboxes and hurtboxes, and **R** resets positions.
- The panel shows the last move, the exact frame advantage, combo damage and your best combo.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` makes a static site in `dist/` that any static host can serve. Add `?low` to the URL
for low graphics (no bloom or shadows) on slow machines.

## Develop

```bash
npm test           # simulation tests, plus random-input and CPU-vs-CPU soak matches
npm run typecheck
npm run build && node scripts/smoke.mjs shots   # headless screenshots (set CHROMIUM=/path/to/chrome)
```

- `src/sim/` is the game itself. It is deterministic, integer-only (directions are fixed-point vectors,
  see `vec.ts`) and runs at 60 frames per second. `step(state, inputs)` advances one frame, so a state
  can be cloned and replayed, which is the groundwork for rollback netcode. The simulation also keeps
  the shared camera's axis (`m.ax`, `m.az`), so the stick and the screen always agree.
- `src/sim/styles/street.ts` and `src/sim/styles/tag.ts` hold every move's frame data: startup, active,
  recovery, on-hit, on-block and hitboxes. Balance changes go there.
- `src/render/` draws a match:
  - `rig.ts` is the standard humanoid rig and IK pose solver.
  - `poses.ts` is the pose library.
  - `animator.ts` builds animations from each move's frame data.
  - `renderer.ts` places the fighters, runs the shared camera and draws the effects.

  Open the game with `?poses` to see every pose on a grid.
- `src/game/` holds the game loop, the CPU opponent and the training dummy. `src/ui/` holds the HUD and
  the menus.

The first version was a 2D side-view game with an Iron style (inspired by Tekken). It is in the git
history if you want to bring Iron back into the arena.

## Roadmap

1. **Now:** the arena, the Street and Tag styles, local versus, VS CPU and training mode.
2. **More styles:**
   - Gear (Guilty Gear: Roman Cancels, Burst, air dashes, wall breaks into new areas)
   - Wolf (Fatal Fury: REV meter, Just Defense, S.P.G.)
   - Iron (Tekken), ported from the 2D version
3. **Character creator:** upload a GLB or VRM model, auto-rig it if it has no skeleton, map its bones
   onto the standard rig, then pick a style. Models stay on the player's device.
4. **Online:** rollback netcode for playing over the internet, real art and sound, and clip export.
