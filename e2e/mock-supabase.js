// Minimal Supabase-compatible HTTP server backed by a real Postgres.
//
// Docker (and therefore `supabase start`) isn't available everywhere we
// want to run E2E tests, so this emulates the slice of the Supabase API
// the app actually uses — auth password grant, PostgREST-style reads/
// writes/RPCs, and storage upload/signed URLs — while executing every
// data operation against the real database WITH the `authenticated`
// role and the caller's JWT claims set. RLS policies and RPl functions
// run for real; only the HTTP layer is fake.
//
// Usage: node e2e/mock-supabase.js  (env: PGHOST/PGPORT/PGUSER/PGDATABASE, PORT)

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const PORT = process.env.PORT || 54321;
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: +(process.env.PGPORT || 54322),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'quest_test',
});

const sessions = new Map(); // access_token -> user row
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, '.storage');
fs.mkdirSync(storageDir, { recursive: true });

// ---------- helpers ----------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, x-client-info, x-supabase-api-version, range, x-upsert, cache-control',
};

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...extra });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// supabase-js always wraps storage uploads in multipart/form-data — even
// when given a plain Blob (web) or a React Native FormData with a `file`
// field (native) — so the object body here is never raw bytes. Pull the
// file part out by its Content-Disposition (its field name varies: '' for
// a Blob upload, 'file' for the native path) rather than assuming either.
function extractUploadBytes(rawBody, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) return rawBody;

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = [];
  let start = rawBody.indexOf(boundary);
  while (start !== -1) {
    const next = rawBody.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    parts.push(rawBody.slice(start + boundary.length, next));
    start = next;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd).toString('utf8');
    if (!/filename=/i.test(headers)) continue; // skip non-file fields (cacheControl, metadata)
    let content = part.slice(headerEnd + 4);
    if (content.slice(-2).equals(Buffer.from('\r\n'))) content = content.slice(0, -2);
    return content;
  }
  return rawBody;
}

function authUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer /, '');
  return sessions.get(token) || null;
}

function makeSession(user) {
  const access_token = crypto.randomUUID();
  sessions.set(access_token, user);
  return {
    access_token,
    refresh_token: crypto.randomUUID(),
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: userJson(user),
  };
}

