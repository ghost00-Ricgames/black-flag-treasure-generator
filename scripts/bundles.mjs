/**
 * Numerical treasure-bundle recipes from Tales of the Valiant GMG.
 * No Kobold Press RollTable entries, text, or proprietary Item documents are bundled.
 * Runtime results come from the user's installed official GMG compendiums.
 */
const magic = (rarity, count, type = 'item') => ({kind:'magic', rarity, count, type});
const consumable = (rarity, count) => ({kind:'consumable', rarity, count});
const gem = (rarity, count) => ({kind:'gem', rarity, count});
const art = (rarity, count) => ({kind:'art', rarity, count});
const scroll = (circle, count) => ({kind:'scroll', circle, count});
const potion = (grade, count) => ({kind:'potion', grade, count});
const ammunition = (rarity, count) => ({kind:'ammunition', rarity, count});
const coin = (currency, formula) => ({kind:'coin', currency, formula});
const alternative = (a, b) => ({kind:'alternative', options:[a,b]});

export const BUNDLES = Object.freeze({
  '1-3': [
    magic('Common',3), magic('Common',2,'armor'), magic('Common',2,'weapon'),
    alternative([scroll(1,'1d4')],[consumable('Uncommon','1d4')]),
    alternative([ammunition(['Common','Uncommon'],'1d6+1')],[scroll(2,1)]),
    potion('Healing','party+1d4'),
    coin('cp','2d10*50'),coin('sp','2d10*25'),coin('gp','1d10*10'),
    gem('Common','1d4'),art('Common','1d4'),art('Uncommon',1)
  ],
  '3-5': [
    magic('Common',4),magic('Common',2,'armor'),magic('Uncommon',1,'armor'),
    magic('Common',1,'weapon'),magic('Uncommon',1,'wand'),
    alternative([consumable('Uncommon','1d6')],[scroll(1,'1d4+1'),potion('Resistance',1)]),
    alternative([ammunition(['Common','Uncommon'],'2d4+1'),scroll(2,1)],[consumable('Rare',1)]),
    potion('Healing','1d4+1'),consumable('Rare',1),
    coin('cp','2d10*100'),coin('sp','2d10*50'),coin('gp','1d10*25'),
    gem('Common','2d4'),art('Common','1d4+1'),
    alternative([art('Uncommon',1)],[gem('Uncommon',1)])
  ],
  '5-7': [
    magic(['Common','Uncommon'],5), magic('Uncommon',2,'armor'), magic('Rare',1,'armor'),
    alternative([magic('Uncommon',2,'plusOneWeapon'),magic('Rare',1,'wand')],[magic('Uncommon',2,'weapon'),magic('Rare',1)]),
    consumable('Uncommon','1d6+1'),consumable('Rare','1d4+1'),
    alternative([scroll(1,4),scroll(2,2),scroll(3,1)],[consumable('Uncommon',5),consumable('Rare',2)]),
    potion('Healing','1d6+1'),potion('Greater Healing','1d4'),
    coin('cp','2d10*50'),coin('sp','2d10*500'),coin('gp','2d10*100'),coin('pp','1d10*10'),
    gem('Uncommon','2d6'),gem('Rare',2),art('Uncommon','1d6+1'),art('Rare',1)
  ],
  '7-10': [
    magic('Uncommon',4),magic('Rare',2),magic('Rare',3,'armor'),
    magic('Rare',3,'weapon'),magic('Rare',1,'shield'),
    consumable('Uncommon','2d4'),consumable('Rare','1d6+1'),consumable('Very Rare','1d4'),
    alternative([scroll(3,4),scroll(4,2),scroll(5,1)],[consumable('Rare',6),consumable('Very Rare',1)]),
    potion('Healing','2d4'),potion('Greater Healing','1d6+1'),potion('Superior Healing',1),
    coin('cp','5d10*50'),coin('sp','3d10*500'),coin('gp','3d10*100'),coin('pp','2d10*10'),
    gem('Rare','3d6'),art('Rare','3d4')
  ],
  '10-13': [
    magic('Rare',6),magic('Rare',2,'armor'),magic('Rare',2,'shield'),
    magic('Very Rare',2,'armor'), magic('Very Rare',2,'weapon'), magic('Very Rare',1,'shield'),
    consumable('Uncommon','1d6'),consumable('Rare','2d6'),consumable('Very Rare','1d6+1'),
    alternative([scroll(5,4),scroll(6,2),scroll(7,1)],[consumable('Very Rare',8)]),
    potion('Superior Healing','2d6+1'),potion('Supreme Healing',1),
    coin('gp','3d10*500'),coin('pp','2d8*100'),gem('Rare','2d6'),gem('Very Rare','1d6'),
    art('Rare','2d6'),art('Very Rare','1d6')
  ],
  '13-16': [
    magic('Very Rare',6), magic('Very Rare',2,'armor'),magic('Very Rare',2,'weapon'),magic('Very Rare',2,'shield'),
    magic('Legendary',3),consumable('Rare','3d6'),consumable('Very Rare','2d6'),consumable('Legendary',2),
    alternative([scroll(5,4),scroll(6,2),scroll(7,1)],[consumable('Very Rare',8)]),
    potion('Superior Healing','3d6'),potion('Supreme Healing','1d4'),
    coin('gp','3d10*500'),coin('pp','2d10*100'),gem('Very Rare','2d6'),gem('Legendary','1d4'),
    art('Very Rare','2d6'),art('Legendary',1)
  ],
  '16-20': [
    magic('Very Rare',6),magic(['Very Rare','Legendary'],4,'armor'),
    magic(['Very Rare','Legendary'],2,'shield'),magic('Legendary',4,'weapon'),
    magic('Legendary',2,'wandOrShield'),
    consumable('Rare','3d6'),consumable('Very Rare','3d6'),consumable('Legendary','2d6'),
    alternative([scroll(6,4),scroll(7,2),scroll(8,1)],[consumable('Legendary',8)]),
    potion('Superior Healing','2d6'),potion('Supreme Healing','2d6'),
    coin('gp','10d10*1000'),coin('pp','3d10*1000'),
    gem('Very Rare','2d6'),gem('Legendary','2d6'),art('Very Rare','2d6'),art('Legendary','2d6')
  ]
});

export const RARITY_VALUE = Object.freeze({
  gem:{'Common':10,'Uncommon':100,'Rare':500,'Very Rare':1000,'Legendary':5000},
  art:{'Common':50,'Uncommon':500,'Rare':2500,'Very Rare':5000,'Legendary':10000}
});

export const CURRENCY_IN_GP = Object.freeze({cp:0.01,sp:0.1,gp:1,pp:10});
