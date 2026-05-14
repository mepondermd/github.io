const NYC_CENTER = [40.7128, -74.006];
const SAVE_KEY = "ashes_of_ny_save_v2";

const ITEMS = {
  potion: { name: "Potion", type: "consumable", heal: 30, value: 20 },
  ether: { name: "Ether", type: "consumable", mana: 20, value: 24 },
  ironPipe: { name: "Iron Pipe", type: "weapon", atk: 4, value: 35 },
  relicBlade: { name: "Relic Blade", type: "weapon", atk: 7, value: 70 },
  leatherCoat: { name: "Leather Coat", type: "armor", def: 3, value: 35 },
  mysticCloak: { name: "Mystic Cloak", type: "armor", def: 5, value: 80 },
  charmRing: { name: "Charm Ring", type: "accessory", mag: 2, value: 50 },
  emberSigil: { name: "Ember Sigil", type: "accessory", mag: 4, value: 95 },
};

const MERCHANT_STOCK = ["potion", "ether", "ironPipe", "leatherCoat", "charmRing", "emberSigil"];
const ENEMY_ARCHETYPES = [
  { name: "Feral Scavenger", hp: 36, atk: 8, mag: 2 },
  { name: "Radioactive Hound", hp: 30, atk: 10, mag: 0 },
  { name: "Arcane Cultist", hp: 40, atk: 6, mag: 10 },
  { name: "Tunnel Brute", hp: 48, atk: 11, mag: 0 },
];

const COMBAT_SKILLS = [
  { id: "ironWill", name: "Iron Will", cost: 1, effect: "+25 Max HP", apply: (p) => (p.maxHp += 25) },
  { id: "bladeMastery", name: "Blade Mastery", cost: 1, effect: "+3 base ATK", apply: (p) => (p.atk += 3) },
  { id: "riposte", name: "Riposte", cost: 2, effect: "15% chance to counter-hit" },
];

const MAGIC_SKILLS = [
  { id: "manaFlow", name: "Mana Flow", cost: 1, effect: "+20 Max MP", apply: (p) => (p.maxMp += 20) },
  { id: "pyroBurst", name: "Pyro Burst", cost: 1, effect: "Unlocks stronger fire spell" },
  { id: "stormCall", name: "Storm Call", cost: 2, effect: "Unlocks high-tier lightning spell" },
];

// Approximate zone risk weighting inspired by publicly released NYPD complaint trends by area.
const CRIME_ZONES = [
  { name: "Midtown", center: [40.758, -73.9855], crimeIndex: 1.45 },
  { name: "South Bronx", center: [40.816, -73.915], crimeIndex: 1.55 },
  { name: "Harlem", center: [40.8116, -73.9465], crimeIndex: 1.3 },
  { name: "Lower Manhattan", center: [40.7075, -74.0113], crimeIndex: 1.1 },
  { name: "Downtown Brooklyn", center: [40.6928, -73.99], crimeIndex: 1.15 },
  { name: "Queens Village", center: [40.7262, -73.7411], crimeIndex: 0.8 },
  { name: "Staten Island North Shore", center: [40.642, -74.075], crimeIndex: 0.75 },
];

const state = {
  player: {
    name: "Warden",
    level: 1,
    exp: 0,
    nextExp: 90,
    skillPoints: 0,
    unlockedSkills: [],
    hp: 120,
    maxHp: 120,
    mp: 45,
    maxMp: 45,
    atk: 10,
    mag: 9,
    def: 5,
    gold: 70,
    pos: [...NYC_CENTER],
    inventory: ["potion", "potion", "ether", "ironPipe", "leatherCoat"],
    equipment: { weapon: null, armor: null, accessory: null },
  },
  inCombat: false,
  enemy: null,
  zone: null,
};

let map;
let playerMarker;
let merchantMarker;