function userJson(user) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: new Date().toISOString(),
    user_metadata: user.raw_user_meta_data || {},
    app_metadata: { provider: 'email' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Run fn inside a transaction with the caller's identity applied, so
// RLS behaves exactly as production Supabase.
async function asUser(user, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (user) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user.id, role: 'authenticated' }),
      ]);
      await client.query('set local role authenticated');
    } else {
      await client.query('set local role anon');
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function quoteIdent(name) {
  if (!IDENT.test(name)) throw new Error(`bad identifier: ${name}`);
  return `"${name}"`;
}

// Translate the PostgREST query-param subset the app uses into SQL.
function buildWhere(params, args) {
  const clauses = [];
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    if (key === 'or') {
      // or=(a.eq.1,b.eq.2)
      const inner = value.replace(/^\(|\)$/g, '').split(',');
      const parts = inner.map((expr) => {
        const [col, op, ...rest] = expr.split('.');
        if (op !== 'eq') throw new Error(`unsupported or-op: ${op}`);
        args.push(rest.join('.'));
        return `${quoteIdent(col)} = $${args.length}`;
      });
      clauses.push(`(${parts.join(' or ')})`);
    } else {
      const [op, ...rest] = value.split('.');
      const operand = rest.join('.');
      if (op === 'eq') {
        args.push(operand);
        clauses.push(`${quoteIdent(key)} = $${args.length}`);
      } else if (op === 'in') {
        // in.(a,b,c)
        const list = operand
          .replace(/^\(|\)$/g, '')
          .split(',')
          .map((s) => s.trim().replace(/^"|"$/g, ''));
        args.push(list);
        clauses.push(`${quoteIdent(key)} = any($${args.length})`);
      } else if (op === 'is' && operand === 'null') {
        clauses.push(`${quoteIdent(key)} is null`);
      } else {
        throw new Error(`unsupported filter: ${key}=${value}`);
      }
    }
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

// PostgREST embedded resources, limited to the FK relationships the
// app actually queries (packs with rosters/invites, members' profiles).
// Embedded subqueries run in the same RLS-scoped transaction.
const EMBED_REL = {
  packs: {
    pack_members: { fk: 'pack_id', many: true },
    pack_invites: { fk: 'pack_id', many: true },
  },
  pack_members: {
    profiles: { local: 'user_id', many: false },
  },
};

function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseSelect(sel) {
  const cols = [];
  const embeds = [];
  for (const part of splitTopLevel(sel || '*')) {
    const m = part.match(/^(?:([a-z_]+):)?([a-z_]+)\((.*)\)$/s);
    if (m) embeds.push({ alias: m[1] || m[2], table: m[2], inner: m[3] });
    else cols.push(part);
  }
  return { cols, embeds };
}

let embedAlias = 0;
function selectListSql(table, sel) {
  const { cols, embeds } = parseSelect(sel);
  const items = cols.map((c) =>
    c === '*' ? `${quoteIdent(table)}.*` : `${quoteIdent(table)}.${quoteIdent(c)}`
  );
  for (const e of embeds) {
    const rel = (EMBED_REL[table] || {})[e.table];
    if (!rel) throw new Error(`unsupported embed: ${table} -> ${e.table}`);
    const a = `emb${embedAlias++}`;
    const innerList = selectListSql(e.table, e.inner);
    if (rel.many) {
      items.push(
        `(select coalesce(json_agg(row_to_json(${a})), '[]'::json) ` +
          `from (select ${innerList} from ${quoteIdent(e.table)} ` +
          `where ${quoteIdent(e.table)}.${quoteIdent(rel.fk)} = ${quoteIdent(table)}.id) ${a}) ` +
          `as ${quoteIdent(e.alias)}`
      );
    } else {
      items.push(
        `(select row_to_json(${a}) ` +
          `from (select ${innerList} from ${quoteIdent(e.table)} ` +
          `where ${quoteIdent(e.table)}.id = ${quoteIdent(table)}.${quoteIdent(rel.local)}) ${a}) ` +
          `as ${quoteIdent(e.alias)}`
      );
    }
  }
  return items.join(', ');
}

function buildSelect(table, params) {
  const args = [];
  const select = selectListSql(table, params.get('select') || '*');
  let sql = `select ${select} from ${quoteIdent(table)} ${buildWhere(params, args)}`;
  if (params.get('order')) {
    const [col, dir] = params.get('order').split('.');
    sql += ` order by ${quoteIdent(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
  }
  if (params.get('limit')) sql += ` limit ${parseInt(params.get('limit'), 10)}`;
  return { sql, args };
}

function wantsSingleObject(req) {
  return (req.headers.accept || '').includes('application/vnd.pgrst.object+json');
}

function respondRows(req, res, rows) {
  if (wantsSingleObject(req)) {
    if (rows.length !== 1) {
      return json(res, 406, {
        code: 'PGRST116',
        message: `JSON object requested, multiple (or no) rows returned: ${rows.length} rows`,
        details: null,
        hint: null,
      });
    }
    return json(res, 200, rows[0]);
  }
  return json(res, 200, rows);
}

function pgError(res, err) {
  json(res, 400, { code: err.code || 'PGRST000', message: err.message, details: null, hint: null });
}

// ---------- request handling ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    // ----- auth -----
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const { rows } = await pool.query(
          `select id, email, raw_user_meta_data from auth.users
           where email = $1 and encrypted_password = crypt($2, encrypted_password)`,
          [body.email, body.password]
        );
        if (!rows.length) {
          return json(res, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
            code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          });
        }
        return json(res, 200, makeSession(rows[0]));
      }
      if (grant === 'refresh_token') {
        for (const [, user] of sessions) return json(res, 200, makeSession(user));
        return json(res, 400, { error: 'invalid_grant', msg: 'refresh token not found' });
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }

    if (p === '/auth/v1/signup' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const id = crypto.randomUUID();
      const displayName = body.email.split('@')[0];
      await pool.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_user_meta_data, created_at, updated_at,
           confirmation_token, email_change, email_change_token_new, recovery_token)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
           $2, crypt($3, gen_salt('bf')), now(), $4, now(), now(), '', '', '', '')`,
        [id, body.email, body.password, JSON.stringify({ full_name: displayName })]
      );
      const user = { id, email: body.email, raw_user_meta_data: { full_name: displayName } };
      return json(res, 200, { user: userJson(user), session: makeSession(user) });
    }

    if (p === '/auth/v1/logout' && req.method === 'POST') {
      const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
      sessions.delete(auth);
      res.writeHead(204, CORS);
      return res.end();
    }

    if (p === '/auth/v1/user' && req.method === 'GET') {
      const user = authUser(req);
      if (!user) return json(res, 401, { msg: 'invalid token' });
      return json(res, 200, userJson(user));
    }

    // ----- storage -----
    const uploadMatch = p.match(/^\/storage\/v1\/object\/quest-photos\/(.+)$/);
    if (uploadMatch && req.method === 'POST') {
      const user = authUser(req);
      if (!user) return json(res, 401, { message: 'unauthorized' });
      const objectPath = decodeURIComponent(uploadMatch[1]);
      const rawBody = await readBody(req);
      const bytes = extractUploadBytes(rawBody, req.headers['content-type']);

      // Register the object as the caller so storage RLS runs for real.
      await asUser(user, (client) =>
        client.query(`insert into storage.objects (bucket_id, name) values ('quest-photos', $1)`, [
          objectPath,
        ])
      );

      const filePath = path.join(storageDir, objectPath.replace(/\//g, '__'));
      fs.writeFileSync(filePath, bytes);
      return json(res, 200, { Key: `quest-photos/${objectPath}`, Id: crypto.randomUUID() });
    }

    const signMatch = p.match(/^\/storage\/v1\/object\/sign\/quest-photos\/(.+)$/);
    if (signMatch && req.method === 'POST') {
      const user = authUser(req);
      if (!user) return json(res, 401, { message: 'unauthorized' });
      const objectPath = decodeURIComponent(signMatch[1]);

      // Signed URLs are only issued for objects the caller can see (RLS).
      const { rows } = await asUser(user, (client) =>
        client.query(`select 1 from storage.objects where bucket_id = 'quest-photos' and name = $1`, [
          objectPath,
        ])
      );
      if (!rows.length) {
        return json(res, 400, { message: 'Object not found', statusCode: '404' });
      }
      return json(res, 200, {
        signedURL: `/object/sign/quest-photos/${objectPath}?token=mock`,
      });
    }

    if (signMatch && req.method === 'GET') {
      const objectPath = decodeURIComponent(signMatch[1]);
      const filePath = path.join(storageDir, objectPath.replace(/\//g, '__'));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, CORS);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', ...CORS });
      return res.end(fs.readFileSync(filePath));
    }

    // ----- rest: rpc -----
    const rpcMatch = p.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpcMatch && req.method === 'POST') {
      const user = authUser(req);
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const fnName = quoteIdent(rpcMatch[1]);
      const keys = Object.keys(body);
      const argList = keys.map((k, i) => `${quoteIdent(k)} := $${i + 1}`).join(', ');
      const values = keys.map((k) => body[k]);
      const { rows } = await asUser(user, (client) =>
        client.query(`select ${fnName}(${argList}) as result`, values)
      );
      return json(res, 200, rows[0]?.result ?? null);
    }

    // ----- rest: tables -----
    const tableMatch = p.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (tableMatch) {
      const user = authUser(req);
      const table = tableMatch[1];
      const params = url.searchParams;

      if (req.method === 'GET') {
        const { sql, args } = buildSelect(table, params);
        const { rows } = await asUser(user, (client) => client.query(sql, args));
        return respondRows(req, res, rows);
      }

      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        const rowsIn = Array.isArray(body) ? body : [body];
        const cols = Object.keys(rowsIn[0]);
        const colSql = cols.map(quoteIdent).join(', ');
        const args = [];
        const valueSql = rowsIn
          .map((row) => `(${cols.map((c) => { args.push(row[c]); return `$${args.length}`; }).join(', ')})`)
          .join(', ');
        const returning = (req.headers.prefer || '').includes('return=representation')
          ? 'returning *'
          : '';
        const { rows } = await asUser(user, (client) =>
          client.query(`insert into ${quoteIdent(table)} (${colSql}) values ${valueSql} ${returning}`, args)
        );
        if (!returning) {
          res.writeHead(201, CORS);
          return res.end();
        }
        return respondRows(req, res, rows);
      }

      if (req.method === 'PATCH') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        const args = [];
        const setSql = Object.keys(body)
          .map((c) => { args.push(body[c]); return `${quoteIdent(c)} = $${args.length}`; })
          .join(', ');
        const where = buildWhere(params, args);
        const returning = (req.headers.prefer || '').includes('return=representation')
          ? 'returning *'
          : '';
        const { rows } = await asUser(user, (client) =>
          client.query(`update ${quoteIdent(table)} set ${setSql} ${where} ${returning}`, args)
        );
        if (!returning) {
          res.writeHead(204, CORS);
          return res.end();
        }
        return respondRows(req, res, rows);
      }
    }

    json(res, 404, { message: `mock-supabase: unhandled ${req.method} ${p}` });
  } catch (err) {
    console.error(`${req.method} ${p} ->`, err.message);
    pgError(res, err);
  }
});

server.listen(PORT, () => {
  console.log(`mock-supabase listening on http://127.0.0.1:${PORT}`);
});
