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

// ---------- Tema claro/escuro ----------
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  $('temaBtn').textContent = tema === 'escuro' ? '🌙' : '☀️';
}
const temaSalvo = localStorage.getItem('tema');
aplicarTema(temaSalvo || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));
$('temaBtn').addEventListener('click', () => {
  const novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
  localStorage.setItem('tema', novo);
  aplicarTema(novo);
});

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
  $('menuEmail').textContent = user.email || '';

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
function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hojeISO() {
  return dataISO(new Date());
}
$('dataHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });

function tarefasDoDia(dataStr) {
  if (!dadosUsuario) return [];
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const diaSemana = new Date(ano, mes - 1, dia).getDay();
  return (dadosUsuario.tarefas || [])
    .filter(t => t.ativa && (!t.dias || t.dias.length === 0 || t.dias.includes(diaSemana)))
    .sort((a,b) => a.horario.localeCompare(b.horario));
}

function tarefasDeHoje() {
  return tarefasDoDia(hojeISO());
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
  const diarias = tarefas.filter(t => !t.dias || t.dias.length === 0 || t.dias.length === 7);
  const semanais = tarefas.filter(t => t.dias && t.dias.length > 0 && t.dias.length < 7);
  $('secaoDiarias').hidden = diarias.length === 0;
  $('secaoSemanais').hidden = semanais.length === 0;
  renderizarListaEm('listaDiarias', diarias);
  renderizarListaEm('listaSemanais', semanais);
  if ($('diaAnteriorDialog').open) renderizarDiaAnterior();
  renderizarMes();
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
  $('agoraCard').className = 'agora-card categoria-' + atual.categoria;
  $('agoraNome').textContent = atual.nome;
  $('agoraHorario').textContent = atual.horario;
  $('agoraConcluir').onclick = () => marcarConcluida(atual.id, true);
  $('agoraChat').onclick = () => abrirChat(atual);
}

function renderizarListaEm(ulId, tarefas) {
  const ul = $(ulId);
  ul.innerHTML = '';
  tarefas.forEach(t => {
    const feita = estaConcluida(t.id);
    const li = document.createElement('li');
    li.className = 'tarefa-item categoria-' + t.categoria + (feita ? ' concluida' : '');
    li.innerHTML = `
      <button class="tarefa-check" aria-label="Marcar concluída">${feita ? '✓' : ''}</button>
      <div class="tarefa-info">
        <p class="tarefa-nome"></p>
        <p class="tarefa-meta"></p>
      </div>
      <span class="tarefa-categoria"></span>
      <div class="tarefa-acoes">
        <button type="button" class="tarefa-acao tarefa-editar" aria-label="Editar tarefa" title="Editar">✎</button>
        <button type="button" class="tarefa-acao tarefa-excluir" aria-label="Excluir tarefa" title="Excluir">🗑</button>
      </div>
    `;
    li.querySelector('.tarefa-nome').textContent = t.nome;
    li.querySelector('.tarefa-meta').textContent = t.horario;
    li.querySelector('.tarefa-categoria').textContent = t.categoria;
    li.querySelector('.tarefa-check').addEventListener('click', () => marcarConcluida(t.id, !feita));
    li.querySelector('.tarefa-editar').addEventListener('click', () => abrirFormEdicaoTarefa(t));
    li.querySelector('.tarefa-excluir').addEventListener('click', () => excluirTarefa(t.id));
    ul.appendChild(li);
  });
}

// ---------- Mês: calendário e conquistas ----------
function diaCompleto(dataStr) {
  const tarefasDoDiaAlvo = tarefasDoDia(dataStr);
  if (tarefasDoDiaAlvo.length === 0) return null;
  const feitas = (dadosUsuario.concluidas || {})[dataStr] || [];
  return tarefasDoDiaAlvo.every(t => feitas.includes(t.id));
}

function renderizarMes() {
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const el = $('mesCalendario');
  el.innerHTML = '';
  for (let i = 0; i < primeiroDia.getDay(); i++) {
    const vazio = document.createElement('span');
    vazio.className = 'mes-dia mes-dia-vazio';
    el.appendChild(vazio);
  }
  let streakAtual = 0, maiorStreak = 0, diasCompletos = 0, diasComTarefa = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dataObj = new Date(ano, mes, d);
    const dataStr = dataISO(dataObj);
    const completo = dataObj <= hoje ? diaCompleto(dataStr) : null;
    const span = document.createElement('span');
    span.className = 'mes-dia' + (completo === true ? ' completo' : completo === false ? ' incompleto' : ' sem-tarefa');
    if (dataStr === hojeISO()) span.classList.add('hoje');
    span.textContent = d;
    el.appendChild(span);
    if (dataObj <= hoje) {
      if (completo !== null) diasComTarefa++;
      if (completo === true) { diasCompletos++; streakAtual++; maiorStreak = Math.max(maiorStreak, streakAtual); }
      else if (completo === false) { streakAtual = 0; }
    }
  }
  renderizarConquistas(maiorStreak, diasCompletos, diasComTarefa);
}