const el = {
  playerStats: document.getElementById("player-stats"),
  zoneDisplay: document.getElementById("zone-display"),
  equipment: document.getElementById("equipment"),
  inventory: document.getElementById("inventory"),
  combatSkills: document.getElementById("combat-skills"),
  magicSkills: document.getElementById("magic-skills"),
  skillPoints: document.getElementById("skill-points"),
  log: document.getElementById("log"),
  saveBtn: document.getElementById("save-btn"),
  loadBtn: document.getElementById("load-btn"),
  restBtn: document.getElementById("rest-btn"),
  combatModal: document.getElementById("combat-modal"),
  combatStatus: document.getElementById("combat-status"),
  attackBtn: document.getElementById("attack-btn"),
  magicBtn: document.getElementById("magic-btn"),
  itemBtn: document.getElementById("item-btn"),
  runBtn: document.getElementById("run-btn"),
  merchantModal: document.getElementById("merchant-modal"),
  merchantBuyList: document.getElementById("merchant-buy-list"),
  merchantSellList: document.getElementById("merchant-sell-list"),
  merchantCloseBtn: document.getElementById("merchant-close-btn"),
};

function init() {
  map = L.map("map").setView(state.player.pos, 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  playerMarker = L.marker(state.player.pos).addTo(map).bindPopup("You");
  merchantMarker = L.marker([40.758, -73.9855]).addTo(map).bindPopup("Merchant Camp");

  wireEvents();
  refreshZone();
  renderAll();
  log("Welcome to the Ashes of New York.");
}

function wireEvents() {
  document.addEventListener("keydown", handleMovementKeys);
  el.saveBtn.addEventListener("click", saveGame);
  el.loadBtn.addEventListener("click", loadGame);
  el.restBtn.addEventListener("click", () => {
    if (state.inCombat) return;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 20);
    log("You rest at camp and recover 20 HP.");
    renderAll();
  });
  el.attackBtn.addEventListener("click", playerAttack);
  el.magicBtn.addEventListener("click", playerMagic);
  el.itemBtn.addEventListener("click", usePotionInCombat);
  el.runBtn.addEventListener("click", attemptEscape);
  el.merchantCloseBtn.addEventListener("click", () => el.merchantModal.classList.add("hidden"));
}

function handleMovementKeys(e) {
  if (["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === "e") return tryMerchantInteract();
  if (state.inCombat) return;

  const step = 0.003;
  const key = e.key.toLowerCase();
  const move = {
    arrowup: [step, 0], w: [step, 0], arrowdown: [-step, 0], s: [-step, 0],
    arrowleft: [0, -step], a: [0, -step], arrowright: [0, step], d: [0, step],
  }[key];

  if (!move) return;
  e.preventDefault();
  state.player.pos[0] += move[0];
  state.player.pos[1] += move[1];
  updatePlayerPosition();
  refreshZone();
  rollExplorationEvents();
  renderAll();
}

function updatePlayerPosition() {
  playerMarker.setLatLng(state.player.pos);
  map.panTo(state.player.pos, { animate: false });
}

function refreshZone() {
  let best = CRIME_ZONES[0];
  let bestD = Infinity;
  for (const z of CRIME_ZONES) {
    const d = distance(state.player.pos, z.center);
    if (d < bestD) {
      best = z;
      bestD = d;
    }
  }
  state.zone = best;
}

function tryMerchantInteract() {
  const d = distance(state.player.pos, merchantMarker.getLatLng());
  if (d < 0.02 && !state.inCombat) {
    renderMerchantLists();
    el.merchantModal.classList.remove("hidden");
    log("You enter the merchant camp.");
  } else log("No one to interact with nearby.");
}

function renderMerchantLists() {
  el.merchantBuyList.innerHTML = "";
  MERCHANT_STOCK.forEach((id) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = `Buy ${ITEMS[id].name} (${ITEMS[id].value}g)`;
    b.onclick = () => buyItem(id);
    li.appendChild(b);
    el.merchantBuyList.appendChild(li);
  });
  el.merchantSellList.innerHTML = "";
  uniqueInventory().forEach(({ id, count }) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = `Sell ${ITEMS[id].name} x${count} (${Math.floor(ITEMS[id].value / 2)}g)`;
    b.onclick = () => sellItem(id);
    li.appendChild(b);
    el.merchantSellList.appendChild(li);
  });
}

function buyItem(id) {
  if (state.player.gold < ITEMS[id].value) return log("Not enough gold.");
  state.player.gold -= ITEMS[id].value;
  state.player.inventory.push(id);
  log(`Bought ${ITEMS[id].name}.`);
  renderAll();
  renderMerchantLists();
}

