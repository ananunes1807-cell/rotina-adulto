import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot
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

const $ = id => document.getElementById(id);
const CATEGORIA_ICONE = { higiene:'🧼', casa:'🧹', trabalho:'💼', saude:'💊', outro:'✨' };
const ICONE_SVG = { comprimido:'#i-comprimido', gota:'#i-gota', tigela:'#i-tigela', lua:'#i-lua', coracao:'#i-coracao' };

// ---------- Registro dos cards de sistema (padrões de fábrica) ----------
const BLOCOS_SISTEMA = {
  foco:        { titulo:'Foco de hoje',        icone:'i-alvo',     cor:'pessego' },
  prioridades: { titulo:'Prioridades',         icone:'i-bandeira', cor:'rosa' },
  agenda:      { titulo:'Agenda do dia',       icone:'i-relogio',  cor:'ceu' },
  tarefas:     { titulo:'Tarefas',             icone:'i-lista',    cor:'lilas' },
  depois:      { titulo:'Fazer depois',        icone:'i-bandeja',  cor:'areia' },
  mente:       { titulo:'Descarregar a mente', icone:'i-nuvem',    cor:'lilas' },
  autocuidado: { titulo:'Autocuidado',         icone:'i-coracao',  cor:'menta' },
  habitos:     { titulo:'Hábitos',             icone:'i-repetir',  cor:'rosa' },
  agua:        { titulo:'Água',                icone:'i-gota',     cor:'ceu' },
  refeicoes:   { titulo:'Refeições',           icone:'i-tigela',   cor:'pessego' },
  humor:       { titulo:'Humor e energia',     icone:'i-calma',    cor:'lilas' },
  lembrar:     { titulo:'Não esquecer',        icone:'i-pin',      cor:'areia' },
  conquistas:  { titulo:'Conquistas do dia',   icone:'i-pata',     cor:'dourado' }
};
const ICONES_ESCOLHA_BLOCO = ['i-alvo','i-bandeira','i-relogio','i-lista','i-bandeja','i-nuvem','i-coracao','i-repetir','i-gota','i-tigela','i-calma','i-pin','i-pata','i-estrela','i-config'];
const CORES_ESCOLHA_BLOCO = ['rosa','lilas','ceu','menta','pessego','areia','dourado'];
function painelPadrao() {
  return Object.keys(BLOCOS_SISTEMA).map(id => ({
    id, tipo: 'sistema', oculto: false, largura: 'normal', cor: null, icone: null, titulo: null
  }));
}

let uid = null;
let dadosUsuario = null; // documento inteiro em memória
let itemAtualChat = null;
let itemEmEdicao = null;
let diaDialogAtual = null;
let blocoEmEdicao = null;
let modoPersonalizar = false;
let painelSnapshotAntes = null;

// ---------- Tema claro/escuro ----------
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  $('interruptorTema').setAttribute('aria-pressed', tema === 'escuro' ? 'true' : 'false');
}
const temaSalvo = localStorage.getItem('tema');
aplicarTema(temaSalvo || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));
function alternarTema() {
  const novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
  localStorage.setItem('tema', novo);
  aplicarTema(novo);
}
$('interruptorTema').addEventListener('click', alternarTema);

// ---------- Tamanho da letra ----------
const NIVEIS_FONTE = [
  { id: 'normal', rotulo: 'Normal' },
  { id: 'grande', rotulo: 'Grande' },
  { id: 'muito-grande', rotulo: 'Muito grande' },
  { id: 'enorme', rotulo: 'Enorme' }
];
function aplicarFonte(id) {
  const indice = Math.max(0, NIVEIS_FONTE.findIndex(n => n.id === id));
  document.documentElement.setAttribute('data-fonte', NIVEIS_FONTE[indice].id);
  $('fonteNivelTexto').textContent = NIVEIS_FONTE[indice].rotulo;
  $('fonteMenos').disabled = indice === 0;
  $('fonteMais').disabled = indice === NIVEIS_FONTE.length - 1;
}
function indiceFonteAtual() {
  const atual = document.documentElement.getAttribute('data-fonte') || 'normal';
  return Math.max(0, NIVEIS_FONTE.findIndex(n => n.id === atual));
}
aplicarFonte(localStorage.getItem('fonte') || 'normal');
$('fonteMenos').addEventListener('click', () => {
  const novo = NIVEIS_FONTE[Math.max(0, indiceFonteAtual() - 1)].id;
  localStorage.setItem('fonte', novo);
  aplicarFonte(novo);
});
$('fonteMais').addEventListener('click', () => {
  const novo = NIVEIS_FONTE[Math.min(NIVEIS_FONTE.length - 1, indiceFonteAtual() + 1)].id;
  localStorage.setItem('fonte', novo);
  aplicarFonte(novo);
});

// ---------- Menu de conta (avatar) ----------
const consultaDesktopConta = window.matchMedia('(min-width: 760px)');
let contaAberta = false;
function atualizarPainelConta() {
  const mostrar = consultaDesktopConta.matches || contaAberta;
  $('contaPainel').hidden = !mostrar;
  $('botaoConta').setAttribute('aria-expanded', String(mostrar));
}
$('botaoConta').addEventListener('click', () => { contaAberta = !contaAberta; atualizarPainelConta(); });
document.addEventListener('click', e => {
  if (!contaAberta) return;
  if (!e.target.closest('.conta-area')) { contaAberta = false; atualizarPainelConta(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && contaAberta) { contaAberta = false; atualizarPainelConta(); }
});
consultaDesktopConta.addEventListener('change', atualizarPainelConta);
atualizarPainelConta();

// ---------- Navegação por abas ----------
document.querySelectorAll('.aba').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', 'false'));
    botao.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.vista').forEach(v => { v.hidden = v.id !== botao.dataset.alvo; });
  });
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
  $('menuEmail').textContent = user.email || '';
  const nome = user.displayName || user.email || '';
  $('contaNome').textContent = nome.split(' ')[0] || 'Você';
  $('contaIniciais').textContent = iniciaisDe(nome);
  $('botaoConta').title = user.email || '';

  await garantirDocumento(user);
  escutarDados();
});

function iniciaisDe(nome) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

async function garantirDocumento(user) {
  const ref = doc(db, 'usuarios', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      perfil: { nome: user.displayName || '', email: user.email || '', criadoEm: new Date().toISOString() },
      itens: [], concluidas: {}, foco: {}, mente: {}, agua: {}, refeicoes: {}, humor: {},
      lembretes: [], conquistasManuais: {}, pushTokens: [],
      painel: { blocos: painelPadrao() }
    });
    return;
  }
  const dados = snap.data();
  if (dados.tarefas && !dados.itens) {
    // migração automática do formato antigo (só tarefas) pro novo (itens com tipo)
    const itens = dados.tarefas.map(t => ({ ...t, tipo: 'tarefa' }));
    await updateDoc(ref, { itens, tarefas: deleteField() });
  }
  if (!dados.painel || !Array.isArray(dados.painel.blocos) || dados.painel.blocos.length === 0) {
    // migração automática pra quem já tinha conta antes do painel personalizável existir
    await updateDoc(ref, { painel: { blocos: painelPadrao() } });
  }
}

