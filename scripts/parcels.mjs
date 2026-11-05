/**
 * Budgeted treasure distribution. This is a house-rule distribution layer, NOT
 * an additional source of GMG treasure.  A single official bundle is rolled
 * once and allocated across 20 encounter-sized shares (or five adventures).
 * All operations are pure except the injected RNG used when planning a pool.
 */
export const ENCOUNTER_SHARES = 20;
export const ADVENTURE_SHARES = 4;
export const POOL_SCHEMA = 1;

const CURRENCIES = ['cp', 'sp', 'gp', 'pp'];
const RARITY_RANK = {'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Very Rare': 3, 'Legendary': 4};

function safeRandom(random) {
  const n = Number(random());
  if (!Number.isFinite(n)) throw new Error('Invalid random number during parcel planning.');
  return Math.min(0.999999999999, Math.max(0, n));
}
function randomIndex(n, random) { return Math.floor(safeRandom(random) * n); }
function blankParcel() { return {rewards:[],coins:{cp:0,sp:0,gp:0,pp:0}}; }

/** Whole-unit proportional split; remainder allocated by descending fractions. */
export function divideCurrency(total, n, random=Math.random) {
  if (!Number.isSafeInteger(total) || total < 0 || n < 1) {
    throw new Error(`Invalid currency split: ${total} among ${n} parcels`);
  }
  const weights = Array.from({length:n},()=>0.75+safeRandom(random)*0.5);
  const sum = weights.reduce((a,b)=>a+b,0);
  const raw = weights.map(w=>total*w/sum);
  const amounts = raw.map(Math.floor);
  let leftover = total - amounts.reduce((a,b)=>a+b,0);
  const positions = raw.map((value,i)=>({i, fraction:value-Math.floor(value), tie:safeRandom(random)}))
    .sort((a,b)=>b.fraction-a.fraction || b.tie-a.tie);
  for (let i=0;i<leftover;i++) amounts[positions[i].i]++;
  return amounts;
}

function itemWeight(reward) {
  const rank = RARITY_RANK[reward.rarity] ?? 0;
  // In a multi-level span, reserve the rarest permanent rewards for later.
  const powerful = reward.section === 'Magic Items' && rank >= 2;
  return {rank, powerful};
}

/** Create a durable pool that preserves exactly the originally rolled budget. */
export function planPool(bundle, params, random=Math.random) {
  const count=ENCOUNTER_SHARES;
  const parcels=Array.from({length:count},blankParcel);
  for (const coin of CURRENCIES) {
    const portions=divideCurrency(Number(bundle.coins[coin]??0),count,random);
    portions.forEach((qty,i)=>{parcels[i].coins[coin]=qty;});
  }
  // Spread the most valuable items first, avoiding front-loaded huge parcels.
  const ordered = [...bundle.rewards].sort((a,b)=>{
    const x=itemWeight(a), y=itemWeight(b);
    return Number(y.powerful)-Number(x.powerful) || y.rank-x.rank;
  });
  for (const reward of ordered) {
    const {powerful,rank}=itemWeight(reward);
    // Rare and better permanent items trend toward the latter part of the span.
    const first = powerful ? (rank>=4 ? 13 : rank>=3 ? 10 : 7) : 0;
    const indices = Array.from({length:count-first},(_,i)=>first+i);
    const minimum=Math.min(...indices.map(i=>parcels[i].rewards.length));
    const choices=indices.filter(i=>parcels[i].rewards.length===minimum);
    parcels[choices[randomIndex(choices.length,random)]].rewards.push({...reward});
  }
  return {
    schema:POOL_SCHEMA, range:params.range, party:params.party,
    choices:params.choices, createdAt:new Date().toISOString(),
    cursor:0, totalShares:count, parcels,
    original: JSON.parse(JSON.stringify(bundle))
  };
}

export function isPool(value) {
  return Boolean(value && value.schema===POOL_SCHEMA &&
    Array.isArray(value.parcels) && value.parcels.length===ENCOUNTER_SHARES &&
    Number.isSafeInteger(value.cursor) && value.cursor>=0 &&
    value.cursor<=ENCOUNTER_SHARES && value.original &&
    typeof value.range==='string' && Number.isSafeInteger(value.party));
}
export function progress(pool) {
  return {used:pool.cursor,remaining:pool.totalShares-pool.cursor,total:pool.totalShares};
}
export function remainingBudget(pool) {
  if (!isPool(pool)) throw new Error('No valid treasure pool exists.');
  const remaining=pool.parcels.slice(pool.cursor);
  return summarizeParcels(remaining);
}
export function summarizeParcels(parcels) {
  const out=blankParcel();
  for(const parcel of parcels) {
    out.rewards.push(...parcel.rewards);
    for(const c of CURRENCIES) out.coins[c]+=Number(parcel.coins[c]??0);
  }
  return out;
}
/** Consume encounter=1 or adventure=4 shares, without replacement. */
export function claimShares(pool, mode) {
  if(!isPool(pool)) throw new Error('No valid treasure pool exists.');
  if(!['encounter','adventure'].includes(mode)) throw new Error(`Unknown treasure mode: ${mode}`);
  const requested=mode==='adventure'?ADVENTURE_SHARES:1;
  const taken=Math.min(requested,pool.totalShares-pool.cursor);
  if(taken===0) throw new Error('Treasure budget exhausted. Start a new level-range budget to continue.');
  const parcelGroup=pool.parcels.slice(pool.cursor,pool.cursor+taken);
  const allocation=summarizeParcels(parcelGroup);
  return {
    allocation,
    next:{...pool,cursor:pool.cursor+taken},
    sharesTaken:taken,
    requested
  };
}
