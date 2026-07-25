/**
 * Cloudflare Worker do Rotina Adulto.
 *
 * Faz duas coisas, sem precisar de Firebase Cloud Functions (sem Blaze):
 *
 * 1. scheduled()  — roda a cada minuto (ver wrangler.toml). Lê todas as
 *    usuárias no Firestore, vê quem tem tarefa batendo com o horário agora,
 *    e manda notificação via FCM (HTTP v1) pros tokens salvos.
 *
 * 2. fetch()      — atende POST /chat, chamado pelo app.js quando você
 *    aperta "Preciso de ajuda com isso". Guarda a ANTHROPIC_API_KEY em
 *    segredo aqui (nunca no navegador) e conversa com a Claude API.
 *
 * Segredos necessários (ver README.md da raiz do projeto, seção Cloudflare):
 *   - SERVICE_ACCOUNT_JSON  (conta de serviço do Firebase, JSON inteiro)
 *   - ANTHROPIC_API_KEY     (sua chave da API da Anthropic)
 * Variável necessária:
 *   - PROJECT_ID            (o id do projeto Firebase, ex: rotina-adulto)
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checarRotinas(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      return responderChat(request, env);
    }
    return new Response('ok', { status: 200 });
  }
};

// ================= Autenticação Google (conta de serviço) =================

async function getAccessToken(env, scopes) {
  const conta = JSON.parse(env.SERVICE_ACCOUNT_JSON);
  const agora = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: conta.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600
  };

  const jwt = await assinarJwt(header, claims, conta.private_key);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Falha ao autenticar com o Google: ' + JSON.stringify(data));
  return data.access_token;
}

async function assinarJwt(header, claims, chavePem) {
  const base64url = obj => btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const naoAssinado = `${base64url(header)}.${base64url(claims)}`;

  const chave = await importarChavePrivada(chavePem);
  const assinatura = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    chave,
    new TextEncoder().encode(naoAssinado)
  );

  const assinaturaB64 = btoa(String.fromCharCode(...new Uint8Array(assinatura)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  return `${naoAssinado}.${assinaturaB64}`;
}

async function importarChavePrivada(pem) {
  const corpo = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const bin = atob(corpo);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8', bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

// ================= Firestore (REST) =================

async function listarUsuarios(env, accessToken) {
  const resp = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/usuarios`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();
  return (data.documents || []).map(d => ({ nome: d.name, dados: firestoreParaObjeto(d.fields) }));
}

async function atualizarNotificadas(env, accessToken, nomeDocumento, notificadas) {
  const campos = objetoParaFirestore({ notificadas });
  await fetch(
    `https://firestore.googleapis.com/v1/${nomeDocumento}?updateMask.fieldPaths=notificadas`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: campos })
    }
  );
}

// Conversores mínimos entre o formato REST do Firestore e objetos JS comuns.
function firestoreParaObjeto(fields = {}) {
  const out = {};
  for (const chave in fields) out[chave] = valorFirestore(fields[chave]);
  return out;
}
function valorFirestore(v) {
  if (v.mapValue) return firestoreParaObjeto(v.mapValue.fields);
  if (v.arrayValue) return (v.arrayValue.values || []).map(valorFirestore);
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  return null;
}
function objetoParaFirestore(obj) {
  const fields = {};
  for (const chave in obj) fields[chave] = paraValorFirestore(obj[chave]);
  return fields;
}
function paraValorFirestore(v) {
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraValorFirestore) } };
  if (v !== null && typeof v === 'object') return { mapValue: { fields: objetoParaFirestore(v) } };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  return { nullValue: null };
}

// ================= Lógica de horário =================

function agoraBrasil() {
  // America/Sao_Paulo = UTC-3 o ano todo (sem horário de verão desde 2019).
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hhmm = `${String(agora.getUTCHours()).padStart(2,'0')}:${String(agora.getUTCMinutes()).padStart(2,'0')}`;
  const diaSemana = agora.getUTCDay();
  const dataISO = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth()+1).padStart(2,'0')}-${String(agora.getUTCDate()).padStart(2,'0')}`;
  return { hhmm, diaSemana, dataISO };
}

// ================= Rotina principal (cron) =================

async function checarRotinas(env) {
  const accessToken = await getAccessToken(env, [
    'https://www.googleapis.com/auth/datastore',
    'https://www.googleapis.com/auth/firebase.messaging'
  ]);
  const { hhmm, diaSemana, dataISO } = agoraBrasil();
  const usuarios = await listarUsuarios(env, accessToken);

  for (const usuario of usuarios) {
    const dados = usuario.dados;
    const tarefas = dados.tarefas || [];
    const concluidasHoje = (dados.concluidas || {})[dataISO] || [];
    const notificadas = { ...(dados.notificadas || {}) };
    const notificadasHoje = new Set(notificadas[dataISO] || []);
    const tokens = (dados.pushTokens || []).map(t => t.token).filter(Boolean);

    const devidas = tarefas.filter(t =>
      t.ativa && t.horario === hhmm &&
      (!t.dias || t.dias.length === 0 || t.dias.includes(diaSemana)) &&
      !concluidasHoje.includes(t.id) &&
      !notificadasHoje.has(t.id)
    );

    if (devidas.length === 0 || tokens.length === 0) continue;

    for (const tarefa of devidas) {
      for (const token of tokens) {
        await enviarFcm(env, accessToken, token, tarefa);
      }
      notificadasHoje.add(tarefa.id);
    }

    notificadas[dataISO] = [...notificadasHoje];
    await atualizarNotificadas(env, accessToken, usuario.nome, notificadas);
  }
}

async function enviarFcm(env, accessToken, token, tarefa) {
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: 'Hora de: ' + tarefa.nome, body: 'Um passo de cada vez. Toca aqui quando fizer.' },
          data: { tarefaId: tarefa.id }
        }
      })
    }
  );
}

// ================= Chat de apoio (Claude API) =================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

async function responderChat(request, env) {
  const { tarefa, categoria, mensagem } = await request.json();

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: 'Você ajuda uma pessoa autista (TEA nível 2) com TDAH a executar uma tarefa da rotina dela. ' +
        'Nunca faça a tarefa por ela nem decida por ela. Ajude a destravar: quebre em passos bem pequenos e ' +
        'concretos, valide a dificuldade sem dramatizar, seja direta e breve (poucas frases). Sem emojis em excesso.',
      messages: [
        { role: 'user', content: `Tarefa: ${tarefa} (categoria: ${categoria}). O que a pessoa disse: ${mensagem}` }
      ]
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('Erro da API da Anthropic:', resp.status, JSON.stringify(data));
    return new Response(JSON.stringify({ resposta: `Erro da IA (${resp.status}): ${data.error?.message || 'desconhecido'}` }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
  const texto = data.content?.find(b => b.type === 'text')?.text || 'Não consegui pensar em uma resposta agora.';
  return new Response(JSON.stringify({ resposta: texto }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