function escutarDados() {
  const ref = doc(db, 'usuarios', uid);
  onSnapshot(ref, snap => {
    dadosUsuario = snap.data();
    if (dadosUsuario) renderizarTudo();
  });
}

// ---------- Data / hora ----------
function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hojeISO() { return dataISO(new Date()); }
function diaSemanaDe(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  return new Date(ano, mes - 1, dia).getDay();
}

// ---------- Itens (tarefa / compromisso / depois / habito / autocuidado) ----------
function aplicaHoje(item, dataStr) {
  if (item.tipo !== 'tarefa' && item.tipo !== 'compromisso') return true;
  const dia = diaSemanaDe(dataStr);
  return !item.dias || item.dias.length === 0 || item.dias.includes(dia);
}
function itensPorTipo(tipo, dataStr = hojeISO()) {
  return (dadosUsuario.itens || [])
    .filter(i => i.ativa && i.tipo === tipo && aplicaHoje(i, dataStr))
    .sort((a, b) => (a.horario || '').localeCompare(b.horario || '') || (a.ordem || 0) - (b.ordem || 0));
}
function itensConcluiveisDoDia(dataStr) {
  const dia = diaSemanaDe(dataStr);
  return (dadosUsuario.itens || []).filter(i => i.ativa && (
    (i.tipo === 'tarefa' && (!i.dias || i.dias.length === 0 || i.dias.includes(dia))) ||
    i.tipo === 'habito' || i.tipo === 'autocuidado'
  ));
}
function diaTemAgenda(dataStr) {
  const dia = diaSemanaDe(dataStr);
  return (dadosUsuario.itens || []).some(i => i.ativa && (i.tipo === 'tarefa' || i.tipo === 'compromisso') &&
    (!i.dias || i.dias.length === 0 || i.dias.includes(dia)));
}
function diaCompleto(dataStr) {
  const itens = itensConcluiveisDoDia(dataStr);
  if (itens.length === 0) return null;
  const feitas = (dadosUsuario.concluidas || {})[dataStr] || [];
  return itens.every(i => feitas.includes(i.id));
}
function estaConcluida(id, data = hojeISO()) {
  return ((dadosUsuario.concluidas || {})[data] || []).includes(id);
}
async function marcarConcluida(id, valor, data = hojeISO()) {
  const mapa = { ...(dadosUsuario.concluidas || {}) };
  const lista = new Set(mapa[data] || []);
  if (valor) lista.add(id); else lista.delete(id);
  mapa[data] = [...lista];
  await updateDoc(doc(db, 'usuarios', uid), { concluidas: mapa });
}
async function excluirItem(id) {
  if (!confirm('Excluir este item? Essa ação não pode ser desfeita.')) return;
  const itens = (dadosUsuario.itens || []).filter(i => i.id !== id);
  await updateDoc(doc(db, 'usuarios', uid), { itens });
}

function criarLinhaItem(item, { data = hojeISO(), comAcoes = false, comChat = false, semCheck = false } = {}) {
  const feita = !semCheck && estaConcluida(item.id, data);
  const li = document.createElement('li');
  li.className = 'item' + (feita ? ' feita' : '');
  li.innerHTML = `
    ${semCheck ? '' : '<button class="marca-check" aria-label="Marcar concluída"><svg><use href="#i-check"/></svg><svg class="patinha"><use href="#i-pata"/></svg></button>'}
    <div class="item-corpo"><p class="item-nome"></p><div class="item-meta"></div></div>
    ${comAcoes ? `<div class="item-acoes">
      ${comChat ? '<button type="button" class="item-acao item-chat" aria-label="Conversar" title="Conversar"><svg><use href="#i-chat"/></svg></button>' : ''}
      <button type="button" class="item-acao item-editar" aria-label="Editar" title="Editar"><svg><use href="#i-editar"/></svg></button>
      <button type="button" class="item-acao item-excluir" aria-label="Excluir" title="Excluir"><svg><use href="#i-lixo"/></svg></button>
    </div>` : ''}
  `;
  li.querySelector('.item-nome').textContent = item.nome;
  const meta = li.querySelector('.item-meta');
  if (item.prioridade) { const s = document.createElement('span'); s.className = 'selo selo-alta'; s.textContent = 'prioridade'; meta.appendChild(s); }
  if (item.categoria) { const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = `${CATEGORIA_ICONE[item.categoria] || ''} ${item.categoria}`; meta.appendChild(s); }
  if (item.horario) { const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = item.horario; meta.appendChild(s); }
  if (item.local) { const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = item.local; meta.appendChild(s); }
  if (!semCheck) {
    li.querySelector('.marca-check').addEventListener('click', () => marcarConcluida(item.id, !feita, data));
  }
  if (comAcoes) {
    li.querySelector('.item-editar').addEventListener('click', () => abrirEdicaoItem(item));
    li.querySelector('.item-excluir').addEventListener('click', () => excluirItem(item.id));
    if (comChat) li.querySelector('.item-chat').addEventListener('click', () => abrirChat(item));
  }
  return li;
}

// ---------- Render geral ----------
function renderizarTudo() {
  renderizarCabecalho();
  renderizarFoco();
  renderizarPrioridades();
  renderizarAgenda();
  renderizarTarefasBloco();
  renderizarDepoisBloco();
  renderizarMente();
  renderizarAutocuidado();
  renderizarHabitos('listaHabitos', 'habitosVazio', true);
  renderizarAgua();
  renderizarRefeicoes();
  renderizarHumor();
  renderizarLembretes();
  renderizarConquistasHoje();
  renderizarRotina();
  aplicarPersonalizacaoPainel();
  montarCalendarioMini();
  montarCalendarioGrande('calGrande', null, 'agenda', true);
  renderizarProgressoConquistas();
  renderizarHabitos('listaHabitosProgresso', 'habitosProgressoVazio', false);
  renderizarProgressoDia();
  if ($('diaDialog').open && diaDialogAtual) abrirDiaDialog(diaDialogAtual);
}

function renderizarCabecalho() {
  const hoje = new Date();
  $('dataHoje').textContent = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = hoje.getHours();
  const nome = (dadosUsuario.perfil?.nome || '').split(' ')[0] || '';
  $('saudacao').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (nome ? `, ${nome}` : '');
  const concluiveis = itensConcluiveisDoDia(hojeISO());
  const feitas = concluiveis.filter(i => estaConcluida(i.id)).length;
  const pct = concluiveis.length ? Math.round((feitas / concluiveis.length) * 100) : 0;
  $('anelProgresso').style.setProperty('--pct', pct);
  $('progressoTexto').textContent = `${feitas}/${concluiveis.length}`;
}

// ---------- Foco de hoje ----------
function renderizarFoco() {
  const hoje = hojeISO();
  const estado = (dadosUsuario.foco || {})[hoje] || { texto: '', feito: false };
  if (document.activeElement !== $('focoInput')) $('focoInput').value = estado.texto || '';
  $('focoLinha').classList.toggle('feita', !!estado.feito);
}
let focoDebounce;
$('focoInput').addEventListener('input', () => {
  clearTimeout(focoDebounce);
  focoDebounce = setTimeout(async () => {
    const hoje = hojeISO();
    const mapa = { ...(dadosUsuario.foco || {}) };
    mapa[hoje] = { ...(mapa[hoje] || {}), texto: $('focoInput').value };
    await updateDoc(doc(db, 'usuarios', uid), { foco: mapa });
  }, 600);
});
$('focoCheck').addEventListener('click', async () => {
  const hoje = hojeISO();
  const mapa = { ...(dadosUsuario.foco || {}) };
  const atual = mapa[hoje] || { texto: '', feito: false };
  mapa[hoje] = { ...atual, feito: !atual.feito };
  await updateDoc(doc(db, 'usuarios', uid), { foco: mapa });
});