function sellItem(id) {
  const idx = state.player.inventory.indexOf(id);
  if (idx < 0) return;
  state.player.inventory.splice(idx, 1);
  const gain = Math.floor(ITEMS[id].value / 2);
  state.player.gold += gain;
  log(`Sold ${ITEMS[id].name} for ${gain}g.`);
  renderAll();
  renderMerchantLists();
}

function rollExplorationEvents() {
  const danger = state.zone.crimeIndex;
  const combatChance = Math.min(0.4, 0.12 * danger);
  if (Math.random() < combatChance) return startCombat();

  if (Math.random() < 0.08 + (danger * 0.03)) {
    const drops = danger > 1.2 ? ["ether", "relicBlade", "mysticCloak", "emberSigil"] : ["potion", "ether", "leatherCoat", "charmRing"];
    const drop = drops[Math.floor(Math.random() * drops.length)];
    state.player.inventory.push(drop);
    log(`You scavenge in ${state.zone.name} and find ${ITEMS[drop].name}.`);
  }
}

function startCombat() {
  state.inCombat = true;
  const t = ENEMY_ARCHETYPES[Math.floor(Math.random() * ENEMY_ARCHETYPES.length)];
  const mult = state.zone.crimeIndex;
  state.enemy = {
    name: `${state.zone.name} ${t.name}`,
    hp: Math.floor(t.hp * mult),
    atk: Math.floor(t.atk * mult),
    mag: Math.floor(t.mag * mult),
    exp: Math.floor(18 * mult + state.player.level * 6),
    gold: Math.floor(10 * mult + Math.random() * 12),
    lootTier: mult,
  };
  el.combatModal.classList.remove("hidden");
  renderCombatStatus();
  log(`A ${state.enemy.name} appears! Danger multiplier: x${mult.toFixed(2)}.`);
}

function playerAttack() {
  if (!state.inCombat) return;
  const dmg = Math.max(1, randomRange(4, 9) + totalAtk());
  state.enemy.hp -= dmg;
  log(`You strike for ${dmg} damage.`);
  maybeCounterHeal();
  afterPlayerAction();
}

function playerMagic() {
  if (!state.inCombat) return;
  const spell = chooseSpell();
  if (state.player.mp < spell.cost) return log("Not enough MP.");
  state.player.mp -= spell.cost;
  const dmg = Math.max(4, randomRange(spell.min, spell.max) + totalMag());
  state.enemy.hp -= dmg;
  log(`${spell.name} hits for ${dmg} damage.`);
  afterPlayerAction();
}

function chooseSpell() {
  if (state.player.unlockedSkills.includes("stormCall")) return { name: "Storm Call", cost: 20, min: 16, max: 30 };
  if (state.player.unlockedSkills.includes("pyroBurst")) return { name: "Pyro Burst", cost: 14, min: 12, max: 22 };
  return { name: "Arcane Burst", cost: 10, min: 8, max: 16 };
}

function usePotionInCombat() {
  if (!state.inCombat) return;
  const idx = state.player.inventory.indexOf("potion");
  if (idx === -1) return log("No potion available.");
  state.player.inventory.splice(idx, 1);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + ITEMS.potion.heal);
  log(`You drink a Potion and recover ${ITEMS.potion.heal} HP.`);
  enemyTurn();
  renderAll();
}

function attemptEscape() {
  if (!state.inCombat) return;
  const escapeChance = Math.max(0.2, 0.55 - (state.zone.crimeIndex - 1) * 0.2);
  if (Math.random() < escapeChance) {
    log("You escaped successfully.");
    return endCombat();
  }
  log("Escape failed!");
  enemyTurn();
  renderAll();
}

function afterPlayerAction() {
  if (state.enemy.hp <= 0) return onEnemyDefeated();
  enemyTurn();
  renderAll();
}

