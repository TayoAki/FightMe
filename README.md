# FightMe

An original 2D fighting game for playing with friends. Every fighter picks a **style**: the controls and
mechanics they play with. Someone used to Street Fighter and someone used to Tekken can fight each other,
each with the controls they know.

It runs in the browser (TypeScript + three.js). The characters are placeholder mannequins for now; the
plan is to let players upload their own rigged 3D models (Tripo3D, VRM and other GLB files) and give
each one a style.

## Styles

| Style | Inspired by | Controls | Mechanics |
|---|---|---|---|
| **Street** | Street Fighter 6 | 6 buttons: LP MP HP / LK MK HK, motion specials | Drive gauge (Parry, Perfect Parry, Drive Rush, Drive Impact, Drive Reversal, Burnout), 3-bar super gauge, special and super cancels |
| **Iron** | Tekken 8 | 4 buttons, one per limb (1 2 3 4), plus a Heat button | Strings, launchers and juggles, Tornado, wall splats, Heat (once per round), Rage Art, Evade (the 2D sidestep), standing still blocks highs and mids |

Only the mechanics are borrowed. All names, characters, numbers and art are our own.

Cross-style rules: blocking follows the **defender's** style, except that an Iron mid must always be
blocked standing (in Tekken, mids beat crouching). The full move lists are on the How to Play screen
and in `src/ui/movelist.ts`.

## Controls

| | Move | Buttons 1-6 | Pause |
|---|---|---|---|
| P1 keyboard | W A S D | U I O / J K L | Esc |
| P2 keyboard | Arrow keys | Numpad 7 8 9 / 4 5 6, or Ins Home PgUp / Del End PgDn | Backspace |
| Gamepad (Xbox names) | D-pad or left stick | X Y RB / A B RT; LB = MP+MK, LT = HP+HK | Start |

The first gamepad plays P1 and the second plays P2; the title screen can swap them. For Iron, buttons
1-6 are 1, 2, Heat, 3, 4 and unused.

Training mode: Tab cycles the dummy (stand, crouch, block all, block after the first hit, jump, CPU),
M toggles infinite meters, H shows hitboxes, R resets positions. The panel shows the last move, exact
frame advantage, combo damage and your best combo.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` makes a static site in `dist/` that any static host can serve. Add `?low` to the URL
for low graphics (no bloom or shadows) on slow machines.

## Develop

```bash
npm test           # simulation tests, plus CPU-vs-CPU soak matches
npm run typecheck
npm run build && node scripts/smoke.mjs shots   # headless screenshots (set CHROMIUM=/path/to/chrome)
```

- `src/sim/` is the game itself: deterministic, integer-only, 60 frames per second. `step(state, inputs)`
  advances one frame, so a state can be cloned and replayed. That is the groundwork for rollback
  netcode.
- `src/sim/styles/street.ts` and `src/sim/styles/iron.ts` hold every move's frame data (startup, active,
  recovery, on-hit, on-block, hitboxes). Balance changes go there.
- `src/render/` draws a match: `rig.ts` is the standard humanoid rig and IK pose solver, `poses.ts` the
  pose library, and `animator.ts` builds animations from each move's frame data. Open the game with
  `?poses` to see every pose on a grid.
- `src/game/` holds the game loop, the CPU opponent and the training dummy; `src/ui/` holds the HUD and
  menus.

## Roadmap

1. **Now:** Street and Iron styles, local versus, VS CPU, training mode.
2. **Character creator:** upload a GLB or VRM model, auto-rig it if it has no skeleton, map its bones
   onto the standard rig, then pick a style and specials. Models stay on the player's device.
3. **More styles:** Tag (Marvel Tokon-style assists with cooldowns), Shinobi (Naruto-style chakra dash,
   substitution, awakening), Ki (DBZ-style ki charge, vanish, beam clashes). Plus clip export.
4. **Online:** rollback netcode for playing with friends over the internet, real art and sound, and
   shared characters.
