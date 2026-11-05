import assert from 'node:assert/strict';
import {BUNDLES} from '../scripts/bundles.mjs';
import {ENCOUNTER_SHARES,ADVENTURE_SHARES,divideCurrency,planPool,isPool,claimShares,progress,remainingBudget,summarizeParcels} from '../scripts/parcels.mjs';
let tests=0;
for(const range of Object.keys(BUNDLES)){
  for(const party of [3,4,5,6,8,12]){
    for(let trial=0;trial<20;trial++){
      const rewards=Array.from({length:5+trial*2},(_,i)=>({
        section:i%3===0?'Magic Items':'Gemstones',
        name:'Reward '+i,rarity:i%3===0?(i%4===0?'Legendary':'Rare'):'Common',
        approximateGp:i*5,needsSelection:false
      }));
      const coins={cp:trial*125,sp:trial*2000,gp:trial*509,pp:trial*40};
      const original={rewards,coins,manual:0,warnings:[],alternatives:[],adjustments:[]};
      const pool=planPool(original,{range,party,choices:'random'});
      assert.ok(isPool(pool));
      assert.deepEqual(remainingBudget(pool).coins,coins);
      assert.deepEqual(remainingBudget(pool).rewards.map(r=>r.name).sort(),rewards.map(r=>r.name).sort());
      let current=pool;const payouts=[];
      for(let n=0;n<8;n++){
        const claim=claimShares(current,n%2===0?'adventure':'encounter');
        payouts.push(claim.allocation);current=claim.next;
      }
      while(progress(current).remaining){
        const claim=claimShares(current,'encounter');
        payouts.push(claim.allocation);current=claim.next;
      }
      const total=summarizeParcels(payouts);
      assert.deepEqual(total.coins,coins);
      assert.deepEqual(total.rewards.map(r=>r.name).sort(),rewards.map(r=>r.name).sort());
      assert.equal(current.cursor,20);
      assert.throws(()=>claimShares(current,'encounter'),/exhausted/);
      assert.equal(pool.cursor,0);
      assert.deepEqual(pool.original,original);
      tests++;
    }
  }
}
assert.equal(ENCOUNTER_SHARES,20);
assert.equal(ADVENTURE_SHARES,4);
assert.deepEqual(divideCurrency(0,20),Array(20).fill(0));
assert.equal(divideCurrency(100001,20).reduce((a,b)=>a+b,0),100001);
assert.throws(()=>divideCurrency(-1,20),/Invalid/);
console.log('Passed '+tests+' budget-preservation scenarios.');
