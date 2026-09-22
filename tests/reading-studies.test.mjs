import test from 'node:test';
import assert from 'node:assert/strict';
import { READING_STUDIES } from '../lib/reading-studies.mjs';
import { groupRhythmValues, RHYTHM_VALUES } from '../lib/rhythm-presets.mjs';

test('focused studies have bilingual guidance and complete note data',()=>{
  assert.equal(new Set(READING_STUDIES.map(s=>s.id)).size,3);
  for(const s of READING_STUDIES){
    for(const lang of ['tr','en']){assert.ok(s.title[lang]);assert.ok(s.tip[lang].length>40);}
    assert.equal(s.positions.length,s.rhythms.length);
    assert.ok(s.positions.every(p=>Number.isInteger(p)&&p>=-2&&p<=10));
    assert.ok(s.rhythms.every(id=>RHYTHM_VALUES.some(r=>r.id===id)));
  }
});
test('short rhythm groups are complete and contain different pitches',()=>{
  for(const s of READING_STUDIES){
    const grouped=groupRhythmValues(s.rhythms,s.id);
    for(const id of ['eighth','sixteenth']){
      const groups=new Map();grouped.forEach((r,i)=>{if(r.id===id){assert.ok(r.groupId);const indexes=groups.get(r.groupId)||[];indexes.push(i);groups.set(r.groupId,indexes);}});
      for(const indexes of groups.values()){assert.equal(indexes.length,id==='eighth'?2:4);assert.ok(new Set(indexes.map(i=>s.positions[i])).size>1);}
    }
  }
});
test('step study uses neighbours and ledger study reaches both first ledger lines',()=>{
  const steps=READING_STUDIES.find(s=>s.id==='steps');assert.ok(steps.positions.slice(1).every((p,i)=>Math.abs(p-steps.positions[i])===1));
  const ledger=READING_STUDIES.find(s=>s.id==='ledger');assert.ok(ledger.positions.includes(-2));assert.ok(ledger.positions.includes(10));
});