// ---------- Prioridades / Agenda / Tarefas / Fazer depois ----------
function renderizarPrioridades() {
  const hoje = hojeISO();
  const itens = itensPorTipo('tarefa', hoje).filter(t => t.prioridade);
  const ul = $('listaPrioridades'); ul.innerHTML = '';
  itens.forEach(item => ul.appendChild(criarLinhaItem(item, { data: hoje })));
  $('prioridadesVazio').hidden = itens.length > 0;
}
function renderizarAgenda() {
  const itens = itensPorTipo('compromisso');
  const ol = $('linhaAgenda'); ol.innerHTML = '';
  itens.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lt-hora"></span><span class="lt-marcador"><span class="lt-ponto"></span><span class="lt-fio"></span></span><div class="lt-corpo"><p class="lt-titulo"></p><p class="lt-local"></p></div>`;
    li.querySelector('.lt-hora').textContent = item.horario || '';
    li.querySelector('.lt-titulo').textContent = item.nome;
    const localEl = li.querySelector('.lt-local');
    if (item.local) localEl.textContent = item.local; else localEl.remove();
    ol.appendChild(li);
  });
  $('agendaVazio').hidden = itens.length > 0;
}
function renderizarTarefasBloco() {
  const hoje = hojeISO();
  const itens = itensPorTipo('tarefa', hoje);
  const ul = $('listaTarefas'); ul.innerHTML = '';
  itens.forEach(item => ul.appendChild(criarLinhaItem(item, { data: hoje, comAcoes: true, comChat: true })));
  $('tarefasVazio').hidden = itens.length > 0;
}
function renderizarDepoisBloco() {
  const itens = itensPorTipo('depois');
  const el = $('listaDepois'); el.innerHTML = '';
  itens.forEach(item => {
    const chip = document.createElement('div'); chip.className = 'chip';
    chip.innerHTML = `<svg><use href="#i-bandeja"/></svg><span></span><button type="button" aria-label="Remover"><svg><use href="#i-x"/></svg></button>`;
    chip.querySelector('span').textContent = item.nome;
    chip.querySelector('button').addEventListener('click', () => excluirItem(item.id));
    el.appendChild(chip);
  });
  $('depoisVazio').hidden = itens.length > 0;
}

// ---------- Descarregar a mente ----------
function renderizarMente() {
  const el = $('menteTexto');
  if (document.activeElement === el) return;
  el.value = (dadosUsuario.mente || {})[hojeISO()] || '';
}
let menteDebounce;
$('menteTexto').addEventListener('input', () => {
  clearTimeout(menteDebounce);
  menteDebounce = setTimeout(async () => {
    const mapa = { ...(dadosUsuario.mente || {}) };
    mapa[hojeISO()] = $('menteTexto').value;
    await updateDoc(doc(db, 'usuarios', uid), { mente: mapa });
  }, 600);
});

// ---------- Autocuidado ----------
function renderizarAutocuidado() {
  const el = $('listaAutocuidado'); el.innerHTML = '';
  const hoje = hojeISO();
  const itens = itensPorTipo('autocuidado');
  itens.forEach(item => {
    const feita = estaConcluida(item.id, hoje);
    const div = document.createElement('div'); div.className = 'toque' + (feita ? ' feita' : '');
    div.innerHTML = `
      <svg><use href="${ICONE_SVG[item.icone] || '#i-coracao'}"/></svg>
      <span class="toque-nome"></span>
      <button type="button" class="toque-marca" aria-label="Marcar concluído"><svg><use href="#i-check"/></svg></button>
      <button type="button" class="toque-lixo" aria-label="Excluir item de autocuidado"><svg><use href="#i-lixo"/></svg></button>
    `;
    div.querySelector('.toque-nome').textContent = item.nome;
    div.querySelector('.toque-marca').addEventListener('click', () => marcarConcluida(item.id, !feita, hoje));
    div.querySelector('.toque-lixo').addEventListener('click', () => excluirItem(item.id));
    el.appendChild(div);
  });
  $('autocuidadoVazio').hidden = itens.length > 0;
}

// ---------- Hábitos ----------
function renderizarHabitos(alvoId, vazioId, interativo) {
  const el = $(alvoId); el.innerHTML = '';
  const habitos = itensPorTipo('habito');
  habitos.forEach(h => {
    const linha = document.createElement('div'); linha.className = 'habito';
    linha.innerHTML = `<span class="habito-nome"></span><div class="habito-dias"></div>`;
    linha.querySelector('.habito-nome').textContent = h.nome;
    const diasEl = linha.querySelector('.habito-dias');
    const hoje = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(d.getDate() - i);
      const dataStr = dataISO(d);
      const feito = estaConcluida(h.id, dataStr);
      const ehHoje = i === 0;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'habito-dia' + (feito ? ' feito' : '') + (ehHoje ? ' hoje-dia' : '');
      dot.disabled = !ehHoje || !interativo;
      dot.setAttribute('aria-label', `${h.nome} em ${dataStr}${feito ? ' (feito)' : ''}`);
      if (ehHoje && interativo) dot.addEventListener('click', () => marcarConcluida(h.id, !feito, dataStr));
      diasEl.appendChild(dot);
    }
    if (interativo) {
      const lixo = document.createElement('button'); lixo.type = 'button'; lixo.className = 'habito-lixo';
      lixo.setAttribute('aria-label', 'Excluir hábito');
      lixo.innerHTML = '<svg><use href="#i-lixo"/></svg>';
      lixo.addEventListener('click', () => excluirItem(h.id));
      linha.appendChild(lixo);
    }
    el.appendChild(linha);
  });
  $(vazioId).hidden = habitos.length > 0;
}

// ---------- Água ----------
function renderizarAgua() {
  const el = $('linhaAgua'); el.innerHTML = '';
  const copos = (dadosUsuario.agua || {})[hojeISO()] || 0;
  for (let i = 1; i <= 8; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gota' + (i <= copos ? ' cheia' : '');
    b.setAttribute('aria-label', `Marcar ${i} copos de água`);
    b.innerHTML = '<svg><use href="#i-gota"/></svg>';
    b.addEventListener('click', () => definirAgua(copos === i ? i - 1 : i));
    el.appendChild(b);
  }
  $('aguaTexto').textContent = copos;
}
async function definirAgua(n) {
  const mapa = { ...(dadosUsuario.agua || {}) };
  mapa[hojeISO()] = n;
  await updateDoc(doc(db, 'usuarios', uid), { agua: mapa });
}

