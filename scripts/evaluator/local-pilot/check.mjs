import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repo, casesFile, model, destination] = process.argv.slice(2);
const load = name => import(pathToFileURL(path.resolve(repo,'lib/ai',name)));
const {buildCandidateMessages, candidateSchema, validateAnalysis} = await load('candidate-prompt.js');
const {parseAIJson} = await load('parse-json.js');
const cases = JSON.parse(fs.readFileSync(casesFile,'utf8'));
const evidence = [];
for (const {id, reference, body} of cases) {
  const record = {id, reference, body, model, raw:null, strictObject:false, appAccepted:false};
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',
      headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),
      body:JSON.stringify({model,messages:buildCandidateMessages(body),format:candidateSchema,stream:false,
        options:{temperature:0,seed:42,num_ctx:4096,num_predict:1024}})});
    const reply = await response.json();
    if (!response.ok) throw Error(reply.error || 'Ollama request failed');
    record.raw = reply.message.content;
    record.ollamaModel = reply.model;
    record.stop = reply.done_reason;
    record.tokens = reply.eval_count;
    record.seconds = reply.total_duration / 1e9;
    try { const v = JSON.parse(record.raw); record.strictObject = v !== null && typeof v === 'object' && !Array.isArray(v); }
    catch { /* Keep strictObject false for malformed JSON. */ }
    const result = parseAIJson(record.raw);
    record.appAccepted = validateAnalysis(result,candidateSchema,'candidate');
    record.verdict = result.fit_verdict;
    record.score = result.fit_score;
  } catch (e) { record.error = e.message; }
  evidence.push(record);
  console.log(id,record.appAccepted,record.verdict,record.score,record.error || '');
}
fs.writeFileSync(destination,JSON.stringify(evidence,null,2) + '\n',{flag:'wx'});
