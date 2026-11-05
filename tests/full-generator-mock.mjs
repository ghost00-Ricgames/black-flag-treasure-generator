import assert from 'node:assert/strict';
import {BUNDLES} from '../scripts/bundles.mjs';
import {planPool,claimShares,progress} from '../scripts/parcels.mjs';

globalThis.foundry={applications:{api:{DialogV2:{wait:async()=>null,confirm:async()=>false}}}};
globalThis.Hooks={on(){},once(){}};
globalThis.document={createElement:()=>({
  innerHTML:'',get textContent(){return this.innerHTML.replace(/<[^>]*>/g,'');}
})};
function numericDice(formula){
  const rolled=String(formula).replace(/(\d+)d(\d+)/gi,(_match,n,s)=>
    Array.from({length:Number(n)},()=>1+Math.floor(Math.random()*Number(s)))
      .reduce((a,b)=>a+b,0));
  if(!/^[0-9+*\-() /]+$/.test(rolled)) throw new Error('Invalid test formula');
  return Function('return ('+rolled+')')();
}
globalThis.Roll=class {
  constructor(formula){this.formula=formula;this.total=null;}
  async evaluate(){this.total=numericDice(this.formula);return this;}
};
const names=['Common armor','Rare weapon','Uncommon shield','Very Rare wand',
  'Rare magic armor','Uncommon magic sword','Legendary shield','Common magic wand'];
const tables=new Map();
for(const prefix of ['Magic Items','Consumable Magic Items','Gemstones','Art Objects']){
  for(const rarity of ['Common','Uncommon','Rare','Very Rare','Legendary']){
    const name=prefix+', '+rarity;
    tables.set(name,{
      results:names.map((t,i)=>({text:t,weight:i+1})),
      async roll(){return {results:[{text:prefix+' '+rarity+' mock result'}],roll:{total:10}};}
    });
  }
}
const index=Array.from(tables.keys(),(name,i)=>({name,_id:String(i)}));
const byId=new Map(index.map(v=>[v._id,tables.get(v.name)]));
const pack={async getIndex(){return index;},async getDocument(id){return byId.get(id);}};
globalThis.game={packs:new Map([['kp-tov-game-masters-guide.kp-tov-gmg-tables',pack]])};
const {generate,renderResults,openGenerator,getCurrentPool}=await import('../scripts/main.mjs');

let cases=0;
for(const range of Object.keys(BUNDLES)){
  for(const party of [1,3,4,5,6,8,12]){
    const params={range,party,choices:'random'};
    const full=await generate(params);
    assert.ok(full.rewards.length>0);
    assert.ok(full.coins.cp>=0 && full.coins.gp>=0);
    const pool=planPool(full,params);
    let active=pool;
    for(let i=0;i<20;i++) active=claimShares(active,'encounter').next;
    assert.equal(progress(active).remaining,0);
    const html=renderResults({...full,mode:'bundle',sharesTaken:0,poolProgress:progress(active)});
    assert.ok(html.includes('Full Treasure Bundle'));
    cases++;
  }
}
console.log('Passed '+cases+' mocked full-bundle generations.');

const stored=[];const posted=[];
game.system={id:'black-flag'};
game.user={id:'gm',isGM:true};
game.users={activeGM:{id:'gm'}};
game.journal={contents:stored};
globalThis.ui={notifications:{info(){},warn(s){throw new Error(s);},error(s){throw new Error(s);}}};
globalThis.JournalEntry={async create(data){
  const doc={...data,
    getFlag(namespace,key){return this.flags?.[namespace]?.[key];},
    async setFlag(namespace,key,value){
      this.flags ||= {};
      this.flags[namespace] ||= {};
      this.flags[namespace][key]=value;return this;
    }
  };
  stored.push(doc);return doc;
}};
globalThis.ChatMessage={async create(data){posted.push(data);return data;}};
let selected='encounter';
foundry.applications.api.DialogV2.wait=async(config)=>{
  if(config.window.title==='Black Flag Treasure Generator'){
    return {mode:selected,range:'3-5',party:6,choices:'random',save:false,chat:true};
  }
  return 'close';
};
assert.equal(getCurrentPool(),null);
await openGenerator();
assert.equal(getCurrentPool().cursor,1);
assert.equal(stored.length,1);
assert.equal(stored[0].ownership.default,0);
assert.equal(stored[0].flags['black-flag-treasure-generator'].treasureBudgetStore,true);
selected='adventure';
await openGenerator();
assert.equal(getCurrentPool().cursor,5);
selected='bundle';
await openGenerator();
assert.equal(getCurrentPool().cursor,5);
assert.equal(posted.length,3);
selected='adventure';
for(let i=0;i<4;i++) await openGenerator();
assert.equal(getCurrentPool().cursor,20);
console.log('Passed mocked v14 dialog, private Journal, and shared budget workflow.');