// ---------- Refeições ----------
function renderizarRefeicoes() {
  const mapa = (dadosUsuario.refeicoes || {})[hojeISO()] || {};
  document.querySelectorAll('#refeicoes button').forEach(b => {
    const chave = b.dataset.refeicao;
    const marcada = !!mapa[chave];
    b.classList.toggle('marcada', marcada);
    b.textContent = marcada ? 'comi' : 'ainda não';
    b.onclick = () => definirRefeicao(chave, !marcada);
  });
}
async function definirRefeicao(chave, valor) {
  const hoje = hojeISO();
  const mapa = { ...(dadosUsuario.refeicoes || {}) };
  mapa[hoje] = { ...(mapa[hoje] || {}), [chave]: valor };
  await updateDoc(doc(db, 'usuarios', uid), { refeicoes: mapa });
}

// ---------- Humor e energia ----------
function renderizarHumor() {
  const estado = (dadosUsuario.humor || {})[hojeISO()] || {};
  document.querySelectorAll('#grupoHumor .escala-btn').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.valor === estado.humor));
    b.onclick = () => definirHumor('humor', b.dataset.valor);
  });
  document.querySelectorAll('#grupoEnergia .escala-btn').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.valor === estado.energia));
    b.onclick = () => definirHumor('energia', b.dataset.valor);
  });
}
async function definirHumor(campo, valor) {
  const hoje = hojeISO();
  const mapa = { ...(dadosUsuario.humor || {}) };
  mapa[hoje] = { ...(mapa[hoje] || {}), [campo]: valor };
  await updateDoc(doc(db, 'usuarios', uid), { humor: mapa });
}

// ---------- Não esquecer ----------
function renderizarLembretes() {
  const el = $('listaLembretes'); el.innerHTML = '';
  const lembretes = dadosUsuario.lembretes || [];
  lembretes.forEach(l => {
    const chip = document.createElement('div'); chip.className = 'chip';
    chip.innerHTML = `<svg><use href="#i-pin"/></svg><span></span><button type="button" aria-label="Remover lembrete"><svg><use href="#i-x"/></svg></button>`;
    chip.querySelector('span').textContent = l.texto;
    chip.querySelector('button').addEventListener('click', () => excluirLembrete(l.id));
    el.appendChild(chip);
  });
}
$('formLembrete').addEventListener('submit', async e => {
  e.preventDefault();
  const texto = $('campoLembrete').value.trim();
  if (!texto) return;
  const lembretes = [...(dadosUsuario.lembretes || []), { id: crypto.randomUUID(), texto, criadoEm: new Date().toISOString() }];
  await updateDoc(doc(db, 'usuarios', uid), { lembretes });
  $('campoLembrete').value = '';
});
async function excluirLembrete(id) {
  const lembretes = (dadosUsuario.lembretes || []).filter(l => l.id !== id);
  await updateDoc(doc(db, 'usuarios', uid), { lembretes });
}

// ---------- Mascote ----------
const FRASES_MASCOTE = [
  'Uma coisa de cada vez.',
  'Pequenos passos também contam.',
  'Tudo bem continuar depois.',
  'Hoje você fez o que conseguiu.'
];
const fraseMascoteSessao = FRASES_MASCOTE[Math.floor(Math.random() * FRASES_MASCOTE.length)];

// ---------- Conquistas do dia ----------
function calcularConquistasAutomaticas() {
  const hoje = hojeISO();
  const badges = [];
  const prioridades = itensPorTipo('tarefa').filter(t => t.prioridade);
  if (prioridades.length > 0 && prioridades.every(t => estaConcluida(t.id))) badges.push('Todas as prioridades concluídas');
  const autocuidados = itensPorTipo('autocuidado');
  if (autocuidados.length > 0 && autocuidados.every(a => estaConcluida(a.id))) badges.push('Autocuidado em dia');
  if (((dadosUsuario.agua || {})[hoje] || 0) >= 8) badges.push('Meta de água batida');
  const foco = (dadosUsuario.foco || {})[hoje];
  if (foco && foco.feito) badges.push('Foco do dia concluído');
  return badges;
}
function renderizarConquistasHoje() {
  const hoje = hojeISO();
  const el = $('medalhas'); el.innerHTML = '';
  const auto = calcularConquistasAutomaticas();
  const manuais = (dadosUsuario.conquistasManuais || {})[hoje] || [];
  auto.forEach(texto => {
    const b = document.createElement('span'); b.className = 'medalha';
    b.innerHTML = '<svg><use href="#i-pata"/></svg><span></span>';
    b.querySelector('span').textContent = texto;
    el.appendChild(b);
  });
  manuais.forEach(c => {
    const b = document.createElement('span'); b.className = 'medalha';
    b.innerHTML = '<svg><use href="#i-pata"/></svg><span></span><button type="button" aria-label="Remover conquista"><svg><use href="#i-x"/></svg></button>';
    b.querySelector('span').textContent = c.texto;
    b.querySelector('button').addEventListener('click', () => excluirConquistaManual(c.id));
    el.appendChild(b);
  });
  $('conquistasVazioTexto').textContent = fraseMascoteSessao;
  $('conquistasVazio').hidden = (auto.length + manuais.length) > 0;
}
$('formConquista').addEventListener('submit', async e => {
  e.preventDefault();
  const texto = $('campoConquista').value.trim();
  if (!texto) return;
  const hoje = hojeISO();
  const mapa = { ...(dadosUsuario.conquistasManuais || {}) };
  mapa[hoje] = [...(mapa[hoje] || []), { id: crypto.randomUUID(), texto }];
  await updateDoc(doc(db, 'usuarios', uid), { conquistasManuais: mapa });
  $('campoConquista').value = '';
});
async function excluirConquistaManual(id) {
  const hoje = hojeISO();
  const mapa = { ...(dadosUsuario.conquistasManuais || {}) };
  mapa[hoje] = (mapa[hoje] || []).filter(c => c.id !== id);
  await updateDoc(doc(db, 'usuarios', uid), { conquistasManuais: mapa });
}

// ---------- Rotina (gestão de todos os itens) ----------
function renderizarRotina() {
  const grupos = {
    tarefa: $('rotinaTarefas'), compromisso: $('rotinaCompromissos'), depois: $('rotinaDepois'),
    habito: $('rotinaHabitos'), autocuidado: $('rotinaAutocuidado')
  };
  Object.values(grupos).forEach(ul => ul.innerHTML = '');
  (dadosUsuario.itens || []).filter(i => i.ativa).forEach(item => {
    const ul = grupos[item.tipo];
    if (!ul) return;
    const semCheck = item.tipo === 'compromisso' || item.tipo === 'depois';
    const comChat = item.tipo === 'tarefa';
    ul.appendChild(criarLinhaItem(item, { data: hojeISO(), comAcoes: true, comChat, semCheck }));
  });
}

// ---------- Calendários ----------
const NOMES_DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CATEGORIA_COR_DOT = { tarefa: 'lilas', compromisso: 'ceu', autocuidado: 'menta' };
let mesExibidoOffset = 0;

function categoriasDoDia(dataStr) {
  const dia = diaSemanaDe(dataStr);
  const cores = new Set();
  (dadosUsuario.itens || []).forEach(i => {
    if (!i.ativa) return;
    if ((i.tipo === 'tarefa' || i.tipo === 'compromisso') && (!i.dias || i.dias.length === 0 || i.dias.includes(dia))) {
      cores.add(CATEGORIA_COR_DOT[i.tipo]);
    }
    if (i.tipo === 'autocuidado') cores.add(CATEGORIA_COR_DOT.autocuidado);
  });
  return [...cores];
}

