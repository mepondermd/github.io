# Game regression checks

Run with Node.js 18 or newer; no packages or network access are needed:

```sh
node --test tests/index.test.cjs
```

The checks execute the actual inline game script from `index.html` in an isolated
Node VM. Browser/map initialization and presentation effects are stubbed, while
dungeon button callbacks, combat, quests, and save/load use the production logic.

Coverage includes guardian victory/escape/defeat and reward claims, borough boss
gating and saved campaign flags, and burn/bleed damage and duration across attack,
magic, guard, potion, and failed escape turns. These checks do not exercise
Leaflet, network tiles, or visual layout in a browser.
