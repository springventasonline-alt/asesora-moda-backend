#!/usr/bin/env node
/**
 * Persiste TN_STORES_JSON en Railway.
 *
 * Opción A — API Railway (recomendada en CI):
 *   RAILWAY_API_TOKEN=... node scripts/persist-railway-tn-stores.mjs
 *
 * Opción B — CLI Railway (requiere `railway login` + proyecto linkeado):
 *   node scripts/persist-railway-tn-stores.mjs --cli
 *
 * Opción C — Backend remoto (token OAuth en memoria del servicio):
 *   node scripts/persist-railway-tn-stores.mjs --remote
 */
import { spawnSync } from 'node:child_process';

const BACKEND = process.env.BACKEND_URL
  || 'https://asesora-moda-backend-production.up.railway.app';
const SETUP_KEY = process.env.SETUP_KEY || 'springdemo-7793118-setup';
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID || 'c6d8f12d-2f4d-4c90-8028-639da0141fd2';
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
const SERVICE_ID = process.env.RAILWAY_SERVICE_ID || '';
const args = new Set(process.argv.slice(2));

async function fetchRemoteJson() {
  const res = await fetch(`${BACKEND}/auth/setup/token/6125057?key=${encodeURIComponent(SETUP_KEY)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.tn_stores_json;
}

async function upsertViaGraphql(value) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('Falta RAILWAY_API_TOKEN');

  if (!ENVIRONMENT_ID) {
    throw new Error('Falta RAILWAY_ENVIRONMENT_ID para GraphQL con account token');
  }

  const input = {
    projectId: PROJECT_ID,
    environmentId: ENVIRONMENT_ID,
    name: 'TN_STORES_JSON',
    value,
    skipDeploys: false,
  };
  if (SERVICE_ID) input.serviceId = SERVICE_ID;

  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation variableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      variables: { input },
    }),
  });

  const payload = await res.json();
  if (!res.ok || payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors || payload));
  }
  return payload.data;
}

function upsertViaCli(value) {
  const result = spawnSync(
    'railway',
    ['variable', 'set', 'TN_STORES_JSON', '--stdin', '--json'],
    { input: value, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `railway exit ${result.status}`);
  }
  return result.stdout;
}

async function persistRemote() {
  const res = await fetch(`${BACKEND}/auth/setup/persist-railway?key=${encodeURIComponent(SETUP_KEY)}`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  if (args.has('--remote')) {
    const result = await persistRemote();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const value = process.env.TN_STORES_JSON || await fetchRemoteJson();
  console.log('[persist] TN_STORES_JSON length:', value.length);

  if (args.has('--cli') || !process.env.RAILWAY_API_TOKEN) {
    const cliOut = upsertViaCli(value);
    console.log(cliOut || '[persist] OK via Railway CLI');
    return;
  }

  const gqlOut = await upsertViaGraphql(value);
  console.log(JSON.stringify(gqlOut, null, 2));
}

main().catch((err) => {
  console.error('[persist-railway-tn-stores]', err.message);
  process.exit(1);
});