function montarCalendarioMini() {
  const el = $('miniCalendario'); if (!el) return;
  el.innerHTML = '';
  const hoje = new Date();
  const cab = document.createElement('div'); cab.className = 'mini-cal-cab';
  cab.innerHTML = '<span></span>';
  cab.querySelector('span').textContent = hoje.toLocaleDateString('pt-BR', { month: 'short' });
  el.appendChild(cab);
  const grade = document.createElement('div'); grade.className = 'mini-cal-grade';
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  for (let i = 0; i < primeiro.getDay(); i++) grade.appendChild(document.createElement('span'));
  for (let d = 1; d <= diasNoMes; d++) {
    const dataStr = dataISO(new Date(ano, mes, d));
    const span = document.createElement('span');
    span.className = 'dia' + (dataStr === hojeISO() ? ' hoje' : '') + (diaTemAgenda(dataStr) ? ' tem-item' : '');
    span.textContent = d;
    grade.appendChild(span);
  }
  el.appendChild(grade);
}

function montarCabecalhoSemana(el) {
  const linha = document.createElement('div');
  linha.className = 'cal-semana';
  NOMES_DIA_SEMANA.forEach(nome => {
    const span = document.createElement('span');
    span.textContent = nome;
    linha.appendChild(span);
  });
  el.appendChild(linha);
}

function montarCalendarioGrande(alvoId, tituloId, modo, comNavegacao = false) {
  const el = $(alvoId); if (!el) return;
  el.innerHTML = '';
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() + (comNavegacao ? mesExibidoOffset : 0), 1);
  const ano = base.getFullYear(), mes = base.getMonth();
  const titulo = base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const tituloFormatado = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  if (tituloId && !comNavegacao) $(tituloId).textContent = tituloFormatado;
  if (comNavegacao) {
    const nav = document.createElement('div'); nav.className = 'cal-nav-topo';
    const btnAnt = document.createElement('button');
    btnAnt.type = 'button'; btnAnt.className = 'cal-nav-btn'; btnAnt.setAttribute('aria-label', 'Mês anterior');
    btnAnt.innerHTML = '<svg><use href="#i-seta-esq"/></svg>';
    btnAnt.addEventListener('click', () => { mesExibidoOffset--; renderizarTudo(); });
    const h3 = document.createElement('h3'); h3.className = 'cal-mes-titulo'; h3.textContent = tituloFormatado;
    const btnProx = document.createElement('button');
    btnProx.type = 'button'; btnProx.className = 'cal-nav-btn'; btnProx.setAttribute('aria-label', 'Próximo mês');
    btnProx.innerHTML = '<svg><use href="#i-seta-dir"/></svg>';
    btnProx.addEventListener('click', () => { mesExibidoOffset++; renderizarTudo(); });
    nav.append(btnAnt, h3, btnProx);
    el.appendChild(nav);
    if (mesExibidoOffset !== 0) {
      const btnHoje = document.createElement('button');
      btnHoje.type = 'button'; btnHoje.className = 'cal-nav-hoje'; btnHoje.textContent = 'Voltar pra hoje';
      btnHoje.addEventListener('click', () => { mesExibidoOffset = 0; renderizarTudo(); });
      el.appendChild(btnHoje);
    }
  }
  montarCabecalhoSemana(el);
  const grade = document.createElement('div'); grade.className = 'cal-grade';
  const primeiro = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  for (let i = 0; i < primeiro.getDay(); i++) {
    const vazio = document.createElement('span');
    vazio.className = 'dia dia-vazia';
    grade.appendChild(vazio);
  }
  for (let d = 1; d <= diasNoMes; d++) {
    const dataObj = new Date(ano, mes, d);
    const dataStr = dataISO(dataObj);
    const btn = document.createElement('button');
    btn.type = 'button';
    let classe = 'dia clicavel';
    if (dataStr === hojeISO()) classe += ' hoje';
    if (modo === 'progresso' && dataObj <= hoje) {
      const completo = diaCompleto(dataStr);
      if (completo === true) classe += ' completo';
      else if (completo === false) classe += ' incompleto';
    }
    btn.className = classe;
    btn.innerHTML = `<span class="cal-dia-numero">${d}</span><span class="cal-dia-pontos"></span>`;
    const pontosEl = btn.querySelector('.cal-dia-pontos');
    categoriasDoDia(dataStr).slice(0, 3).forEach(cor => {
      const ponto = document.createElement('span');
      ponto.className = 'cal-ponto cal-ponto-' + cor;
      pontosEl.appendChild(ponto);
    });
    btn.setAttribute('aria-label', dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    btn.addEventListener('click', () => abrirDiaDialog(dataStr));
    grade.appendChild(btn);
  }
  el.appendChild(grade);
}

function abrirDiaDialog(dataStr) {
  diaDialogAtual = dataStr;
  $('diaDialogTitulo').textContent = new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const ul = $('listaDiaDialog'); ul.innerHTML = '';
  const itens = itensConcluiveisDoDia(dataStr).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
  $('diaDialogVazio').hidden = itens.length > 0;
  itens.forEach(item => ul.appendChild(criarLinhaItem(item, { data: dataStr })));
  if (!$('diaDialog').open) $('diaDialog').showModal();
}
$('fecharDiaDialog').addEventListener('click', () => { $('diaDialog').close(); diaDialogAtual = null; });

// ---------- Diálogo de novo item / editar item ----------
function atualizarCamposTipo() {
  const tipo = $('campoTipo').value;
  $('grupoCategoria').hidden = !(tipo === 'tarefa' || tipo === 'depois');
  $('grupoHorario').hidden = !(tipo === 'tarefa' || tipo === 'compromisso');
  $('grupoLocal').hidden = tipo !== 'compromisso';
  $('grupoDias').hidden = !(tipo === 'tarefa' || tipo === 'compromisso');
  $('grupoIcone').hidden = tipo !== 'autocuidado';
  $('grupoPrioridade').hidden = tipo !== 'tarefa';
  $('campoHorario').required = (tipo === 'tarefa' || tipo === 'compromisso');
}
$('campoTipo').addEventListener('change', atualizarCamposTipo);

function abrirNovoItem(tipo) {
  itemEmEdicao = null;
  $('itemForm').reset();
  $('campoTipo').value = tipo;
  atualizarCamposTipo();
  $('itemDialogTitulo').textContent = 'Novo item';
  $('excluirItem').hidden = true;
  $('prioridadeAviso').hidden = true;
  $('itemDialog').showModal();
}
function abrirEdicaoItem(item) {
  itemEmEdicao = item;
  $('campoTipo').value = item.tipo;
  atualizarCamposTipo();
  $('campoNome').value = item.nome || '';
  $('campoCategoria').value = item.categoria || 'higiene';
  $('campoHorario').value = item.horario || '';
  $('campoLocal').value = item.local || '';
  const diasAtivos = new Set(item.dias && item.dias.length ? item.dias : [0,1,2,3,4,5,6]);
  document.querySelectorAll('#diasGrade input').forEach(i => { i.checked = diasAtivos.has(Number(i.value)); });
  document.querySelectorAll('#iconeEscolha input').forEach(i => { i.checked = i.value === (item.icone || 'comprimido'); });
  $('campoPrioridade').checked = !!item.prioridade;
  $('itemDialogTitulo').textContent = 'Editar item';
  $('excluirItem').hidden = false;
  $('prioridadeAviso').hidden = true;
  $('itemDialog').showModal();
}

