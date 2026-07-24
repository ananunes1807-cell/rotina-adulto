import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  getMessaging, getToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js';

// ====== PREENCHER (veja README.md, passo 3 e 4) ======
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDi32CQ8k39fw3YPirip5BSaEVG7ZczZR4',
  authDomain: 'rotina-adulto-91820.firebaseapp.com',
  projectId: 'rotina-adulto-91820',
  storageBucket: 'rotina-adulto-91820.firebasestorage.app',
  messagingSenderId: '273897627499',
  appId: '1:273897627499:web:69429f1c3396dfec7f762e'
};
const VAPID_KEY = 'BFcWyXz4SErk3Wm7F-6Ba1PVfPs1UcEwcNI_95gzHhRZb9zA3ymw0HwNe0oE0mpLYQ_O8p2x3vskABaBnxpvxqI';
// URL do Cloudflare Worker (fica pronta depois do "wrangler deploy", ver README)
const WORKER_CHAT_URL = 'https://rotina-adulto-worker.ananunes1807.workers.dev/chat';
// =======================================================

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const DIAS_SEMANA = ['dom','seg','ter','qua','qui','sex','sáb'];
const $ = id => document.getElementById(id);

let uid = null;
let dadosUsuario = null; // documento inteiro em memória
let tarefaAtualChat = null;

// ---------- Login ----------
$('loginBtn').addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // popup pode ser bloqueado no celular; cai pro redirect
    await signInWithRedirect(auth, provider);
  }
});

$('logoutBtn').addEventListener('click', () => signOut(auth));

getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, async user => {
  if (!user) {
    $('loginScreen').hidden = false;
    $('appScreen').hidden = true;
    return;
  }
  uid = user.uid;
  $('loginScreen').hidden = true;
  $('appScreen').hidden = false;
  $('saudacao').textContent = `Olá, ${user.displayName?.split(' ')[0] || ''}`;

  await garantirDocumento(user);
  escutarDados();
});

async function garantirDocumento(user) {
  const ref = doc(db, 'usuarios', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      perfil: { nome: user.displayName || '', email: user.email || '', criadoEm: new Date().toISOString() },
      tarefas: [],
      concluidas: {},
      pushTokens: []
    });
  }
}

function escutarDados() {
  const ref = doc(db, 'usuarios', uid);
  onSnapshot(ref, snap => {
    dadosUsuario = snap.data();
    renderizarTudo();
  });
}

