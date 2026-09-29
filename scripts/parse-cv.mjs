// Builds src/assets/profile.json from src/assets/resume.pdf (+ optional profile.extras.json).
// Runs automatically before every start/build and in the GitHub Action.
import fs from 'fs';
const A = 'src/assets/';
const DATE = /(\d{2}\/\d{4})\s*[–-]\s*(Present|\d{2}\/\d{4})/i;
const ROLE = /^(.*?(?:Engineer|Developer|Analyst|Consultant|Manager|Architect|Lead|Intern)[^,]*),\s*([^(]+?)(?:\s*\(Client:\s*(.+)\))?$/i;
const LOC = /^(bengaluru|bangalore|bhubaneswar|karnataka|odisha|india)\b|,\s*india$/i;
const CATS = [
  ['Core & Spring', /java|spring|hibernate|multithread|microservice/i],
  ['Frontend', /angular|typescript|javascript|react|vue|html|css|rxjs/i],
  ['Message Queue', /kafka|jms|rabbit|\bmq\b|activemq/i],
  ['Databases', /mysql|oracle|postgres|mongo|redis|sql/i],
  ['DevOps & Cloud', /docker|kubernetes|jenkins|aws|azure|gcp|grafana|prometheus|terraform|ci\/cd|\bgit\b/i],
  ['Quality & Testing', /junit|mockito|jacoco|sonar|selenium|cucumber/i],
  ['AI Engineering', /\bai\b|gen ai|agentic|copilot|claude|chatgpt|bmad|llm/i],
  ['Practices', /jira|agile|scrum|method/i]
];
const KNOWN = Object.fromEntries(['JUnit','Mockito','JaCoCo','SonarQube','MySQL','Spring Boot','Spring MVC','Spring Data JPA','Spring Cache','Spring Batch','Spring Scheduler','GitHub Copilot','ChatGPT','Claude','Kafka','AWS','Docker','Kubernetes','Jenkins','Grafana','Prometheus','MultiThreading','Java 8','Java','Jira','Agile','Gen AI','Agentic AI'].map(k => [k.toLowerCase(), k]));

async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    for (const it of c.items) out += it.str + (it.hasEOL ? '\n' : ' ');
    out += '\n';
  }
  return out;
}

const tokens = s => {
  const inner = s.match(/\(([^)]+)\)/);
  const src = inner ? (s.replace(/\([^)]*\)/, '').trim().match(/tools?$/i) ? inner[1] : s.replace(/\(([^)]+)\)/, ',$1')) : s;
  return src.split(/\s+and\s+|,|\/|&/i).map(t => t.trim().replace(/^core\s+/i, '').replace(/\s+features$/i, '')).filter(Boolean);
};