$('addTarefaBtn').addEventListener('click', () => abrirNovoItem('tarefa'));
$('addDepoisBtn').addEventListener('click', () => abrirNovoItem('depois'));
$('addAutocuidadoBtn').addEventListener('click', () => abrirNovoItem('autocuidado'));
$('addHabitoBtn').addEventListener('click', () => abrirNovoItem('habito'));
$('novoItemBtnRotina').addEventListener('click', () => abrirNovoItem('tarefa'));
$('cancelarItem').addEventListener('click', () => { $('itemDialog').close(); itemEmEdicao = null; });
$('excluirItem').addEventListener('click', async () => {
  if (!itemEmEdicao) return;
  if (!confirm('Excluir este item? Essa ação não pode ser desfeita.')) return;
  const itens = (dadosUsuario.itens || []).filter(i => i.id !== itemEmEdicao.id);
  await updateDoc(doc(db, 'usuarios', uid), { itens });
  $('itemDialog').close();
  itemEmEdicao = null;
});

$('itemForm').addEventListener('submit', async e => {
  const tipo = $('campoTipo').value;
  const prioridade = tipo === 'tarefa' && $('campoPrioridade').checked;
  if (prioridade) {
    const outras = (dadosUsuario.itens || []).filter(i =>
      i.tipo === 'tarefa' && i.ativa && i.prioridade && (!itemEmEdicao || i.id !== itemEmEdicao.id));
    if (outras.length >= 3) {
      e.preventDefault();
      $('prioridadeAviso').hidden = false;
      return;
    }
  }
  $('prioridadeAviso').hidden = true;
  const dias = [...document.querySelectorAll('#diasGrade input:checked')].map(i => Number(i.value));
  const icone = document.querySelector('#iconeEscolha input:checked')?.value || 'comprimido';
  const campos = { tipo, nome: $('campoNome').value.trim() };
  if (tipo === 'tarefa' || tipo === 'depois') campos.categoria = $('campoCategoria').value;
  if (tipo === 'tarefa' || tipo === 'compromisso') { campos.horario = $('campoHorario').value; campos.dias = dias; }
  if (tipo === 'compromisso') campos.local = $('campoLocal').value.trim();
  if (tipo === 'autocuidado') campos.icone = icone;
  if (tipo === 'tarefa') campos.prioridade = prioridade;

  let itens;
  if (itemEmEdicao) {
    itens = (dadosUsuario.itens || []).map(i => i.id === itemEmEdicao.id ? { ...i, ...campos } : i);
  } else {
    itens = [...(dadosUsuario.itens || []), {
      id: crypto.randomUUID(), ...campos, ativa: true,
      ordem: (dadosUsuario.itens || []).length, criadoEm: new Date().toISOString()
    }];
  }
  await updateDoc(doc(db, 'usuarios', uid), { itens });
  itemEmEdicao = null;
});

// ---------- Progresso (dia / semana / mês) ----------
document.querySelectorAll('#progressoSeletor .escala-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#progressoSeletor .escala-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    ['progressoDia', 'progressoSemana', 'progressoMes'].forEach(id => {
      $(id).hidden = id !== 'progresso' + btn.dataset.alvo.charAt(0).toUpperCase() + btn.dataset.alvo.slice(1);
    });
  });
});

function renderizarProgressoDia() {
  const hoje = hojeISO();
  const itens = itensConcluiveisDoDia(hoje).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
  const ul = $('listaProgressoDia'); ul.innerHTML = '';
  itens.forEach(item => ul.appendChild(criarLinhaItem(item, { data: hoje })));
  $('progressoDiaVazio').hidden = itens.length > 0;
}

// ---------- Progresso (mês) ----------
function renderizarProgressoConquistas() {
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  let streakAtual = 0, maiorStreak = 0, diasCompletos = 0, diasComItem = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dataObj = new Date(ano, mes, d);
    if (dataObj > hoje) break;
    const dataStr = dataISO(dataObj);
    const completo = diaCompleto(dataStr);
    if (completo !== null) diasComItem++;
    if (completo === true) { diasCompletos++; streakAtual++; maiorStreak = Math.max(maiorStreak, streakAtual); }
    else if (completo === false) { streakAtual = 0; }
  }
  const badges = [];
  if (diasCompletos >= 1) badges.push('Primeiro dia completo');
  if (maiorStreak >= 3) badges.push('Sequência de 3 dias');
  if (maiorStreak >= 7) badges.push('Sequência de 7 dias');
  if (diasComItem > 0 && diasCompletos === diasComItem) badges.push('Mês perfeito até agora');
  const el = $('progMesConquistas'); el.innerHTML = '';
  if (badges.length === 0) {
    const p = document.createElement('p'); p.className = 'bloco-sub';
    p.textContent = 'Ainda sem conquistas este mês — comece marcando suas tarefas.';
    el.appendChild(p);
    return;
  }
  badges.forEach(texto => {
    const span = document.createElement('span'); span.className = 'medalha';
    span.innerHTML = '<svg><use href="#i-pata"/></svg><span></span>';
    span.querySelector('span').textContent = texto;
    el.appendChild(span);
  });
}

// ---------- Painel personalizável ----------
function resolverAparenciaBloco(entry) {
  const padrao = BLOCOS_SISTEMA[entry.id];
  return {
    titulo: entry.titulo || (padrao ? padrao.titulo : 'Novo card'),
    icone: entry.icone || (padrao ? padrao.icone : 'i-estrela'),
    cor: entry.cor || (padrao ? padrao.cor : 'lilas')
  };
}
function encontrarBloco(id) {
  return ((dadosUsuario.painel && dadosUsuario.painel.blocos) || []).find(b => b.id === id);
}
function atualizarBloco(id, mudancas) {
  const blocos = ((dadosUsuario.painel && dadosUsuario.painel.blocos) || []).map(b => b.id === id ? { ...b, ...mudancas } : b);
  return updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
}

function garantirControlesEdicao(el, id) {
  const cab = el.querySelector('.bloco-cab');
  if (!cab) return;
  let controles = cab.querySelector('.bloco-controles');
  if (!controles) {
    controles = document.createElement('div');
    controles.className = 'bloco-controles';
    // move qualquer botão de ação já existente (ex: "+" de adicionar item) pra dentro da envoltória
    [...cab.children].forEach(filho => {
      if (filho !== cab.querySelector('.bloco-titulo-grupo')) controles.appendChild(filho);
    });
    cab.appendChild(controles);
  }
  if (!controles.querySelector('.arrastar-alca')) {
    const alca = document.createElement('button');
    alca.type = 'button'; alca.className = 'arrastar-alca'; alca.tabIndex = 0;
    alca.setAttribute('aria-label', 'Reordenar bloco');
    alca.innerHTML = '<svg><use href="#i-alca"/></svg>';
    controles.insertBefore(alca, controles.firstChild);
  }
  if (!controles.querySelector('.bloco-opcoes-btn')) {
    const opcoes = document.createElement('button');
    opcoes.type = 'button'; opcoes.className = 'bloco-opcoes-btn';
    opcoes.setAttribute('aria-label', 'Opções do card');
    opcoes.innerHTML = '<svg><use href="#i-tres-pontos"/></svg>';
    opcoes.addEventListener('click', () => abrirEdicaoBloco(id));
    controles.appendChild(opcoes);
  }
}