// ---------- Data / hora ----------
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
$('dataHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });

function tarefasDeHoje() {
  if (!dadosUsuario) return [];
  const diaSemana = new Date().getDay();
  return (dadosUsuario.tarefas || [])
    .filter(t => t.ativa && (!t.dias || t.dias.length === 0 || t.dias.includes(diaSemana)))
    .sort((a,b) => a.horario.localeCompare(b.horario));
}

function estaConcluida(id) {
  const doHoje = (dadosUsuario.concluidas || {})[hojeISO()] || [];
  return doHoje.includes(id);
}

// ---------- Render ----------
function renderizarTudo() {
  const tarefas = tarefasDeHoje();
  $('listaVazia').hidden = tarefas.length > 0;
  renderizarTrilha(tarefas);
  renderizarAgora(tarefas);
  renderizarLista(tarefas);
}

function proximaTarefa(tarefas) {
  const agora = new Date();
  const agoraMin = agora.getHours()*60 + agora.getMinutes();
  const pendentes = tarefas.filter(t => !estaConcluida(t.id));
  // a próxima pendente com horário >= agora, senão a primeira pendente do dia
  const [h,m] = ['00','00'];
  let candidata = pendentes.find(t => {
    const [hh,mm] = t.horario.split(':').map(Number);
    return (hh*60+mm) >= agoraMin;
  });
  return candidata || pendentes[0] || null;
}

function renderizarTrilha(tarefas) {
  const el = $('trilha');
  el.innerHTML = '';
  const atual = proximaTarefa(tarefas);
  tarefas.forEach((t, i) => {
    if (i > 0) {
      const linha = document.createElement('span');
      linha.className = 'trilha-linha' + (estaConcluida(tarefas[i-1].id) ? ' feita' : '');
      el.appendChild(linha);
    }
    const no = document.createElement('li');
    no.className = 'trilha-no'
      + (estaConcluida(t.id) ? ' feito' : '')
      + (atual && atual.id === t.id ? ' agora' : '');
    no.title = `${t.horario} — ${t.nome}`;
    el.appendChild(no);
  });
}

function renderizarAgora(tarefas) {
  const atual = proximaTarefa(tarefas);
  $('agoraCard').hidden = !atual;
  if (!atual) return;
  $('agoraNome').textContent = atual.nome;
  $('agoraHorario').textContent = atual.horario;
  $('agoraConcluir').onclick = () => marcarConcluida(atual.id, true);
  $('agoraChat').onclick = () => abrirChat(atual);
}

function renderizarLista(tarefas) {
  const ul = $('listaTarefas');
  ul.innerHTML = '';
  tarefas.forEach(t => {
    const feita = estaConcluida(t.id);
    const li = document.createElement('li');
    li.className = 'tarefa-item' + (feita ? ' concluida' : '');
    li.innerHTML = `
      <button class="tarefa-check" aria-label="Marcar concluída">${feita ? '✓' : ''}</button>
      <div class="tarefa-info">
        <p class="tarefa-nome"></p>
        <p class="tarefa-meta"></p>
      </div>
      <span class="tarefa-categoria"></span>
    `;
    li.querySelector('.tarefa-nome').textContent = t.nome;
    li.querySelector('.tarefa-meta').textContent = t.horario;
    li.querySelector('.tarefa-categoria').textContent = t.categoria;
    li.querySelector('.tarefa-check').addEventListener('click', () => marcarConcluida(t.id, !feita));
    ul.appendChild(li);
  });
}

async function marcarConcluida(taskId, valor) {
  const data = hojeISO();
  const mapa = { ...(dadosUsuario.concluidas || {}) };
  const lista = new Set(mapa[data] || []);
  if (valor) lista.add(taskId); else lista.delete(taskId);
  mapa[data] = [...lista];
  await updateDoc(doc(db, 'usuarios', uid), { concluidas: mapa });
}

// ---------- Nova tarefa ----------
$('novaTarefaBtn').addEventListener('click', () => { fecharMenu(); $('tarefaDialog').showModal(); });
$('listaVaziaBtn').addEventListener('click', () => $('tarefaDialog').showModal());
$('cancelarTarefa').addEventListener('click', () => $('tarefaDialog').close());

$('tarefaForm').addEventListener('submit', async (e) => {
  const dias = [...document.querySelectorAll('#diasGrade input:checked')].map(i => Number(i.value));
  const nova = {
    id: crypto.randomUUID(),
    nome: $('campoNome').value.trim(),
    categoria: $('campoCategoria').value,
    horario: $('campoHorario').value,
    dias,
    ativa: true,
    ordem: (dadosUsuario.tarefas || []).length,
    criadoEm: new Date().toISOString()
  };
  const tarefas = [...(dadosUsuario.tarefas || []), nova];
  await updateDoc(doc(db, 'usuarios', uid), { tarefas });
  $('tarefaForm').reset();
});

// ---------- Menu ----------
$('menuBtn').addEventListener('click', () => {
  const aberto = !$('menuPainel').hidden;
  $('menuPainel').hidden = aberto;
  $('menuBtn').setAttribute('aria-expanded', String(!aberto));
});
function fecharMenu() { $('menuPainel').hidden = true; }

// ---------- Notificações (FCM) ----------
$('notifBtn').addEventListener('click', async () => {
  fecharMenu();
  await ativarNotificacoes();
});

async function ativarNotificacoes() {
  if (!(await isSupported())) {
    mostrarAviso('Este navegador não suporta notificação push.');
    return;
  }
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    mostrarAviso('Permissão de notificação negada. Ative nas configurações do navegador se mudar de ideia.');
    return;
  }
  const registro = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });
  const tokens = [...(dadosUsuario.pushTokens || [])];
  if (!tokens.some(t => t.token === token)) {
    tokens.push({ token, dispositivo: `${navigator.platform || 'dispositivo'}`, criadoEm: new Date().toISOString() });
    await updateDoc(doc(db, 'usuarios', uid), { pushTokens: tokens });
  }
  mostrarAviso('Notificações ativadas neste aparelho.');
}

function mostrarAviso(texto) {
  const el = $('notifAviso');
  el.textContent = texto;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 6000);
}

// mensagem chegando com o app aberto em primeiro plano
isSupported().then(ok => {
  if (!ok) return;
  const messaging = getMessaging(app);
  onMessage(messaging, payload => {
    mostrarAviso(payload.notification?.body || 'Hora de uma tarefa da sua rotina.');
  });
});

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---------- Chat de apoio ----------
function abrirChat(tarefa) {
  tarefaAtualChat = tarefa;
  $('chatTitulo').textContent = tarefa.nome;
  $('chatMensagens').innerHTML = '';
  adicionarMensagem('ia', `Sobre "${tarefa.nome}": o que está travando agora? Pode ser cansaço, não saber por onde começar, ou só falta de vontade mesmo — qualquer motivo vale.`);
  $('chatDialog').showModal();
}
$('fecharChat').addEventListener('click', () => $('chatDialog').close());

$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = $('chatInput').value.trim();
  if (!texto) return;
  adicionarMensagem('eu', texto);
  $('chatInput').value = '';
  try {
    const resposta = await pedirAjudaIA(tarefaAtualChat, texto);
    adicionarMensagem('ia', resposta);
  } catch (err) {
    adicionarMensagem('ia', 'Não consegui responder agora (chat ainda não configurado — veja README.md, seção "Fase 2").');
  }
});

function adicionarMensagem(quem, texto) {
  const div = document.createElement('div');
  div.className = 'msg ' + (quem === 'ia' ? 'msg-ia' : 'msg-eu');
  div.textContent = texto;
  $('chatMensagens').appendChild(div);
  $('chatMensagens').scrollTop = $('chatMensagens').scrollHeight;
}

async function pedirAjudaIA(tarefa, mensagem) {
  const resp = await fetch(WORKER_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarefa: tarefa.nome, categoria: tarefa.categoria, mensagem })
  });
  if (!resp.ok) throw new Error('falha no chat');
  const data = await resp.json();
  return data.resposta;
}
