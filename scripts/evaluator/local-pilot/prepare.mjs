import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repo, destination] = process.argv.slice(2);
const {buildCandidateMessages, candidateSchema, validateAnalysis} = await import(
  pathToFileURL(path.resolve(repo, 'lib/ai/candidate-prompt.js')));

// Each entry pairs a requirement with a fictional, concrete work sample.
const roles = [
  ['Reporting analyst', ['SQL', 'Tableau'], ['Reconciled sales records using SQL.', 'Built a Tableau dashboard for stock levels.']],
  ['Backend developer', ['Node.js', 'PostgreSQL'], ['Built a Node.js billing API.', 'Tuned PostgreSQL queries for invoice reports.']],
  ['QA engineer', ['Playwright', 'TypeScript'], ['Wrote checkout regression tests in Playwright.', 'Maintained test helpers in TypeScript.']],
  ['Data engineer', ['Airflow', 'Spark'], ['Scheduled ingestion tasks in Airflow.', 'Built Spark jobs to aggregate event logs.']],
  ['Systems engineer', ['Linux', 'Ansible'], ['Troubleshot Linux service failures.', 'Automated host configuration with Ansible.']],
  ['Frontend developer', ['React', 'CSS'], ['Built React components for order tracking.', 'Implemented responsive layouts with CSS.']],
];
const records = [];
for (const [role, skills, evidence] of roles) {
  for (const level of ['strong', 'moderate', 'weak', 'insufficient_evidence']) {
    const count = {strong: 2, moderate: 1, weak: 0, insufficient_evidence: 0}[level];
    const known = skills.slice(0, count);
    const missing = skills.slice(count);
    const cited = evidence.slice(0, count);
    const text = cited.join(' ') || (level === 'weak' ? 'Scheduled deliveries and checked packing slips for a warehouse.' : 'Resume excerpt contains only a heading.');
    const body = {role, jobDescription: 'This role requires hands-on experience with ' + skills.join(' and ') + '.', candidate: {parsedText: text}};
    const gaps = missing.map(s => s + ' is not demonstrated in the supplied excerpt.');
    const summary = cited.length ? cited.join(' ') : text;
    const next = missing.length ? 'Ask for an example of work with ' + missing[0] + '.' : 'Verify the scope of the documented work in an interview.';
    const target = {
      candidate_summary: summary, relevant_experience_summary: cited.join(' ') || 'No relevant work example is documented.',
      technical_strengths: known, relevant_projects: [], fit_verdict: level,
      fit_score: {strong: 87, moderate: 62, weak: 20, insufficient_evidence: 0}[level],
      confidence: level === 'insufficient_evidence' ? 15 : 75,
      strengths: cited, gaps, evidence_signals: cited, risk_flags: [], interview_questions: [next],
      recommendation: next, skill_gap_analysis: {demonstrated_skills: known, partially_demonstrated_skills: [],
        missing_required_skills: missing, missing_preferred_skills: [], unverified_skills: [],
        skill_gap_summary: gaps.join(' ') || 'Both stated requirements have supporting examples.'},
      recruiter_insights: {strongest_alignment: known, areas_for_verification: missing,
        suggested_interview_focus: [next], overall_assessment: cited.join(' ') || 'The supplied excerpt provides limited evidence for this role.'}
    };
    if (!validateAnalysis(target, candidateSchema, 'candidate')) throw Error('Invalid synthetic target');
    records.push({id: 'pilot-' + (records.length + 1), messages: [...buildCandidateMessages(body), {role:'assistant', content:JSON.stringify(target)}]});
  }
}
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'data/samples/evaluator/synthetic-example.json'), 'utf8'));
if (!validateAnalysis(fixture.expected_target, candidateSchema, 'candidate')) throw Error('Invalid repo fixture');
records.push(fixture.training_record);
fs.mkdirSync(destination, {recursive:true});
fs.writeFileSync(path.join(destination, 'pilot-training.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
const jd = 'Build Python APIs and deploy them to Kubernetes. Both skills are required.';
const tests = [
  ['both-documented', 'Developed Python APIs for inventory and deployed them to Kubernetes.', 'strong'],
  ['one-documented', 'Implemented a Python API to reconcile invoices. Wrote integration tests for each endpoint.', 'moderate'],
  ['thin-excerpt', 'Resume heading only.', 'insufficient_evidence'],
];
const cases = tests.map(([id, parsedText, reference]) => ({id, reference,
  body:{mode:'candidate',role:'Platform developer',jobDescription:jd,candidate:{parsedText}}}));
fs.writeFileSync(path.join(destination, 'pilot-checks.json'), JSON.stringify(cases,null,2) + '\n');
