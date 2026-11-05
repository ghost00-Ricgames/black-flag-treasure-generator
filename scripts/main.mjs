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

    return;
  }
  if (entry.kind === 'coin') {
    const qty = Number((await new Roll(entry.formula).evaluate()).total);
    state.coins[entry.currency] = (state.coins[entry.currency] || 0) + qty;
    return;
  }
  let count = await rollQuantity(entry.count, state.party);
  if (entry.kind === 'magic' && Number.isInteger(entry.count) && state.extraPCs && !state.fixedMagicAdjusted) {
    count += state.extraPCs;
    state.fixedMagicAdjusted = true;
    state.adjustments.push('Added permanent items for PCs above four.');
  }
  if (entry.kind === 'consumable' && typeof entry.count === 'string' && state.extraPCs && !state.consumableAdjusted) {
    for (let i=0;i<state.extraPCs;i++) count += await rollQuantity(entry.count,state.party);
    state.consumableAdjusted = true;
    state.adjustments.push('Additional consumable rolls for PCs above four.');
  }
  if (!Number.isSafeInteger(count) || count < 0 || count > 150) throw new Error('Unexpected treasure quantity: '+count);
  for (let i=0; i<count; i++) {
    const rarity = entry.rarity ? await chooseRarity(entry.rarity) : null;
    if (['magic','consumable','gem','art'].includes(entry.kind)) {
      if (entry.type === 'plusOneWeapon') {
        addItem(state,'Magic Items','+1 weapon (choose base weapon)',{rarity,needsSelection:true});
        continue;
      }
      const table = TABLE_PREFIX[entry.kind]+', '+rarity;
      const rolled = await source.draw(table,entry.kind === 'magic' ? entry.type : 'item',state.warnings);
      addItem(state,CATEGORY_NAMES[entry.kind],rolled.name,{
        rarity,needsSelection:rolled.needsSelection,source:table,
        approximateGp:(RARITY_VALUE[entry.kind] || {})[rarity] || 0
      });
    } else if (entry.kind === 'scroll') {
      const ordinal = {1:'1st',2:'2nd',3:'3rd'}[entry.circle] || entry.circle+'th';
      addItem(state,'Spell Scrolls',ordinal+'-circle spell scroll (choose spell)',{needsSelection:true});
    } else if (entry.kind === 'potion') {
      addItem(state,'Potions','Potion of '+entry.grade);
    } else if (entry.kind === 'ammunition') {
      addItem(state,'Magic Ammunition',rarity+' magical ammunition (choose ammunition)',{rarity,needsSelection:true});
    }
  }
}
async function generate(params) {
  const pack = game.packs.get(TABLE_PACK);
  if (!pack) throw new Error('Official GMG Tables compendium not accessible. Enable the GMG module in this v14 world.');
  if (!BUNDLES[params.range]) throw new Error('Invalid level range.');
  const source = new TreasureSource(pack);
  await source.initialize();
  const state = {
    range:params.range,party:params.party,choices:params.choices,
    rewards:[],coins:{cp:0,sp:0,gp:0,pp:0},warnings:[],alternatives:[],
    adjustments:[],manual:0,extraPCs:Math.max(0,params.party-4),
    fixedMagicAdjusted:false,consumableAdjusted:false
  };
  for (const entry of BUNDLES[params.range]) await processReward(entry,state,source);
  state.estimatedGold = Object.entries(state.coins).reduce((a,p)=>a+p[1]*CURRENCY_IN_GP[p[0]],0)
    +state.rewards.reduce((a,r)=>a+r.approximateGp,0);
  return state;
}
function estimateGold(state) {
  return Object.entries(state.coins).reduce((a,p)=>a+Number(p[1])*(CURRENCY_IN_GP[p[0]]||0),0)
    +state.rewards.reduce((a,r)=>a+(Number(r.approximateGp)||0),0);
}
function makeView(allocation,pool,mode,sharesTaken=0) {
  return {
    ...allocation, range:pool.range,party:pool.party,
    warnings:mode==='bundle' ? (allocation.warnings || []) : [],
    alternatives:mode==='bundle' ? (allocation.alternatives || []) : [],
    adjustments:mode==='bundle' ? (allocation.adjustments || []) : [],
    manual:allocation.rewards.filter(r=>r.needsSelection).length,
    estimatedGold:estimateGold(allocation),mode,sharesTaken,poolProgress:progress(pool)
  };
}
const TITLES={encounter:'Encounter Treasure',adventure:'Adventure Treasure',bundle:'Full Treasure Bundle (Preview)'};
function renderResults(state) {
  const rows=[];
  for (const section of SECTION_ORDER) {
    const items=state.rewards.filter(r=>r.section===section);
    if(!items.length) continue;
    const map=new Map();
    for(const item of items) {
      const key=item.name+'|'+(item.rarity||'')+'|'+item.needsSelection;
      if(!map.has(key)) map.set(key,{...item,qty:0});
      map.get(key).qty++;
    }
    const lines=[...map.values()].map(r=>
      '<li><strong>'+r.qty+'×</strong> '+escapeHTML(r.name)
      +(r.rarity?' <small>('+escapeHTML(r.rarity)+')</small>':'')
      +(r.needsSelection?' <small class="bf-treasure-pending">GM selection needed</small>':'')+'</li>').join('');
    rows.push('<section class="bf-treasure-section"><h3>'+escapeHTML(section)+' ('+items.length+')</h3><ul>'+lines+'</ul></section>');
  }
  const coinLine=['cp','sp','gp','pp'].filter(c=>Number(state.coins[c])>0)
    .map(c=>'<strong>'+Number(state.coins[c]).toLocaleString()+'</strong> '+c.toUpperCase()).join(' | ');
  const title=TITLES[state.mode] || TITLES.bundle;
  const remaining=state.poolProgress.remaining;
  const note=state.mode==='bundle' ?
    'Preview only. No treasure removed. '+remaining+'/'+ENCOUNTER_SHARES+' shares remain.' :
    state.sharesTaken+'/'+ENCOUNTER_SHARES+' shares awarded this time; '+remaining+' remain.';
  const warnings=(state.warnings||[]).map(w=>'<li>'+escapeHTML(w)+'</li>').join('');
  return '<div class="bf-treasure-result"><h2>'+escapeHTML(title)+'</h2>'
    +'<p>Levels '+escapeHTML(state.range.replace('-','–'))+' • '+state.party+' PCs</p>'
    +'<p class="bf-treasure-budget">'+escapeHTML(note)+'</p>'
    +'<p>'+state.rewards.length+' reward entries; '+state.manual+' need GM selection.</p>'
    +'<p>'+ (coinLine||'No coins in this allocation') +'</p>'
    +'<p><small>Estimated coin/gem/art value: '+Math.round(state.estimatedGold).toLocaleString()
    +' gp. Excludes magic item resale value.</small></p>'
    +rows.join('')
    +(warnings?'<details><summary>Source warnings</summary><ul>'+warnings+'</ul></details>':'')
    +'<p><small>Rewards come from the installed official GMG tables. Encounter and Adventure are house-rule allocations of one full level-span budget.</small></p></div>';
}
function getStoreDocument() {
  return game.journal?.contents?.find(j=>j.getFlag(MODULE_ID,STORE_FLAG)===true) || null;
}
function getCurrentPool() {
  const pool=getStoreDocument()?.getFlag(MODULE_ID,'pool');
  return isPool(pool)?pool:null;
}
async function savePool(pool) {
  const journal=getStoreDocument();
  if(journal) return journal.setFlag(MODULE_ID,'pool',pool);
  return JournalEntry.create({
    name:'Black Flag Treasure Budget (GM Only)', ownership:{default:0},
    flags:{[MODULE_ID]:{[STORE_FLAG]:true,pool}},
    pages:[{name:'Budget Information',type:'text',text:{format:1,content:
      '<p>Private treasure budget for Black Flag Treasure Generator. Keep this Journal GM-only.</p>'}}]
  });
}
async function resetBudget() {
  const pool=getCurrentPool();
  if (!pool) return false;
  const agreed=await DialogV2.confirm({
    window:{title:'Reset Treasure Budget?'},modal:true,rejectClose:false,
    content:'<p>Discard the existing level-range budget? '+(pool.totalShares-pool.cursor)
      +' unawarded shares will be lost. Already awarded treasure is not removed.</p>',
    yes:{label:'Discard Budget'},no:{label:'Keep Budget'}
  });
  if (!agreed) return false;
  await getStoreDocument().setFlag(MODULE_ID,'pool',{});
  ui.notifications.info('Treasure budget reset.');
  return true;
}
async function openGenerator() {
  if (!game.user?.isGM) return ui.notifications.warn('Only a GM can generate treasure.');
  if (game.system?.id !== 'black-flag') return ui.notifications.error('Black Flag is required.');
  if (!game.packs.get(TABLE_PACK)) return ui.notifications.error('Official GMG Tables not accessible in this world.');
  const activeGM=game.users?.activeGM;
  if (activeGM && activeGM.id!==game.user.id) return ui.notifications.warn('The active GM controls the shared treasure budget.');
  const pool=getCurrentPool();
  const range=pool?.range || '3-5';
  const party=pool?.party || 4;
  const choices=pool?.choices || 'random';
  const remain=pool?progress(pool):null;
  const locked=pool?'disabled':'';
  const content='<form class="bf-treasure-form">'
    +'<p class="bf-treasure-budget">'+(remain?'Active budget: '+remain.remaining+'/'+remain.total+' encounter shares remaining.'
      :'New budget: one complete GMG bundle will be rolled and stored in a private GM Journal.')+'</p>'
    +'<label>Reward mode<select name="mode">'
    +'<option value="encounter" selected>Encounter — 1/20 of bundle</option>'
    +'<option value="adventure">Adventure — 4/20 of bundle</option>'
    +'<option value="bundle">Full Bundle — preview only</option></select></label>'
    +'<label>GMG level span<select name="range" '+locked+'>'
    +Object.keys(BUNDLES).map(r=>'<option value="'+r+'" '+(r===range?'selected':'')+'>Levels '+r.replace('-','–')+'</option>').join('')+'</select></label>'
    +'<label>Party size <input name="party" type="number" min="1" max="12" step="1" value="'+party+'" required '+locked+'></label>'
    +'<label>Alternative choices<select name="choices" '+locked+'>'
    +['random','first','second'].map(c=>'<option value="'+c+'" '+(c===choices?'selected':'')+'>'+c+'</option>').join('')+'</select></label>'
    +'<label class="bf-treasure-check"><input type="checkbox" name="save"> Save private GM Journal</label>'
    +'<label class="bf-treasure-check"><input type="checkbox" name="chat" checked> Post to GM-only chat</label>'
    +'<p class="notes">Full Bundle previews the current level-span budget without spending it. '
    +'Encounter and Adventure spend 1 or 4 of the 20 shares. Reset Budget to start a different span.</p></form>';
  const buttons=[{action:'generate',label:'Generate Treasure',icon:'fa-solid fa-gem',default:true,
    callback:(_event,_button,dialog)=>{
      const root=dialog.element;
      const mode=root.querySelector('[name="mode"]')?.value;
      const params={
        mode,range:pool?.range || root.querySelector('[name="range"]')?.value,
        party:pool?.party || Number(root.querySelector('[name="party"]')?.value),
        choices:pool?.choices || root.querySelector('[name="choices"]')?.value,
        save:Boolean(root.querySelector('[name="save"]')?.checked),
        chat:Boolean(root.querySelector('[name="chat"]')?.checked)
      };
      if (!BUNDLES[params.range] || !Number.isSafeInteger(params.party) || params.party<1
        || params.party>12 || !['random','first','second'].includes(params.choices)
        || !['encounter','adventure','bundle'].includes(params.mode)) {
        ui.notifications.error('Invalid treasure parameters.');
        return null;
      }
      return params;
    }}];
  if(pool) buttons.push({action:'reset',label:'Reset Budget',callback:()=>({reset:true})});
  buttons.push({action:'cancel',label:'Cancel'});
  const params=await DialogV2.wait({
    window:{title:'Black Flag Treasure Generator'},content,rejectClose:false,buttons
  });
  if(params?.reset) {
    try {if(await resetBudget()) return void openGenerator();}
    catch(error){console.error(MODULE_ID,error);ui.notifications.error(error.message);}
    return;
  }
  if (!params?.range) return;
  if (busy) return ui.notifications.warn('Generation already in progress.');
  busy=true;
  try {
    let current=getCurrentPool();
    if(current && (current.range!==params.range || current.party!==params.party || current.choices!==params.choices)) {
      throw new Error('Another budget is active. Use Reset Budget first.');
    }
    if(!current) {
      const rolled=await generate(params);
      current=planPool(rolled,params);
    }
    let view;
    if (params.mode==='bundle') {
      if(!getCurrentPool()) await savePool(current);
      view=makeView(current.original,current,'bundle');
    } else {
      const {allocation,next,sharesTaken}=claimShares(current,params.mode);
      await savePool(next);
      view=makeView(allocation,next,params.mode,sharesTaken);
    }
    const html=renderResults(view);
    if(params.save) {
      try {await JournalEntry.create({
        name:TITLES[params.mode]+' '+params.range,
        ownership:{default:0},
        pages:[{name:'Treasure',type:'text',text:{format:1,content:html}}]
      });} catch(error){console.error(MODULE_ID,error);ui.notifications.warn('Journal save failed.');}
    }
    if(params.chat) {
      try {await ChatMessage.create({
        user:game.user.id,speaker:{alias:'Black Flag Treasure Generator'},
        whisper:[game.user.id],content:html
      });} catch(error){console.error(MODULE_ID,error);ui.notifications.warn('Private chat failed.');}
    }
    await DialogV2.wait({
      window:{title:TITLES[params.mode],resizable:true},content:html,
      rejectClose:false,buttons:[{action:'close',label:'Close',default:true}]
    });
  } catch(error) {
    console.error(MODULE_ID+' | Treasure generation failed',error);
    ui.notifications.error('Treasure generation failed: '+error.message);
  } finally {busy=false;}
}
Hooks.on('getSceneControlButtons',controls=>{
  if (!game.user?.isGM || !controls.tokens?.tools) return;
  controls.tokens.tools['bf-treasure-generator']={
    name:'bf-treasure-generator',title:'Treasure Generator',icon:'fa-solid fa-gem',
    order:Object.keys(controls.tokens.tools).length,visible:true,button:true,
    onChange:()=>void openGenerator()
  };
});
Hooks.once('ready',()=>{
  const module=game.modules?.get(MODULE_ID);
  if (module) module.api={open:openGenerator,generateFullBundle:generate,getPool:getCurrentPool};
});
export {generate,renderResults,openGenerator,getCurrentPool};