function enemyTurn() {
  if (!state.inCombat) return;
  const useMagic = state.enemy.mag > 0 && Math.random() < 0.32;
  const damage = useMagic
    ? Math.max(2, randomRange(5, 11) + state.enemy.mag - totalDef())
    : Math.max(1, randomRange(4, 10) + state.enemy.atk - totalDef());

  state.player.hp -= damage;
  log(`${state.enemy.name} ${useMagic ? "casts hex" : "attacks"} for ${damage}.`);

  if (state.player.unlockedSkills.includes("riposte") && Math.random() < 0.15 && state.inCombat) {
    const counter = Math.max(2, Math.floor(totalAtk() * 0.5));
    state.enemy.hp -= counter;
    log(`Riposte triggers! Counter-hit for ${counter}.`);
  }

  if (state.enemy.hp <= 0) return onEnemyDefeated();

  if (state.player.hp <= 0) {
    state.player.hp = 1;
    state.player.gold = Math.max(0, state.player.gold - 25);
    log("You collapse and awaken later, losing 25 gold.");
    endCombat();
  }
}

function onEnemyDefeated() {
  state.player.exp += state.enemy.exp;
  state.player.gold += state.enemy.gold;
  log(`Defeated ${state.enemy.name}. +${state.enemy.exp} EXP, +${state.enemy.gold} gold.`);

  const tier = state.enemy.lootTier;
  const drops = tier > 1.2 ? ["ether", "relicBlade", "mysticCloak", "emberSigil"] : ["potion", "ether", "ironPipe", "leatherCoat"];
  if (Math.random() < 0.65) {
    const drop = drops[Math.floor(Math.random() * drops.length)];
    state.player.inventory.push(drop);
    log(`Loot drop: ${ITEMS[drop].name}.`);
  }

  while (state.player.exp >= state.player.nextExp) {
    state.player.exp -= state.player.nextExp;
    state.player.level += 1;
    state.player.skillPoints += 1;
    state.player.nextExp = Math.floor(state.player.nextExp * 1.24);
    state.player.maxHp += 10;
    state.player.maxMp += 6;
    state.player.atk += 2;
    state.player.mag += 2;
    state.player.def += 1;
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;
    log(`Level up! L${state.player.level}. Skill point gained.`);
  }

  endCombat();
}

function endCombat() {
  state.inCombat = false;
  state.enemy = null;
  el.combatModal.classList.add("hidden");
  renderAll();
}

function maybeCounterHeal() {
  if (state.player.unlockedSkills.includes("ironWill") && Math.random() < 0.12) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
    log("Iron Will steadies you (+4 HP).");
  }
}

function renderAll() {
  renderPlayer();
  renderInventory();
  renderEquipment();
  renderSkills();
  renderCombatStatus();
}

function renderPlayer() {
  el.playerStats.innerHTML = `<p><strong>${state.player.name}</strong> Lv. ${state.player.level}</p>
    <p>HP: <span class="${state.player.hp < state.player.maxHp * 0.3 ? "stat-bad" : "stat-good"}">${state.player.hp}</span>/${state.player.maxHp}</p>
    <p>MP: ${state.player.mp}/${state.player.maxMp}</p>
    <p>ATK: ${totalAtk()} | MAG: ${totalMag()} | DEF: ${totalDef()}</p>
    <p>EXP: ${state.player.exp}/${state.player.nextExp}</p>
    <p>Gold: ${state.player.gold}</p>`;
  el.zoneDisplay.textContent = `Current zone: ${state.zone.name} | Threat x${state.zone.crimeIndex.toFixed(2)}`;
}

function renderInventory() {
  el.inventory.innerHTML = "";
  uniqueInventory().forEach(({ id, count }) => {
    const item = ITEMS[id];
    const li = document.createElement("li");
    li.textContent = `${item.name} x${count} `;
    if (["weapon", "armor", "accessory"].includes(item.type)) {
      const b = document.createElement("button");
      b.textContent = "Equip";
      b.onclick = () => equipItem(id);
      li.appendChild(b);
    }
    if (item.type === "consumable") {
      const b = document.createElement("button");
      b.textContent = "Use";
      b.onclick = () => useConsumable(id);
      li.appendChild(b);
    }
    el.inventory.appendChild(li);
  });
}

function renderEquipment() {
  const e = state.player.equipment;
  el.equipment.innerHTML = `<p>Weapon: ${e.weapon ? ITEMS[e.weapon].name : "None"}</p>
    <p>Armor: ${e.armor ? ITEMS[e.armor].name : "None"}</p>
    <p>Accessory: ${e.accessory ? ITEMS[e.accessory].name : "None"}</p>`;
}

