import {BUNDLES, CURRENCY_IN_GP, RARITY_VALUE} from './bundles.mjs';
import {ENCOUNTER_SHARES, ADVENTURE_SHARES, planPool, claimShares, progress, isPool} from './parcels.mjs';

const MODULE_ID = 'black-flag-treasure-generator';
const TABLE_PACK = 'kp-tov-game-masters-guide.kp-tov-gmg-tables';
const STORE_FLAG = 'treasureBudgetStore';
let busy = false;
const DialogV2 = foundry.applications.api.DialogV2;
const CATEGORY_NAMES = {
  magic: 'Magic Items', consumable: 'Consumables',
  gem: 'Gemstones', art: 'Art Objects',
  scroll: 'Spell Scrolls', potion: 'Potions', ammunition: 'Magic Ammunition'
};
const SECTION_ORDER = ['Magic Items','Consumables','Spell Scrolls','Magic Ammunition','Potions','Gemstones','Art Objects'];
const TABLE_PREFIX = {magic:'Magic Items', consumable:'Consumable Magic Items', gem:'Gemstones', art:'Art Objects'};
// Two missing ranges observed in GMG 13.0.0; names are from the owned printed guide.
const ROLL_FIXES = {
  'Magic Items, Uncommon': [{min:49,max:50,name:'Ring of Feather Falling'}],
  'Consumable Magic Items, Rare': [{min:71,max:74,name:'Potion of Mind Reading'}]
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function plainText(value) {
  let content = String(value ?? '').replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');
  const div = document.createElement('div');
  div.innerHTML = content;
  return (div.textContent ?? content).trim().replace(/\s+/g,' ');
}
function displayLabel(result) {
  return plainText(result?.text || result?.name || result?.documentId || 'Unknown result');
}
function isMatchingType(label, type) {
  if (!type || type === 'item') return true;
  const name = label.toLowerCase();
  const shield = /\bshield\b|\bbuckler\b/.test(name);
  const wand = /\bwand\b/.test(name);
  const armor = /\barmor\b|\barmour\b|\bmail\b|\bplate\b/.test(name);
  const weapon = /\bweapon\b|\bsword\b|\bblade\b|\bdagger\b|\bmace\b|\baxe\b|\bbow\b|\bspear\b|\bstaff\b|\btrident\b|\bjavelin\b|\bscimitar\b|\bhammer\b|\bpolearm\b|\bflail\b|\bwhip\b|\bavenger\b|\bdefender\b|\bbrand\b|\bthrower\b|\boathbow\b|\bstealer\b/.test(name);
  switch (type) {
    case 'armor': return armor && !shield;
    case 'shield': return shield;
    case 'wand': return wand;
    case 'weapon': return weapon && !wand;
    case 'wandOrShield': return shield || wand;
    default: return false;
  }
}
function typedLabel(type) {
  return ({armor:'armor',shield:'shield',weapon:'weapon',wand:'wand',wandOrShield:'wand or shield'})[type] || 'magic item';
}
async function randomInt(sides) {
  const r = await (new Roll(`1d${sides}`)).evaluate();
  return Number(r.total);
}
async function rollQuantity(spec, party) {
  if (Number.isInteger(spec)) return spec;
  const formula = String(spec);
  if (formula.startsWith('party')) {
    const plus = formula.replace(/^party\+?/,'');
    if (!plus) return party;
    return party + Number((await new Roll(plus).evaluate()).total);
  }
  return Number((await new Roll(formula).evaluate()).total);
}
async function chooseRarity(rarity) {
  if (Array.isArray(rarity)) return rarity[(await randomInt(rarity.length))-1];
  return rarity;
}

class TreasureSource {
  constructor(pack) {
    this.pack = pack;
    this.byName = new Map();
  }
  async initialize() {
    const index = await this.pack.getIndex();
    for (const entry of index) this.byName.set(entry.name, entry._id);
  }
  async get(name) {
    const id = this.byName.get(name);
    if (!id) throw new Error(`Official GMG RollTable not found: ${name}`);
    const table = await this.pack.getDocument(id);
    if (!table) throw new Error(`Could not load GMG RollTable: ${name}`);
    return table;
  }
  async draw(name, type = 'item', warnings) {
    const table = await this.get(name);
    if (type !== 'item') {
      // Type-specific GMG rewards require choosing an appropriate item; there
      // are no dedicated equipment-type tables. Filter the OFFICIAL entries.
      const candidates = [...table.results].filter(r => isMatchingType(displayLabel(r),type));
      const totalWeight = candidates.reduce((sum,r) => sum + Math.max(1, Number(r.weight) || 1), 0);
      if (!totalWeight) {
        const placeholder = `${name.replace('Magic Items, ', '')} magic ${typedLabel(type)} (GM selection)`;
        warnings.push(`No matching ${typedLabel(type)} entries were found in ${name}; manual selection needed.`);
        return {name:placeholder, needsSelection:true};
      }
      let n = await randomInt(totalWeight);
      for (const r of candidates) {
        n -= Math.max(1, Number(r.weight) || 1);
        if (n <= 0) return {name:displayLabel(r), needsSelection:false};
      }
    }
    // roll() is non-mutating; draw() may mark results as drawn on a RollTable.
    // We never alter the official protected compendium.
    const outcome = await table.roll({recursive:false});
    const result = outcome?.results?.[0];
    if (result) return {name:displayLabel(result), needsSelection:false};
    const total = Number(outcome?.roll?.total);
    const fix = (ROLL_FIXES[name] ?? []).find(x => total >= x.min && total <= x.max);
    if (fix) {
      warnings.push(`Used printed-GMG correction for ${name} (roll ${total}).`);
      return {name:fix.name, needsSelection:false};
    }
    warnings.push(`No result for roll ${Number.isFinite(total) ? total : '?'} on ${name}.`);
    return {name:`Unresolved ${name} result (GM selection)`, needsSelection:true};
  }
}

function addItem(state, section, name, {rarity=null, approximateGp=0, needsSelection=false, source=null} = {}) {
  state.rewards.push({section,name,rarity,approximateGp,needsSelection,source});
  if (needsSelection) state.manual++;
}
async function processReward(entry, state, source) {
  if (entry.kind === 'alternative') {
    const chosen = state.choices === 'first' ? 0 : state.choices === 'second' ? 1 : (await randomInt(2))-1;
    state.alternatives.push(`${state.alternatives.length+1}: option ${chosen+1}`);
    for (const e of entry.options[chosen]) await processReward(e,state,source);
