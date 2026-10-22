"use strict";
// Explicit, repeatable content upgrade. Never recreates assignments or deletes answers.
const fs=require('node:fs');
const path=require('node:path');
const {loadEnv}=require('../lib/env');
const db=require('../lib/db');
const fmt=require('../lib/exercise-format');
async function main(){
  loadEnv();if(!db.init())throw Error('Database not configured; no assignments were changed.');
  const source=fs.readFileSync(path.join(__dirname,'../content/homework/intensive-a1-b1/09-negation.txt'),'utf8');
  const parsed=fmt.parse(source);if(!parsed.learning)throw Error('Invalid chapter');
  const rows=await db.query('SELECT id, title FROM exercises WHERE title = ?',[parsed.title]);
  console.log(`${rows.length} existing assignments match ${parsed.title}. Historical answers and access lists are preserved.`);
  if(!process.argv.includes('--apply')){console.log('Dry run. Use --apply after schema migration 36.');return;}
  await db.transaction(async tx=>{for(const row of rows)await tx.query('UPDATE exercises SET source = ?, learning_config = ? WHERE id = ?',[source,JSON.stringify(parsed.learning),row.id]);});
  console.log(`${rows.length} assignments upgraded. Existing attempts gain learning progress on their next use.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());