function renderizarConquistas(maiorStreak, diasCompletos, diasComTarefa) {
  const conquistas = [];
  if (diasCompletos >= 1) conquistas.push({ icone: '🎯', nome: 'Primeiro dia completo' });
  if (maiorStreak >= 3) conquistas.push({ icone: '🔥', nome: 'Sequência de 3 dias' });
  if (maiorStreak >= 7) conquistas.push({ icone: '🔥', nome: 'Sequência de 7 dias' });
  if (diasComTarefa > 0 && diasCompletos === diasComTarefa) conquistas.push({ icone: '🌟', nome: 'Mês perfeito até agora' });
  const el = $('mesConquistas');
  el.innerHTML = '';
  if (conquistas.length === 0) {
    el.innerHTML = '<p class="mes-vazio">Ainda sem conquistas este mês — comece marcando suas tarefas!</p>';
    return;
  }
  conquistas.forEach(c => {
    const badge = document.createElement('span');
    badge.className = 'conquista-badge';
    badge.innerHTML = `<span class="conquista-icone">${c.icone}</span> ${c.nome}`;
    el.appendChild(badge);
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

// ---------- Nova tarefa / edição ----------
let tarefaEmEdicao = null;

function abrirFormNovaTarefa() {
  tarefaEmEdicao = null;
  $('tarefaForm').reset();
  $('tarefaDialogTitulo').textContent = 'Nova tarefa';
  $('tarefaDialog').showModal();
}

function abrirFormEdicaoTarefa(tarefa) {
  tarefaEmEdicao = tarefa;
  $('campoNome').value = tarefa.nome;
  $('campoCategoria').value = tarefa.categoria;
  $('campoHorario').value = tarefa.horario;
  const diasAtivos = new Set(tarefa.dias && tarefa.dias.length ? tarefa.dias : [0,1,2,3,4,5,6]);
  document.querySelectorAll('#diasGrade input').forEach(input => {
    input.checked = diasAtivos.has(Number(input.value));
  });
  $('tarefaDialogTitulo').textContent = 'Editar tarefa';
  $('tarefaDialog').showModal();
}

$('novaTarefaBtn').addEventListener('click', () => { fecharMenu(); abrirFormNovaTarefa(); });
$('listaVaziaBtn').addEventListener('click', () => abrirFormNovaTarefa());
$('cancelarTarefa').addEventListener('click', () => { $('tarefaDialog').close(); tarefaEmEdicao = null; });

$('tarefaForm').addEventListener('submit', async (e) => {
  const dias = [...document.querySelectorAll('#diasGrade input:checked')].map(i => Number(i.value));
  const campos = {
    nome: $('campoNome').value.trim(),
    categoria: $('campoCategoria').value,
    horario: $('campoHorario').value,
    dias
  };
  let tarefas;
  if (tarefaEmEdicao) {
    tarefas = (dadosUsuario.tarefas || []).map(t => t.id === tarefaEmEdicao.id ? { ...t, ...campos } : t);
  } else {
    const nova = {
      id: crypto.randomUUID(),
      ...campos,
      ativa: true,
      ordem: (dadosUsuario.tarefas || []).length,
      criadoEm: new Date().toISOString()
    };
    tarefas = [...(dadosUsuario.tarefas || []), nova];
  }
  await updateDoc(doc(db, 'usuarios', uid), { tarefas });
  $('tarefaForm').reset();
  tarefaEmEdicao = null;
});

async function excluirTarefa(id) {
  if (!confirm('Excluir esta tarefa? Essa ação não pode ser desfeita.')) return;
  const tarefas = (dadosUsuario.tarefas || []).filter(t => t.id !== id);
  await updateDoc(doc(db, 'usuarios', uid), { tarefas });
}

// ---------- Marcar dia anterior ----------
$('diaAnteriorBtn').addEventListener('click', () => {
  fecharMenu();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = dataISO(ontem);
  $('campoDataAnterior').value = ontemISO;
  $('campoDataAnterior').max = ontemISO;
  renderizarDiaAnterior();
  $('diaAnteriorDialog').showModal();
});
$('campoDataAnterior').addEventListener('change', renderizarDiaAnterior);
$('fecharDiaAnterior').addEventListener('click', () => $('diaAnteriorDialog').close());

function renderizarDiaAnterior() {
  const data = $('campoDataAnterior').value;
  const tarefas = data ? tarefasDoDia(data) : [];
  const ul = $('listaDiaAnterior');
  ul.innerHTML = '';
  $('diaAnteriorVazio').hidden = tarefas.length > 0;
  const concluidasDoDia = (dadosUsuario.concluidas || {})[data] || [];
  tarefas.forEach(t => {
    const feita = concluidasDoDia.includes(t.id);
    const li = document.createElement('li');
    li.className = 'tarefa-item' + (feita ? ' concluida' : '');
    li.innerHTML = `
      <button class="tarefa-check" aria-label="Marcar concluída">${feita ? '✓' : ''}</button>
      <div class="tarefa-info">
        <p class="tarefa-nome"></p>
        <p class="tarefa-meta"></p>
      </div>
    `;
    li.querySelector('.tarefa-nome').textContent = t.nome;
    li.querySelector('.tarefa-meta').textContent = t.horario;
    li.querySelector('.tarefa-check').addEventListener('click', () => marcarConcluidaData(t.id, data, !feita));
    ul.appendChild(li);
  });
}

async function marcarConcluidaData(taskId, data, valor) {
  const mapa = { ...(dadosUsuario.concluidas || {}) };
  const lista = new Set(mapa[data] || []);
  if (valor) lista.add(taskId); else lista.delete(taskId);
  mapa[data] = [...lista];
  await updateDoc(doc(db, 'usuarios', uid), { concluidas: mapa });
}

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