function criarBlocoPersonalizado(entry) {
  const el = document.createElement('article');
  el.className = 'bloco'; el.draggable = true; el.dataset.id = entry.id;
  el.innerHTML = `
    <div class="bloco-cab">
      <div class="bloco-titulo-grupo">
        <span class="bloco-icone"><svg><use href="#i-estrela"/></svg></span>
        <span class="bloco-titulo"></span>
      </div>
    </div>
    <ul class="lista-itens" data-lista-personalizada></ul>
    <p class="bloco-sub" data-vazio-personalizada hidden>Nada por aqui ainda.</p>
    <form class="bloco-personalizado-form">
      <input type="text" maxlength="60" placeholder="Adicionar item…">
      <button type="submit" class="botao-icone-destaque" aria-label="Adicionar item"><svg><use href="#i-mais"/></svg></button>
    </form>
  `;
  el.querySelector('.bloco-personalizado-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const texto = input.value.trim();
    if (!texto) return;
    adicionarItemPersonalizado(entry.id, texto);
    input.value = '';
  });
  return el;
}

function renderizarItensPersonalizado(entry, el) {
  const ul = el.querySelector('[data-lista-personalizada]');
  const vazio = el.querySelector('[data-vazio-personalizada]');
  if (!ul) return;
  ul.innerHTML = '';
  const itensBloco = entry.itens || [];
  itensBloco.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item' + (item.feita ? ' feita' : '');
    li.innerHTML = `
      <button class="marca-check" aria-label="Marcar concluído"><svg><use href="#i-check"/></svg><svg class="patinha"><use href="#i-pata"/></svg></button>
      <div class="item-corpo"><p class="item-nome"></p></div>
      <div class="item-acoes"><button type="button" class="item-acao" aria-label="Excluir item"><svg><use href="#i-lixo"/></svg></button></div>
    `;
    li.querySelector('.item-nome').textContent = item.texto;
    li.querySelector('.marca-check').addEventListener('click', () => alternarItemPersonalizado(entry.id, item.id));
    li.querySelector('.item-acao').addEventListener('click', () => excluirItemPersonalizado(entry.id, item.id));
    ul.appendChild(li);
  });
  if (vazio) vazio.hidden = itensBloco.length > 0;
}
async function adicionarItemPersonalizado(id, texto) {
  const bloco = encontrarBloco(id); if (!bloco) return;
  const itens = [...(bloco.itens || []), { id: crypto.randomUUID(), texto, feita: false }];
  await atualizarBloco(id, { itens });
}
async function alternarItemPersonalizado(id, itemId) {
  const bloco = encontrarBloco(id); if (!bloco) return;
  const itens = (bloco.itens || []).map(i => i.id === itemId ? { ...i, feita: !i.feita } : i);
  await atualizarBloco(id, { itens });
}
async function excluirItemPersonalizado(id, itemId) {
  const bloco = encontrarBloco(id); if (!bloco) return;
  const itens = (bloco.itens || []).filter(i => i.id !== itemId);
  await atualizarBloco(id, { itens });
}

function aplicarPersonalizacaoPainel() {
  const painel = $('painel');
  const blocos = (dadosUsuario.painel && dadosUsuario.painel.blocos && dadosUsuario.painel.blocos.length)
    ? dadosUsuario.painel.blocos : painelPadrao();
  const idsVistos = new Set();
  blocos.forEach(entry => {
    idsVistos.add(entry.id);
    let el = [...painel.children].find(c => c.dataset.id === entry.id);
    if (!el) {
      if (entry.tipo !== 'personalizado') return;
      el = criarBlocoPersonalizado(entry);
    }
    painel.appendChild(el);
    el.hidden = !!entry.oculto;
    el.classList.toggle('bloco--larga', entry.largura === 'larga');
    const aparencia = resolverAparenciaBloco(entry);
    el.dataset.cor = aparencia.cor;
    const iconeUse = el.querySelector('.bloco-icone svg use');
    if (iconeUse) iconeUse.setAttribute('href', '#' + aparencia.icone);
    const tituloEl = el.querySelector('.bloco-titulo');
    if (tituloEl) tituloEl.textContent = aparencia.titulo;
    garantirControlesEdicao(el, entry.id);
    if (entry.tipo === 'personalizado') renderizarItensPersonalizado(entry, el);
  });
  [...painel.querySelectorAll('.bloco[data-id^="custom-"]')].forEach(el => {
    if (!idsVistos.has(el.dataset.id)) el.remove();
  });
  painel.classList.toggle('modo-personalizar', modoPersonalizar);
  renderizarCardsOcultos(blocos);
}

function renderizarCardsOcultos(blocos) {
  const secao = $('cardsOcultos');
  const lista = $('listaCardsOcultos');
  const ocultos = blocos.filter(b => b.oculto);
  lista.innerHTML = '';
  secao.hidden = !modoPersonalizar || ocultos.length === 0;
  ocultos.forEach(b => {
    const aparencia = resolverAparenciaBloco(b);
    const chip = document.createElement('div'); chip.className = 'card-oculto-chip';
    chip.innerHTML = '<span></span><button type="button"><svg><use href="#i-olho"/></svg>Mostrar</button>';
    chip.querySelector('span').textContent = aparencia.titulo;
    chip.querySelector('button').addEventListener('click', () => atualizarBloco(b.id, { oculto: false }));
    lista.appendChild(chip);
  });
}

// ---------- Diálogo de opções do card ----------
$('iconeEscolhaBloco').innerHTML = ICONES_ESCOLHA_BLOCO
  .map(ic => `<label><input type="radio" name="iconeBloco" value="${ic}"><svg><use href="#${ic}"/></svg></label>`)
  .join('');

function abrirEdicaoBloco(id) {
  const bloco = encontrarBloco(id);
  if (!bloco) return;
  blocoEmEdicao = bloco;
  const aparencia = resolverAparenciaBloco(bloco);
  $('blocoDialogTitulo').textContent = 'Opções — ' + aparencia.titulo;
  $('campoBlocoTitulo').value = bloco.titulo || '';
  $('campoBlocoTitulo').placeholder = aparencia.titulo;
  document.querySelectorAll('#corEscolha input').forEach(i => { i.checked = i.value === aparencia.cor; });
  document.querySelectorAll('#iconeEscolhaBloco input').forEach(i => { i.checked = i.value === aparencia.icone; });
  $('campoBlocoLarga').checked = bloco.largura === 'larga';
  $('excluirBlocoBtn').hidden = bloco.tipo !== 'personalizado';
  $('ocultarBlocoBtn').innerHTML = bloco.oculto
    ? '<svg><use href="#i-olho"/></svg> Mostrar'
    : '<svg><use href="#i-olho-fechado"/></svg> Ocultar';
  $('blocoDialog').showModal();
}

$('blocoForm').addEventListener('submit', async () => {
  if (!blocoEmEdicao) return;
  const titulo = $('campoBlocoTitulo').value.trim();
  const cor = document.querySelector('#corEscolha input:checked')?.value || null;
  const icone = document.querySelector('#iconeEscolhaBloco input:checked')?.value || null;
  const largura = $('campoBlocoLarga').checked ? 'larga' : 'normal';
  await atualizarBloco(blocoEmEdicao.id, { titulo: titulo || null, cor, icone, largura });
  blocoEmEdicao = null;
});
$('fecharBlocoDialog').addEventListener('click', () => { $('blocoDialog').close(); blocoEmEdicao = null; });

