// Runs database/schema.sql against MySQL (handles DELIMITER blocks for triggers).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitStatements(sql) {
  const out = [];
  let delimiter = ';';
  let buf = '';
  for (const line of sql.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) { delimiter = m[1]; continue; }
    if (/^\s*--/.test(line) || !line.trim()) continue;
    buf += line + '\n';
    if (buf.trimEnd().endsWith(delimiter)) {
      out.push(buf.trimEnd().slice(0, -delimiter.length).trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const stmts = splitStatements(sql);
  for (const s of stmts) await conn.query(s);
  console.log(`Database ready: ${stmts.length} statements executed.`);
  await conn.end();
})().catch((e) => { console.error('Setup failed:', e.message); process.exit(1); });