function renderSkills() {
  el.skillPoints.textContent = `Available skill points: ${state.player.skillPoints}`;
  renderSkillList(el.combatSkills, COMBAT_SKILLS);
  renderSkillList(el.magicSkills, MAGIC_SKILLS);
}

function renderSkillList(target, skills) {
  target.innerHTML = "";
  for (const s of skills) {
    const li = document.createElement("li");
    const unlocked = state.player.unlockedSkills.includes(s.id);
    li.className = unlocked ? "" : "skill-locked";
    const b = document.createElement("button");
    b.textContent = unlocked ? `Unlocked: ${s.name}` : `Unlock ${s.name} (${s.cost})`;
    b.disabled = unlocked || state.player.skillPoints < s.cost;
    b.onclick = () => unlockSkill(s);
    li.append(`${s.effect} `);
    li.appendChild(b);
    target.appendChild(li);
  }
}

function unlockSkill(skill) {
  if (state.player.unlockedSkills.includes(skill.id)) return;
  if (state.player.skillPoints < skill.cost) return;
  state.player.skillPoints -= skill.cost;
  state.player.unlockedSkills.push(skill.id);
  if (skill.apply) skill.apply(state.player);
  state.player.hp = Math.min(state.player.hp, state.player.maxHp);
  state.player.mp = Math.min(state.player.mp, state.player.maxMp);
  log(`Unlocked skill: ${skill.name}.`);
  renderAll();
}

function renderCombatStatus() {
  if (!state.inCombat || !state.enemy) return (el.combatStatus.textContent = "No active combat.");
  const spell = chooseSpell();
  el.combatStatus.innerHTML = `<p><strong>${state.enemy.name}</strong></p>
    <p>Enemy HP: ${Math.max(0, state.enemy.hp)}</p><hr />
    <p>Your HP: ${state.player.hp}/${state.player.maxHp} | MP: ${state.player.mp}/${state.player.maxMp}</p>
    <p>Current spell: ${spell.name} (Cost ${spell.cost})</p>`;
}

function useConsumable(id) {
  if (state.inCombat && id !== "potion") return log("Only Potion can be quickly used in combat.");
  const idx = state.player.inventory.indexOf(id);
  if (idx === -1) return;
  state.player.inventory.splice(idx, 1);
  if (ITEMS[id].heal) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + ITEMS[id].heal);
    log(`Used ${ITEMS[id].name}, recovered ${ITEMS[id].heal} HP.`);
  }
  if (ITEMS[id].mana) {
    state.player.mp = Math.min(state.player.maxMp, state.player.mp + ITEMS[id].mana);
    log(`Used ${ITEMS[id].name}, recovered ${ITEMS[id].mana} MP.`);
  }
  renderAll();
}

function equipItem(id) {
  const item = ITEMS[id];
  if (!["weapon", "armor", "accessory"].includes(item.type)) return;
  const slot = item.type;
  const current = state.player.equipment[slot];
  if (current) state.player.inventory.push(current);
  const idx = state.player.inventory.indexOf(id);
  if (idx !== -1) {
    state.player.inventory.splice(idx, 1);
    state.player.equipment[slot] = id;
    log(`Equipped ${item.name} (${slot}).`);
  }
  renderAll();
}

function totalAtk() {
  return state.player.atk + (state.player.equipment.weapon ? ITEMS[state.player.equipment.weapon].atk || 0 : 0);
}
function totalDef() {
  return state.player.def + (state.player.equipment.armor ? ITEMS[state.player.equipment.armor].def || 0 : 0);
}
function totalMag() {
  return state.player.mag + (state.player.equipment.accessory ? ITEMS[state.player.equipment.accessory].mag || 0 : 0);
}

function uniqueInventory() {
  const counts = {};
  for (const id of state.player.inventory) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).map(([id, count]) => ({ id, count }));
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.player));
  log("Game saved.");
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return log("No save data found.");
  try {
    state.player = JSON.parse(raw);
    updatePlayerPosition();
    refreshZone();
    renderAll();
    log("Game loaded.");
  } catch {
    log("Save data corrupted.");
  }
}

function log(msg) {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.log.prepend(div);
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function distance([lat1, lng1], p2) {
  const lat2 = p2.lat ?? p2[0];
  const lng2 = p2.lng ?? p2[1];
  return Math.hypot(lat2 - lat1, lng2 - lng1);
}

init();