$('ocultarBlocoBtn').addEventListener('click', async () => {
  if (!blocoEmEdicao) return;
  await atualizarBloco(blocoEmEdicao.id, { oculto: !blocoEmEdicao.oculto });
  $('blocoDialog').close();
  blocoEmEdicao = null;
});

$('duplicarBlocoBtn').addEventListener('click', async () => {
  if (!blocoEmEdicao) return;
  const aparencia = resolverAparenciaBloco(blocoEmEdicao);
  const novo = {
    id: 'custom-' + crypto.randomUUID(), tipo: 'personalizado', oculto: false,
    largura: blocoEmEdicao.largura || 'normal', cor: aparencia.cor, icone: aparencia.icone,
    titulo: aparencia.titulo + ' (cópia)',
    itens: blocoEmEdicao.tipo === 'personalizado' ? (blocoEmEdicao.itens || []).map(i => ({ ...i, id: crypto.randomUUID() })) : []
  };
  const blocos = [...((dadosUsuario.painel && dadosUsuario.painel.blocos) || []), novo];
  await updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
  $('blocoDialog').close();
  blocoEmEdicao = null;
});

$('excluirBlocoBtn').addEventListener('click', async () => {
  if (!blocoEmEdicao || blocoEmEdicao.tipo !== 'personalizado') return;
  if (!confirm('Excluir este card personalizado? Essa ação não pode ser desfeita.')) return;
  const blocos = ((dadosUsuario.painel && dadosUsuario.painel.blocos) || []).filter(b => b.id !== blocoEmEdicao.id);
  await updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
  $('blocoDialog').close();
  blocoEmEdicao = null;
});

// ---------- Modo "Personalizar painel" ----------
function sairDoModoPersonalizar() {
  modoPersonalizar = false;
  painelSnapshotAntes = null;
  $('interruptorPersonalizar').setAttribute('aria-pressed', 'false');
  $('barraPersonalizar').hidden = true;
  aplicarPersonalizacaoPainel();
}
$('interruptorPersonalizar').addEventListener('click', () => {
  if (modoPersonalizar) { sairDoModoPersonalizar(); return; }
  painelSnapshotAntes = JSON.parse(JSON.stringify((dadosUsuario.painel && dadosUsuario.painel.blocos) || painelPadrao()));
  modoPersonalizar = true;
  $('interruptorPersonalizar').setAttribute('aria-pressed', 'true');
  $('barraPersonalizar').hidden = false;
  aplicarPersonalizacaoPainel();
});
$('adicionarCardBtn').addEventListener('click', async () => {
  const novo = {
    id: 'custom-' + crypto.randomUUID(), tipo: 'personalizado', oculto: false,
    largura: 'normal', cor: 'lilas', icone: 'i-estrela', titulo: 'Novo card', itens: []
  };
  const blocos = [...((dadosUsuario.painel && dadosUsuario.painel.blocos) || []), novo];
  await updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
  abrirEdicaoBloco(novo.id);
});
$('restaurarPadraoBtn').addEventListener('click', async () => {
  if (!confirm('Restaurar a organização padrão? Os cards personalizados continuam existindo, mas os de sistema voltam pra ordem, cor e visibilidade originais.')) return;
  const personalizados = ((dadosUsuario.painel && dadosUsuario.painel.blocos) || []).filter(b => b.tipo === 'personalizado');
  const blocos = [...painelPadrao(), ...personalizados];
  await updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
});
$('cancelarPersonalizarBtn').addEventListener('click', async () => {
  if (painelSnapshotAntes) {
    await updateDoc(doc(db, 'usuarios', uid), { painel: { blocos: painelSnapshotAntes } });
  }
  sairDoModoPersonalizar();
});
$('concluirPersonalizarBtn').addEventListener('click', sairDoModoPersonalizar);

// ---------- Reordenar blocos (arrastar + teclado, só no modo personalizar) ----------
(function ligarReordenacao() {
  const painel = $('painel');
  let arrastando = null;

  painel.addEventListener('dragstart', e => {
    if (!modoPersonalizar) { e.preventDefault(); return; }
    const bloco = e.target.closest('.bloco');
    if (!bloco) return;
    arrastando = bloco;
    bloco.classList.add('arrastando');
  });
  painel.addEventListener('dragend', e => {
    const bloco = e.target.closest('.bloco');
    if (bloco) bloco.classList.remove('arrastando');
    if (arrastando) { arrastando = null; salvarOrdemBlocos(); }
  });
  painel.addEventListener('dragover', e => {
    const bloco = e.target.closest('.bloco');
    if (!arrastando || !bloco || bloco === arrastando) return;
    e.preventDefault();
    const filhos = [...painel.children];
    const depois = filhos.indexOf(bloco) > filhos.indexOf(arrastando);
    painel.insertBefore(arrastando, depois ? bloco.nextSibling : bloco);
  });
  painel.addEventListener('keydown', e => {
    const alca = e.target.closest('.arrastar-alca');
    if (!alca || !modoPersonalizar) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const bloco = alca.closest('.bloco');
    e.preventDefault();
    const irmao = e.key === 'ArrowUp' ? bloco.previousElementSibling : bloco.nextElementSibling;
    if (!irmao) return;
    if (e.key === 'ArrowUp') painel.insertBefore(bloco, irmao); else painel.insertBefore(irmao, bloco);
    alca.focus();
    salvarOrdemBlocos();
  });

  function salvarOrdemBlocos() {
    const ordemIds = [...painel.children].map(b => b.dataset.id);
    const atuais = (dadosUsuario.painel && dadosUsuario.painel.blocos) || painelPadrao();
    const porId = new Map(atuais.map(b => [b.id, b]));
    const blocos = ordemIds.map(id => porId.get(id)).filter(Boolean);
    updateDoc(doc(db, 'usuarios', uid), { painel: { blocos } });
  }
})();

// ---------- Notificações (FCM) ----------
$('notifBtn').addEventListener('click', async () => { await ativarNotificacoes(); });

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
function abrirChat(item) {
  itemAtualChat = item;
  $('chatTitulo').textContent = item.nome;
  $('chatMensagens').innerHTML = '';
  adicionarMensagem('ia', `Sobre "${item.nome}": o que está travando agora? Pode ser cansaço, não saber por onde começar, ou só falta de vontade mesmo — qualquer motivo vale.`);
  $('chatDialog').showModal();
}
$('fecharChat').addEventListener('click', () => $('chatDialog').close());

$('chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const texto = $('chatInput').value.trim();
  if (!texto) return;
  adicionarMensagem('eu', texto);
  $('chatInput').value = '';
  try {
    const resposta = await pedirAjudaIA(itemAtualChat, texto);
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

async function pedirAjudaIA(item, mensagem) {
  const resp = await fetch(WORKER_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarefa: item.nome, categoria: item.categoria || item.tipo, mensagem })
  });
  if (!resp.ok) throw new Error('falha no chat');
  const data = await resp.json();
  return data.resposta;
}
