const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const htmlPath = process.env.RPG_HTML_PATH || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, "Expected the single inline game script");
assert.match(scripts[0][1], /\n\s*init\(\);\s*$/);
// Load the actual game code, skipping only browser/map initialization.
const gameScript = new vm.Script(scripts[0][1].replace(/\n\s*init\(\);\s*$/, "\n"), {
  filename: htmlPath,
});

function element(hidden = false) {
  const classes = new Set(hidden ? ["hidden"] : []);
  return {
    children: [],
    textContent: "",
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    set innerHTML(value) { this.children = []; this.html = value; },
    get innerHTML() { return this.html || ""; },
    appendChild(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
  };
}

function createGame() {
  const elements = new Map();
  const storage = new Map();
  const math = Object.create(Math);
  math.random = () => 0.5;
  const context = vm.createContext({
    Math: math,
    window: {},
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element(id.endsWith("-modal")));
        return elements.get(id);
      },
      createElement: () => element(),
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  gameScript.runInContext(context);
  // Stub presentation and map effects; combat, quest, save/load, and dungeon
  // transitions still run from index.html, including real button callbacks.
  vm.runInContext(`
    renderAll = () => {};
    renderCombatStatus = () => {};
    renderMobileCompactStats = () => {};
    renderMobilePanel = () => {};
    setActiveObjectiveMarker = () => {};
    updatePlayerPosition = () => {};
    applyWorldVisuals = () => {};
  `, context);
  const game = vm.runInContext(`({
    state, BUILDINGS, BOROUGH_ORDER, CRIME_ZONES, startDungeonRun,
    renderDungeon, startCombat, startBoroughBossBattle, assignMainQuestForBorough,
    completeMainQuest, checkFinalBossUnlock, playerAttack, playerMagic,
    playerGuard, usePotionInCombat, attemptEscape, enemyTurn, saveGame, loadGame
  })`, context);
  game.state.zone = { name: "Lower Manhattan", crimeIndex: 1.1 };
  game.state.player.nextExp = 100000;
  game.button = (label) => {
    const button = elements.get("dungeon-controls").children.find((b) => b.textContent === label);
    assert.ok(button, `Missing dungeon button: ${label}`);
    return button;
  };
  game.hasButton = (label) => elements.get("dungeon-controls")?.children.some((b) => b.textContent === label) || false;
  game.modalHidden = (id) => elements.get(id).classList.contains("hidden");
  game.random = (value) => { math.random = () => value; };
  return game;
}

function prepareDungeon() {
  const game = createGame();
  game.state.quests = [{ id: "dungeon-check", type: "dungeon", goal: 1, progress: 0, claimed: false }];
  game.state.campaign.stageByBorough.manhattan = 2;
  game.assignMainQuestForBorough("manhattan", "Tester");
  game.startDungeonRun(game.BUILDINGS[0]);
  game.button("Advance Quietly").onclick();
  return game;
}

function assertDungeonIncomplete(game) {
  assert.equal(game.state.questStats.dungeonClears, 0);
  assert.equal(game.state.quests[0].progress, 0);
  assert.equal(game.state.campaign.activeMainQuest.progress, 0);
  assert.equal(game.state.campaign.stageByBorough.manhattan, 2);
}

function winWithAttack(game) {
  game.state.enemy.hp = 1;
  game.playerAttack();
  assert.equal(game.state.inCombat, false);
}

test("starting a guardian fight keeps rewards locked and blocks stale dungeon controls", () => {
  const game = prepareDungeon();
  const dungeon = game.state.dungeon;
  const fight = game.button("Fight Guardian");
  const retreat = game.button("Retreat");
  fight.onclick();
  assert.equal(dungeon.stage, 2);
  assert.equal(game.state.inCombat, true);
  assert.equal(game.hasButton("Claim Reward"), false);
  assert.equal(game.modalHidden("dungeon-modal"), true);
  assert.equal(game.modalHidden("combat-modal"), false);
  const guardian = game.state.enemy;
  fight.onclick();
  retreat.onclick();
  assert.equal(game.state.enemy, guardian);
  assert.equal(game.state.dungeon, dungeon);
  assertDungeonIncomplete(game);
});

for (const outcome of ["escape", "defeat"]) {
  test(`guardian ${outcome} leaves the dungeon incomplete and allows a retry`, () => {
    const game = prepareDungeon();
    game.button("Fight Guardian").onclick();
    if (outcome === "escape") {
      game.random(0);
      game.attemptEscape();
    } else {
      game.state.player.hp = 1;
      game.state.enemy.mag = 0;
      game.enemyTurn();
    }
    assert.equal(game.state.inCombat, false);
    assert.equal(game.state.dungeon.stage, 2);
    assert.equal(game.modalHidden("dungeon-modal"), false);
    assert.equal(game.hasButton("Claim Reward"), false);
    assertDungeonIncomplete(game);
    game.button("Fight Guardian").onclick();
    assert.equal(game.state.inCombat, true);
    winWithAttack(game);
    assert.equal(game.state.dungeon.stage, 3);
    assert.equal(game.hasButton("Claim Reward"), true);
  });
}

test("guardian victory unlocks one reward and advances dungeon quests only when claimed", () => {
  const game = prepareDungeon();
  game.button("Fight Guardian").onclick();
  winWithAttack(game);
  assert.equal(game.state.dungeon.stage, 3);
  assert.equal(game.modalHidden("dungeon-modal"), false);
  assert.equal(game.modalHidden("combat-modal"), true);
  assertDungeonIncomplete(game);
  const claim = game.button("Claim Reward");
  const inventorySize = game.state.player.inventory.length;
  const exp = game.state.player.exp;
  claim.onclick();
  assert.equal(game.state.player.inventory.length, inventorySize + 1);
  assert.equal(game.state.player.exp, exp + 28 + 75);
  assert.equal(game.state.questStats.dungeonClears, 1);
  assert.equal(game.state.quests[0].progress, 1);
  assert.equal(game.state.campaign.stageByBorough.manhattan, 3);
  assert.equal(game.state.campaign.tamed.manhattan, false);
  assert.equal(game.state.dungeon, null);
  assert.equal(game.modalHidden("dungeon-modal"), true);
  claim.onclick();
  assert.equal(game.state.player.inventory.length, inventorySize + 1);
  assert.equal(game.state.player.exp, exp + 28 + 75);
  assert.equal(game.state.questStats.dungeonClears, 1);
});

test("an unrelated combat victory cannot unlock a dungeon reward", () => {
  const game = prepareDungeon();
  game.startCombat(false);
  winWithAttack(game);
  assert.equal(game.state.dungeon.stage, 2);
  assert.equal(game.hasButton("Claim Reward"), false);
  assertDungeonIncomplete(game);
});

test("a fatal guardian burn tick grants victory before the guardian can retaliate", () => {
  const game = prepareDungeon();
  game.button("Fight Guardian").onclick();
  game.state.enemy.hp = 4;
  game.state.enemy.statuses = [{ type: "burn", power: 4, turns: 3 }];
  const playerHp = game.state.player.hp;
  game.playerGuard();
  assert.equal(game.state.inCombat, false);
  assert.equal(game.state.player.hp, playerHp);
  assert.equal(game.state.questStats.kills, 1);
  assert.equal(game.state.dungeon.stage, 3);
  assert.equal(game.hasButton("Claim Reward"), true);
  assertDungeonIncomplete(game);
});

test("completing all three normal quests leaves every borough untamed with its boss available", () => {
  const game = createGame();
  for (const borough of game.BOROUGH_ORDER) {
    for (let stage = 0; stage < 3; stage += 1) {
      game.assignMainQuestForBorough(borough, "Tester");
      game.state.campaign.activeMainQuest.progress = game.state.campaign.activeMainQuest.goal;
      game.completeMainQuest();
      assert.equal(game.state.campaign.stageByBorough[borough], stage + 1);
      assert.equal(game.state.campaign.tamed[borough], false, borough);
      assert.equal(game.state.campaign.finalBossUnlocked, false);
    }
    game.assignMainQuestForBorough(borough, "Tester");
    assert.equal(game.state.campaign.activeMainQuest.type, "main_boss");
  }
});

test("borough victories tame the matching borough and only the fifth unlocks the final boss", () => {
  const game = createGame();
  const zoneNames = ["Midtown", "South Bronx", "Downtown Brooklyn", "Queens Village", "Staten Island North Shore"];
  game.BOROUGH_ORDER.forEach((borough, index) => {
    game.state.zone = game.CRIME_ZONES.find((zone) => zone.name === zoneNames[index]);
    game.state.campaign.stageByBorough[borough] = 3;
    game.assignMainQuestForBorough(borough, "Tester");
    game.startBoroughBossBattle(borough);
    winWithAttack(game);
    for (const other of game.BOROUGH_ORDER) {
      const defeated = game.BOROUGH_ORDER.indexOf(other) <= index;
      assert.equal(game.state.campaign.boroughBossDefeated[other], defeated, other);
      assert.equal(game.state.campaign.tamed[other], defeated, other);
    }
    assert.equal(game.state.campaign.activeMainQuest, null);
    assert.equal(game.state.campaign.finalBossUnlocked, index === game.BOROUGH_ORDER.length - 1);
  });
});

for (const outcome of ["escape", "defeat"]) {
  test(`borough boss ${outcome} does not tame the borough or unlock the final boss`, () => {
    const game = createGame();
    game.state.campaign.stageByBorough.manhattan = 3;
    game.startBoroughBossBattle("manhattan");
    if (outcome === "escape") {
      game.random(0);
      game.attemptEscape();
    } else {
      game.state.player.hp = 1;
      game.enemyTurn();
    }
    assert.equal(game.state.inCombat, false);
    assert.equal(game.state.campaign.boroughBossDefeated.manhattan, false);
    assert.equal(game.state.campaign.tamed.manhattan, false);
    assert.equal(game.state.campaign.finalBossUnlocked, false);
  });
}

test("stale tamed flags alone cannot unlock the final boss", () => {
  const game = createGame();
  for (const borough of game.BOROUGH_ORDER) game.state.campaign.tamed[borough] = true;
  game.checkFinalBossUnlock();
  assert.equal(game.state.campaign.finalBossUnlocked, false);
});

test("loading a save repairs premature taming and final boss unlock while preserving actual victories", () => {
  const game = createGame();
  for (const borough of game.BOROUGH_ORDER) {
    game.state.campaign.stageByBorough[borough] = 3;
    game.state.campaign.tamed[borough] = true;
  }
  game.state.campaign.boroughBossDefeated.manhattan = true;
  game.state.campaign.finalBossUnlocked = true;
  game.saveGame();
  game.loadGame();
  for (const borough of game.BOROUGH_ORDER) {
    assert.equal(game.state.campaign.tamed[borough], borough === "manhattan", borough);
  }
  assert.equal(game.state.campaign.finalBossUnlocked, false);
  assert.equal(game.state.campaign.stageByBorough.manhattan, 3);
});

test("loading a save preserves a final boss unlock earned by defeating all five bosses", () => {
  const game = createGame();
  for (const borough of game.BOROUGH_ORDER) {
    game.state.campaign.boroughBossDefeated[borough] = true;
    game.state.campaign.tamed[borough] = true;
  }
  game.state.campaign.finalBossUnlocked = true;
  game.saveGame();
  game.loadGame();
  assert.equal(game.state.campaign.finalBossUnlocked, true);
  assert.ok(game.BOROUGH_ORDER.every((borough) => game.state.campaign.tamed[borough]));
});

const actions = [
  ["attack", "playerAttack", 17],
  ["magic", "playerMagic", 21],
  ["guard", "playerGuard", 0],
  ["potion", "usePotionInCombat", 0],
  ["failed escape", "attemptEscape", 0],
];

for (const [label, action, directDamage] of actions) {
  test(`burn and bleed tick once per enemy turn after ${label}, lasting three turns`, () => {
    const game = createGame();
    game.startCombat();
    const enemy = game.state.enemy;
    Object.assign(enemy, {
      hp: 500, maxHp: 500, atk: 0, mag: 0, weak: "none", resist: {},
      statuses: [{ type: "burn", power: 4, turns: 3 }, { type: "bleed", power: 3, turns: 3 }],
    });
    game.state.player.inventory = ["potion", "potion", "potion"];
    for (let turn = 1; turn <= 3; turn += 1) {
      game[action]();
      assert.equal(enemy.hp, 500 - turn * (directDamage + 7));
      assert.equal(game.state.inCombat, true);
      assert.deepEqual(Array.from(enemy.statuses, (status) => status.turns), turn < 3 ? [3 - turn, 3 - turn] : []);
    }
  });
}

for (const [skill, action, type, directDamage, tickDamage] of [
  ["bladeMastery", "playerAttack", "bleed", 14, 3],
  ["pyroBurst", "playerMagic", "burn", 22, 4],
]) {
  test(`newly inflicted ${type} ticks only once on the next enemy turn`, () => {
    const game = createGame();
    game.startCombat();
    const enemy = game.state.enemy;
    Object.assign(enemy, { hp: 500, maxHp: 500, mag: 0, weak: "none", resist: {} });
    game.state.player.unlockedSkills = [skill];
    game.random(0.1);
    game[action]();
    assert.equal(enemy.hp, 500 - directDamage - tickDamage);
    assert.equal(enemy.statuses.length, 1);
    assert.equal(enemy.statuses[0].type, type);
    assert.equal(enemy.statuses[0].turns, 2);
  });
}

test("a direct killing blow resolves victory without ticking a defeated enemy's statuses", () => {
  const game = createGame();
  game.startCombat();
  const enemy = game.state.enemy;
  enemy.statuses = [{ type: "burn", power: 4, turns: 3 }];
  winWithAttack(game);
  assert.equal(enemy.statuses[0].turns, 3);
  assert.equal(game.state.questStats.kills, 1);
  game.enemyTurn();
  assert.equal(game.state.questStats.kills, 1);
});

test("status damage ticks once even when shock skips the enemy's attack", () => {
  const game = createGame();
  game.startCombat();
  const enemy = game.state.enemy;
  enemy.hp = 100;
  enemy.statuses = [{ type: "burn", power: 4, turns: 3 }, { type: "shock", power: 0, turns: 2 }];
  game.random(0.1);
  const playerHp = game.state.player.hp;
  game.playerGuard();
  assert.equal(enemy.hp, 96);
  assert.equal(enemy.statuses[0].turns, 2);
  assert.equal(enemy.statuses.length, 1);
  assert.equal(game.state.player.hp, playerHp);
});