export function parse(text) {
  text = text.replace(/[\u200b\u200c\u200d\u00ad\ufeff]/g, '').replace(/\s*\n\s*@/g, '@')
    .replace(/^[ \t]*[•●▪◦\uf0b7][ \t]*/gm, '•').replace(/^•[ \t]*\n+(?=\S)/gm, '•');
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sec = { head: [], profile: [], exp: [], edu: [], skills: [], awards: [] };
  let cur = 'head';
  for (const l of lines) {
    if (l.length < 30) {
      if (/^(profile|summary|about( me)?)$/i.test(l)) { cur = 'profile'; continue; }
      if (/^(professional |work )?experience$/i.test(l)) { cur = 'exp'; continue; }
      if (/^education$/i.test(l)) { cur = 'edu'; continue; }
      if (/^(technical )?skills$/i.test(l)) { cur = 'skills'; continue; }
      if (/^(awards|honors.*|achievements)$/i.test(l)) { cur = 'awards'; continue; }
    }
    sec[cur].push(l);
  }
  const all = text.replace(/\s+/g, ' ');
  const cv = { name: sec.head[0], title: sec.head[1] };
  cv.email = all.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  cv.phone = all.match(/\+?\d[\d\s-]{9,14}\d/)?.[0];
  const li = all.match(/linkedin\.com\/in\/[\w-]+/i)?.[0]; if (li) cv.linkedin = 'https://' + li;
  const gh = all.match(/github\.com\/[\w-]+/i)?.[0]; if (gh) cv.github = 'https://' + gh;
  const hl = sec.head.find(l => cv.email && l.includes(cv.email));
  const loc = hl?.replace(cv.email, '').replace(cv.phone || '', '').trim();
  if (loc) cv.location = loc.replace(/,$/, '');

  const sum = sec.profile.join(' ');
  const sents = sum.match(/[^.!?]+[.!?]+/g)?.map(x => x.trim()) || (sum ? [sum] : []);
  cv.about = []; for (let i = 0; i < sents.length; i += 2) cv.about.push(sents.slice(i, i + 2).join(' '));
  const hm = sum.match(/^(.*?)\s+(?:with|who|experienced|skilled|specializing)\b/i);
  cv.headline = hm ? hm[1].replace(/\b\w/g, c => c.toUpperCase()) : cv.title;

  cv.experience = [];
  for (const l of sec.exp) {
    const m = l.match(ROLE);
    if (m && !l.startsWith('•')) { cv.experience.push({ role: m[1].trim(), company: m[2].trim(), client: (m[3] || '').trim(), period: '', points: [] }); continue; }
    const e = cv.experience.at(-1); if (!e) continue;
    const d = l.match(DATE);
    if (d) { e.period = `${d[1]} – ${d[2]}`; continue; }
    if (/^tech stack/i.test(l)) { e.tech = true; continue; }
    if (LOC.test(l) || (e.tech && !l.startsWith('•'))) continue;
    if (l.startsWith('•')) e.points.push(l.replace(/^•\s*/, ''));
    else if (!e.points.length) e.points.push(l.replace(/^[^:]{0,70}:\s*/, ''));
    else e.points[e.points.length - 1] += ' ' + l;
  }

  const raw = []; let group = null;
  for (const l of sec.skills) {
    if (l.startsWith('•')) { raw.push(...tokens(l.replace(/^•\s*/, ''))); if (group) group.n++; }
    else { group = { name: l, n: 0 }; group.idx = raw.length; }
  }
  // categories without bullets (e.g. "Core Java / Java 8 Features") are skills themselves
  const noBullets = sec.skills.filter((l, i, a) => !l.startsWith('•') && (i === a.length - 1 || !a[i + 1].startsWith('•')));
  cv.skillList = [...noBullets.flatMap(tokens), ...raw];

  cv.education = sec.edu.filter(l => /master|bachelor|b\.?tech|m\.?tech|mca|bca|diploma/i.test(l)).map(l => {
    const d = l.match(DATE); const [degree, ...s] = l.replace(DATE, '').trim().split(',');
    return { degree: degree.trim(), school: s.join(',').trim(), period: d ? `${d[1]} – ${d[2]}` : '' };
  });
  cv.awards = sec.awards.map(l => l.replace(/^•\s*/, '')).filter(l => !/^\d{2}\/\d{2}\/\d{4}$/.test(l));
  for (const e of cv.experience) { delete e.tech; e.points = e.points.map(x => x.replace(/(\w)\/ (\w)/g, '$1/$2').trim()); }
  return cv;
}

export function classify(list) {
  const seen = new Set(), groups = {};
  for (let s of list) {
    s = KNOWN[s.toLowerCase()] || s;
    if (seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase());
    const g = (CATS.find(([, re]) => re.test(s)) || ['Other'])[0];
    (groups[g] ||= []).push(s);
  }
  return [...CATS.map(c => c[0]), 'Other'].filter(g => groups[g]).map(g => ({ group: g, items: groups[g] }));
}

export function build(cv, base, extras) {
  const { skills: xs = [], awards: xa = [], ...over } = extras;
  const p = { ...base };
  for (const [k, v] of Object.entries(cv)) if (v !== undefined && v !== '' && k !== 'skillList') p[k] = v;
  p.skills = classify([...cv.skillList, ...xs]);
  const awards = [...new Set([...cv.awards, ...xa])];
  const ace = awards.find(a => /\bACE\b/i.test(a));
  p.ace = ace ? { title: ace, text: 'Recognised for outstanding performance.' } : undefined;
  p.awards = awards.filter(a => a !== ace);
  return Object.assign(p, over);
}

const rd = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
if (process.argv[1]?.endsWith('parse-cv.mjs')) {
  try {
    const text = process.argv[2] === '--text' ? fs.readFileSync(process.argv[3], 'utf8') : await pdfText(A + 'resume.pdf');
    const cv = parse(text);
    if (!cv.experience.length) throw new Error('no experience found in CV');
    fs.writeFileSync(A + 'profile.json', JSON.stringify(build(cv, rd(A + 'profile.json'), rd(A + 'profile.extras.json')), null, 2));
    console.log('profile.json generated from resume.pdf');
  } catch (e) { console.warn('CV parse skipped, keeping existing profile.json:', e.message); }
}
