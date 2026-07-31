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
    id, tipo: 'sistema', oculto: false, cor: null, icone: null, titulo: null
  }));
}

let uid = null;
let dadosRaiz = null;     // documento usuarios/{uid} cru, como veio do Firestore
let dadosUsuario = null;  // dadosRaiz + histórico mensal mesclado — é isso que o resto do app lê
let itemAtualChat = null;
let itemEmEdicao = null;
let diaDialogAtual = null;
let blocoEmEdicao = null;

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
  $('fonteResetar').hidden = indice === 0;
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
$('fonteResetar').addEventListener('click', () => {
  localStorage.setItem('fonte', 'normal');
  aplicarFonte('normal');
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
    // A aba que acabou de aparecer pode não ter sido renderizada enquanto
    // estava escondida (ver renderizarAbaVisivel) — renderiza agora que apareceu.
    if (dadosUsuario) renderizarAbaVisivel();
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

let cancelarEscutaDados = null;
let cancelarEscutaHistoricoAtual = null;
function escutarDados() {
  // Nunca deixar mais de um listener ativo: se escutarDados() for chamado de
  // novo (ex: onAuthStateChanged disparando outra vez), cancela os anteriores.
  if (cancelarEscutaDados) { cancelarEscutaDados(); cancelarEscutaDados = null; }
  if (cancelarEscutaHistoricoAtual) { cancelarEscutaHistoricoAtual(); cancelarEscutaHistoricoAtual = null; }
  historicoPorMes.clear();

  const ref = doc(db, 'usuarios', uid);
  cancelarEscutaDados = onSnapshot(ref, snap => {
    dadosRaiz = snap.data();
    mostrarAvisoConexao(false);
    remontarDadosMesclados();
    if (dadosUsuario) renderizarTudo();
  }, erro => {
    console.error('Erro ao escutar dados do Firestore:', erro);
    mostrarAvisoConexao(true);
  });

  // Histórico do mês atual (concluidas/foco/mente/agua/refeicoes/humor/
  // conquistas) mora num documento separado, pra não fazer o documento
  // principal crescer pra sempre — ver escutarHistorico().
  const mesAtual = mesAtualChave();
  const refHist = doc(db, 'usuarios', uid, 'historico', mesAtual);
  cancelarEscutaHistoricoAtual = onSnapshot(refHist, snap => {
    historicoPorMes.set(mesAtual, snap.exists() ? snap.data() : null);
    remontarDadosMesclados();
    if (dadosUsuario) renderizarTudo();
  }, erro => {
    console.error('Erro ao escutar histórico do mês atual:', erro);
  });

  // Meses vizinhos: só uma leitura pontual (sem listener), pra navegar o
  // calendário pra trás/frente continuar funcionando sem precisar deixar a
  // renderização inteira assíncrona.
  for (let deslocamento = -3; deslocamento <= 3; deslocamento++) {
    if (deslocamento === 0) continue;
    precarregarMesHistorico(deslocarMes(mesAtual, deslocamento));
  }
}

function mostrarAvisoConexao(mostrar) {
  const el = $('conexaoAviso');
  if (el) el.hidden = !mostrar;
}
window.addEventListener('offline', () => mostrarAvisoConexao(true));
window.addEventListener('online', () => mostrarAvisoConexao(false));

// ---------- Data / hora ----------
function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hojeISO() { return dataISO(new Date()); }
function diaSemanaDe(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  return new Date(ano, mes - 1, dia).getDay();
}

// ---------- Histórico mensal ----------
// concluidas/foco/mente/agua/refeicoes/humor/conquistasManuais cresciam pra
// sempre dentro de usuarios/{uid}. A partir de agora, gravação nova desses
// campos vai pra usuarios/{uid}/historico/AAAA-MM (um documento por mês) —
// o que já existe no documento principal fica exatamente onde está, nunca é
// apagado nem movido; só passa a não crescer mais.
const CAMPOS_HISTORICO = ['concluidas', 'foco', 'mente', 'agua', 'refeicoes', 'humor', 'conquistasManuais'];
const historicoPorMes = new Map(); // 'AAAA-MM' -> dados do documento historico daquele mês (ou null)
function chaveMes(dataStr) { return dataStr.slice(0, 7); }
function mesAtualChave() { return chaveMes(hojeISO()); }
function deslocarMes(mesKey, deslocamento) {
  const [ano, mes] = mesKey.split('-').map(Number);
  const d = new Date(ano, mes - 1 + deslocamento, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Reconstrói dadosUsuario = dadosRaiz + histórico mensal já carregado. Fica
// como campo espalhado (não aninhado) pra todo o resto do app continuar
// lendo dadosUsuario.concluidas / .foco / .agua / etc. exatamente como antes.
function remontarDadosMesclados() {
  if (!dadosRaiz) { dadosUsuario = null; return; }
  const mesclado = { ...dadosRaiz };
  CAMPOS_HISTORICO.forEach(campo => {
    let combinado = { ...(dadosRaiz[campo] || {}) };
    historicoPorMes.forEach(docMes => {
      if (docMes && docMes[campo]) combinado = { ...combinado, ...docMes[campo] };
    });
    mesclado[campo] = combinado;
  });
  dadosUsuario = mesclado;
}
async function precarregarMesHistorico(mesKey) {
  if (historicoPorMes.has(mesKey)) return;
  try {
    const snap = await getDoc(doc(db, 'usuarios', uid, 'historico', mesKey));
    historicoPorMes.set(mesKey, snap.exists() ? snap.data() : null);
    remontarDadosMesclados();
    if (dadosUsuario) renderizarAbaVisivel();
  } catch (erro) {
    console.error('Erro ao pré-carregar histórico de ' + mesKey + ':', erro);
  }
}
// Grava só a data que mudou (não o mês inteiro) no documento do mês certo, e
// atualiza a mescla local na hora — a tela não espera a viagem ao Firestore.
async function salvarHistoricoDia(campo, data, valor, opcoes = {}) {
  const { aviso = true } = opcoes;
  const mesKey = chaveMes(data);
  // historicoPorMes é um Map comum, não uma cache do Firestore — diferente
  // do documento principal, ele NÃO reverte sozinho se a gravação falhar.
  // Por isso guarda o estado de antes, pra poder desfazer manualmente.
  const docAntes = historicoPorMes.get(mesKey) ?? null;
  const docDepois = { ...(docAntes || {}) };
  docDepois[campo] = { ...(docDepois[campo] || {}), [data]: valor };
  historicoPorMes.set(mesKey, docDepois);
  remontarDadosMesclados();
  renderizarTudo();
  if (aviso) mostrarToast('Salvando…');
  try {
    const ref = doc(db, 'usuarios', uid, 'historico', mesKey);
    // Chave com notação de ponto: grava só essa data dentro do campo, sem
    // arriscar substituir o mês inteiro (o que aconteceria se mandasse um
    // objeto aninhado — merge:true só funde de verdade com dot notation).
    await setDoc(ref, { [`${campo}.${data}`]: valor }, { merge: true });
    if (aviso) mostrarToast('Salvo');
  } catch (erro) {
    console.error('Erro ao salvar histórico:', erro);
    // Gravação falhou de verdade: desfaz a atualização otimista, senão a
    // tela continuaria mostrando algo marcado que não foi salvo.
    if (docAntes) historicoPorMes.set(mesKey, docAntes); else historicoPorMes.delete(mesKey);
    remontarDadosMesclados();
    renderizarTudo();
    mostrarToast('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    throw erro;
  }
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
  // Não deixa marcar (tarefa, hábito, autocuidado/medicação) como feito numa
  // data futura — só planejar/visualizar é permitido. Desmarcar continua ok.
  if (valor && data > hojeISO()) {
    mostrarToast('Você ainda não pode concluir um item de uma data futura.');
    return;
  }
  const lista = new Set((dadosUsuario.concluidas || {})[data] || []);
  if (valor) lista.add(id); else lista.delete(id);
  await salvarHistoricoDia('concluidas', data, [...lista], { aviso: false });
  if (valor && data === hojeISO() && prefsVoz().falarProximoItem) falarProximoAposConcluir(id);
}
async function excluirItem(id) {
  if (!confirm('Excluir este item? Essa ação não pode ser desfeita.')) return;
  const itens = (dadosUsuario.itens || []).filter(i => i.id !== id);
  await salvarDados({ itens });
}

function criarLinhaItem(item, { data = hojeISO(), comAcoes = false, comChat = false, semCheck = false, comFalar = true } = {}) {
  const feita = !semCheck && estaConcluida(item.id, data);
  const futura = !feita && data > hojeISO();
  const li = document.createElement('li');
  li.className = 'item' + (feita ? ' feita' : '');
  const mostrarAcoes = comAcoes || comFalar;
  li.innerHTML = `
    ${semCheck ? '' : `<button class="marca-check" aria-label="Marcar concluída"${futura ? ' disabled title="Você ainda não pode concluir um item de uma data futura."' : ''}><svg><use href="#i-check"/></svg><svg class="patinha"><use href="#i-pata"/></svg></button>`}
    <div class="item-corpo"><p class="item-nome"></p><div class="item-meta"></div></div>
    ${mostrarAcoes ? `<div class="item-acoes">
      ${comFalar ? '<button type="button" class="item-acao item-falar" aria-label="Ouvir este item em voz alta" title="Ouvir"><svg><use href="#i-alto-falante"/></svg></button>' : ''}
      ${comChat ? '<button type="button" class="item-acao item-chat" aria-label="Conversar" title="Conversar"><svg><use href="#i-chat"/></svg></button>' : ''}
      ${comAcoes ? '<button type="button" class="item-acao item-editar" aria-label="Editar" title="Editar"><svg><use href="#i-editar"/></svg></button>' : ''}
      ${comAcoes ? '<button type="button" class="item-acao item-excluir" aria-label="Excluir" title="Excluir"><svg><use href="#i-lixo"/></svg></button>' : ''}
    </div>` : ''}
  `;
  li.querySelector('.item-nome').textContent = item.nome;
  const meta = li.querySelector('.item-meta');
  if (item.prioridade) { const s = document.createElement('span'); s.className = 'selo selo-alta'; s.textContent = 'prioridade'; meta.appendChild(s); }
  if (item.categoria) { const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = `${CATEGORIA_ICONE[item.categoria] || ''} ${item.categoria}`; meta.appendChild(s); }
  if (item.diaInteiro) {
    const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = 'dia inteiro'; meta.appendChild(s);
  } else if (item.horario) {
    const s = document.createElement('span'); s.className = 'item-hora';
    s.textContent = item.horarioFim ? `${item.horario}–${item.horarioFim}` : item.horario;
    meta.appendChild(s);
  }
  if (item.local) { const s = document.createElement('span'); s.className = 'item-hora'; s.textContent = item.local; meta.appendChild(s); }
  if (!semCheck) {
    li.querySelector('.marca-check').addEventListener('click', () => marcarConcluida(item.id, !feita, data));
  }
  if (comFalar) li.querySelector('.item-falar').addEventListener('click', () => falarItem(item));
  if (comAcoes) {
    li.querySelector('.item-editar').addEventListener('click', () => abrirEdicaoItem(item));
    li.querySelector('.item-excluir').addEventListener('click', () => excluirItem(item.id));
    if (comChat) li.querySelector('.item-chat').addEventListener('click', () => abrirChat(item));
  }
  return li;
}

// ---------- Render geral ----------
// renderizarTudo() cuida só do que fica visível o tempo todo (cabeçalho,
// mini-calendário) e delega o resto pra renderizarAbaVisivel(), que só
// renderiza a aba que está realmente aberta na tela — evita, por exemplo,
// remontar o calendário grande (30+ botões) quando quem mudou foi um
// checkbox na aba Hoje.
function renderizarTudo() {
  renderizarCabecalho();
  montarCalendarioMini();
  renderizarAbaVisivel();
}

function renderizarAbaVisivel() {
  if (!$('vistaHoje').hidden) renderizarAbaHoje();
  if (!$('vistaRotina').hidden) renderizarRotina();
  if (!$('vistaCalendario').hidden) montarCalendarioGrande('calGrande', null, 'agenda', true);
  if (!$('vistaProgresso').hidden) renderizarAbaProgresso();
  if (!$('vistaConfig').hidden) sincronizarUiVoz();
  // O diálogo de um dia específico é um modal por cima de qualquer aba —
  // se estiver aberto, precisa continuar em dia com os dados mais recentes.
  if ($('diaDialog').open && diaDialogAtual) abrirDiaDialog(diaDialogAtual);
}

function renderizarAbaHoje() {
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
  aplicarPersonalizacaoPainel();
}

function renderizarAbaProgresso() {
  renderizarProgressoConquistas();
  renderizarHabitos('listaHabitosProgresso', 'habitosProgressoVazio', false);
  renderizarProgressoDia();
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
    const atual = (dadosUsuario.foco || {})[hoje] || {};
    await salvarHistoricoDia('foco', hoje, { ...atual, texto: $('focoInput').value }, { aviso: false });
  }, 600);
});
$('focoCheck').addEventListener('click', async () => {
  const hoje = hojeISO();
  const atual = (dadosUsuario.foco || {})[hoje] || { texto: '', feito: false };
  await salvarHistoricoDia('foco', hoje, { ...atual, feito: !atual.feito }, { aviso: false });
});

// ---------- Prioridades / Agenda / Tarefas / Fazer depois ----------
function renderizarPrioridades() {
  const hoje = hojeISO();
  const itens = itensPorTipo('tarefa', hoje).filter(t => t.prioridade);
  const ul = $('listaPrioridades'); ul.innerHTML = '';
  itens.forEach(item => ul.appendChild(criarLinhaItem(item, { data: hoje })));
  $('prioridadesVazio').hidden = itens.length > 0;
}
// Junta num único horário do dia: compromissos + qualquer outro item (tarefa,
// fazer depois, hábito, autocuidado, lembrete, item de card personalizado)
// que tenha horário marcado — sem duplicar dado, é o mesmo item de origem.
function itensAgendaHoje() {
  const hoje = hojeISO();
  const linha = [];
  ['compromisso', 'tarefa', 'depois', 'habito', 'autocuidado'].forEach(tipo => {
    itensPorTipo(tipo, hoje).forEach(i => { if (i.horario || i.diaInteiro) linha.push(i); });
  });
  (dadosUsuario.lembretes || []).forEach(l => {
    if (l.horario) linha.push({ id: l.id, nome: l.texto, horario: l.horario, tipo: 'lembrar' });
  });
  ((dadosUsuario.painel && dadosUsuario.painel.blocos) || []).forEach(b => {
    if (b.tipo !== 'personalizado') return;
    (b.itens || []).forEach(it => {
      if (it.horario) linha.push({ id: it.id, nome: it.texto, horario: it.horario, tipo: 'personalizado' });
    });
  });
  return linha.sort((a, b) => (a.diaInteiro ? '' : a.horario || '').localeCompare(b.diaInteiro ? '' : b.horario || ''));
}

function renderizarAgenda() {
  const itens = itensAgendaHoje();
  const ol = $('linhaAgenda'); ol.innerHTML = '';
  itens.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="lt-hora"></span><span class="lt-marcador"><span class="lt-ponto"></span><span class="lt-fio"></span></span><div class="lt-corpo"><p class="lt-titulo"></p><p class="lt-local"></p></div>`;
    li.querySelector('.lt-hora').textContent = item.diaInteiro ? 'dia todo' : (item.horarioFim ? `${item.horario}–${item.horarioFim}` : (item.horario || ''));
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
    chip.innerHTML = `<svg><use href="#i-bandeja"/></svg><span></span>${item.horario ? `<span class="item-hora"></span>` : ''}<button type="button" aria-label="Ouvir"><svg><use href="#i-alto-falante"/></svg></button><button type="button" aria-label="Remover"><svg><use href="#i-x"/></svg></button>`;
    chip.querySelector('span').textContent = item.nome;
    if (item.horario) chip.querySelector('.item-hora').textContent = item.horario;
    const botoes = chip.querySelectorAll('button');
    botoes[0].addEventListener('click', () => falarItem(item));
    botoes[1].addEventListener('click', () => excluirItem(item.id));
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
    await salvarHistoricoDia('mente', hojeISO(), $('menteTexto').value, { aviso: false });
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
      ${item.horario ? '<span class="item-hora"></span>' : ''}
      <button type="button" class="toque-falar" aria-label="Ouvir este item"><svg><use href="#i-alto-falante"/></svg></button>
      <button type="button" class="toque-marca" aria-label="Marcar concluído"><svg><use href="#i-check"/></svg></button>
      <button type="button" class="toque-lixo" aria-label="Excluir item de autocuidado"><svg><use href="#i-lixo"/></svg></button>
    `;
    div.querySelector('.toque-nome').textContent = item.nome;
    if (item.horario) div.querySelector('.item-hora').textContent = item.horario;
    div.querySelector('.toque-falar').addEventListener('click', () => falarItem(item));
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
    linha.innerHTML = `<span class="habito-nome"></span>${h.horario ? '<span class="item-hora"></span>' : ''}<div class="habito-dias"></div>`;
    linha.querySelector('.habito-nome').textContent = h.nome;
    if (h.horario) linha.querySelector('.item-hora').textContent = h.horario;
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
      const falar = document.createElement('button'); falar.type = 'button'; falar.className = 'habito-lixo';
      falar.setAttribute('aria-label', 'Ouvir este hábito');
      falar.innerHTML = '<svg><use href="#i-alto-falante"/></svg>';
      falar.addEventListener('click', () => falarItem(h));
      linha.appendChild(falar);
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
  await salvarHistoricoDia('agua', hojeISO(), n, { aviso: false });
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
  const atual = (dadosUsuario.refeicoes || {})[hoje] || {};
  await salvarHistoricoDia('refeicoes', hoje, { ...atual, [chave]: valor }, { aviso: false });
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
  const atual = (dadosUsuario.humor || {})[hoje] || {};
  await salvarHistoricoDia('humor', hoje, { ...atual, [campo]: valor }, { aviso: false });
}

// ---------- Não esquecer ----------
function renderizarLembretes() {
  const el = $('listaLembretes'); el.innerHTML = '';
  const lembretes = dadosUsuario.lembretes || [];
  lembretes.forEach(l => {
    const chip = document.createElement('div'); chip.className = 'chip';
    chip.innerHTML = `<svg><use href="#i-pin"/></svg><span></span>${l.horario ? '<span class="item-hora"></span>' : ''}<button type="button" aria-label="Ouvir"><svg><use href="#i-alto-falante"/></svg></button><button type="button" aria-label="Remover lembrete"><svg><use href="#i-x"/></svg></button>`;
    chip.querySelector('span').textContent = l.texto;
    if (l.horario) chip.querySelector('.item-hora').textContent = l.horario;
    const botoes = chip.querySelectorAll('button');
    botoes[0].addEventListener('click', () => falarItem({ nome: l.texto }));
    botoes[1].addEventListener('click', () => excluirLembrete(l.id));
    el.appendChild(chip);
  });
}
$('formLembrete').addEventListener('submit', async e => {
  e.preventDefault();
  const texto = $('campoLembrete').value.trim();
  if (!texto) return;
  const horario = $('campoLembreteHorario').value || null;
  const lembretes = [...(dadosUsuario.lembretes || []), { id: crypto.randomUUID(), texto, horario, criadoEm: new Date().toISOString() }];
  await salvarDados({ lembretes });
  $('campoLembrete').value = '';
  $('campoLembreteHorario').value = '';
});
async function excluirLembrete(id) {
  const lembretes = (dadosUsuario.lembretes || []).filter(l => l.id !== id);
  await salvarDados({ lembretes });
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
  const atual = (dadosUsuario.conquistasManuais || {})[hoje] || [];
  await salvarHistoricoDia('conquistasManuais', hoje, [...atual, { id: crypto.randomUUID(), texto }]);
  $('campoConquista').value = '';
});
async function excluirConquistaManual(id) {
  const hoje = hojeISO();
  const atual = (dadosUsuario.conquistasManuais || {})[hoje] || [];
  await salvarHistoricoDia('conquistasManuais', hoje, atual.filter(c => c.id !== id), { aviso: false });
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
    // Trocar de mês só remonta este calendário — não renderizarTudo(), que
    // mexeria em telas que nem estão visíveis.
    btnAnt.addEventListener('click', () => { mesExibidoOffset--; montarCalendarioGrande(alvoId, tituloId, modo, comNavegacao); });
    const h3 = document.createElement('h3'); h3.className = 'cal-mes-titulo'; h3.textContent = tituloFormatado;
    const btnProx = document.createElement('button');
    btnProx.type = 'button'; btnProx.className = 'cal-nav-btn'; btnProx.setAttribute('aria-label', 'Próximo mês');
    btnProx.innerHTML = '<svg><use href="#i-seta-dir"/></svg>';
    btnProx.addEventListener('click', () => { mesExibidoOffset++; montarCalendarioGrande(alvoId, tituloId, modo, comNavegacao); });
    nav.append(btnAnt, h3, btnProx);
    el.appendChild(nav);
    if (mesExibidoOffset !== 0) {
      const btnHoje = document.createElement('button');
      btnHoje.type = 'button'; btnHoje.className = 'cal-nav-hoje'; btnHoje.textContent = 'Voltar pra hoje';
      btnHoje.addEventListener('click', () => { mesExibidoOffset = 0; montarCalendarioGrande(alvoId, tituloId, modo, comNavegacao); });
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
  $('grupoLocal').hidden = tipo !== 'compromisso';
  $('grupoDias').hidden = !(tipo === 'tarefa' || tipo === 'compromisso');
  $('grupoIcone').hidden = tipo !== 'autocuidado';
  $('grupoPrioridade').hidden = tipo !== 'tarefa';
}
$('campoTipo').addEventListener('change', atualizarCamposTipo);

function atualizarCamposDiaInteiro() {
  const inteiro = $('campoDiaInteiro').checked;
  $('grupoHorario').hidden = inteiro;
  $('grupoHorarioFim').hidden = inteiro;
}
$('campoDiaInteiro').addEventListener('change', atualizarCamposDiaInteiro);

function atualizarCamposLembrete() {
  const ativo = $('campoLembreteAtivo').checked;
  $('grupoLembreteMinutos').hidden = !ativo;
  document.querySelector('#maisOpcoes .linha-checkbox:has(#campoLembreteFalar)').hidden = !ativo;
  $('grupoLembreteCustom').hidden = !ativo || $('campoLembreteMinutos').value !== 'custom';
}
$('campoLembreteAtivo').addEventListener('change', atualizarCamposLembrete);
$('campoLembreteMinutos').addEventListener('change', atualizarCamposLembrete);

function abrirNovoItem(tipo) {
  itemEmEdicao = null;
  $('itemForm').reset();
  $('campoTipo').value = tipo;
  atualizarCamposTipo();
  atualizarCamposDiaInteiro();
  atualizarCamposLembrete();
  $('maisOpcoes').open = false;
  $('itemDialogTitulo').textContent = 'Novo item';
  $('excluirItem').hidden = true;
  $('prioridadeAviso').hidden = true;
  $('microfoneStatus').hidden = true;
  $('itemDialog').showModal();
}
function abrirEdicaoItem(item) {
  itemEmEdicao = item;
  $('campoTipo').value = item.tipo;
  atualizarCamposTipo();
  $('campoNome').value = item.nome || '';
  $('campoCategoria').value = item.categoria || 'higiene';
  $('campoHorario').value = item.horario || '';
  $('campoHorarioFim').value = item.horarioFim || '';
  $('campoDiaInteiro').checked = !!item.diaInteiro;
  atualizarCamposDiaInteiro();
  $('campoLocal').value = item.local || '';
  const diasAtivos = new Set(item.dias && item.dias.length ? item.dias : [0,1,2,3,4,5,6]);
  document.querySelectorAll('#diasGrade input').forEach(i => { i.checked = diasAtivos.has(Number(i.value)); });
  document.querySelectorAll('#iconeEscolha input').forEach(i => { i.checked = i.value === (item.icone || 'comprimido'); });
  $('campoPrioridade').checked = !!item.prioridade;
  const lembrete = item.lembrete || {};
  $('campoLembreteAtivo').checked = !!lembrete.ativo;
  const minutosConhecidos = ['0', '5', '10', '15', '30'];
  const minutosStr = String(lembrete.minutosAntes ?? 10);
  $('campoLembreteMinutos').value = minutosConhecidos.includes(minutosStr) ? minutosStr : 'custom';
  $('campoLembreteCustom').value = minutosConhecidos.includes(minutosStr) ? 45 : minutosStr;
  $('campoLembreteFalar').checked = !!lembrete.falar;
  atualizarCamposLembrete();
  $('maisOpcoes').open = !!(lembrete.ativo || (item.dias && item.dias.length && item.dias.length < 7));
  $('itemDialogTitulo').textContent = 'Editar item';
  $('excluirItem').hidden = false;
  $('prioridadeAviso').hidden = true;
  $('microfoneStatus').hidden = true;
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
  await salvarDados({ itens });
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
  const diaInteiro = $('campoDiaInteiro').checked;
  const lembreteAtivo = $('campoLembreteAtivo').checked;
  const minutosSelecionado = $('campoLembreteMinutos').value;
  const minutosAntes = minutosSelecionado === 'custom'
    ? Math.max(1, Number($('campoLembreteCustom').value) || 45)
    : Number(minutosSelecionado);

  const campos = {
    tipo, nome: $('campoNome').value.trim(),
    horario: diaInteiro ? '' : $('campoHorario').value,
    horarioFim: diaInteiro ? '' : $('campoHorarioFim').value,
    diaInteiro,
    lembrete: { ativo: lembreteAtivo, minutosAntes, falar: lembreteAtivo && $('campoLembreteFalar').checked }
  };
  if (tipo === 'tarefa' || tipo === 'depois') campos.categoria = $('campoCategoria').value;
  if (tipo === 'tarefa' || tipo === 'compromisso') campos.dias = dias;
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
  await salvarDados({ itens });
  itemEmEdicao = null;
});

// ---------- Cadastro por voz (🎤 "Falar para cadastrar") ----------
const DIAS_NOME_PARA_NUM = {
  domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terça': 2, 'terça-feira': 2, 'terca-feira': 2,
  quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5, sabado: 6, 'sábado': 6
};
const NUMEROS_POR_EXTENSO = { uma: 1, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };

function preencherFormularioPorVoz(textoOriginal) {
  const minusculo = textoOriginal.toLowerCase();
  $('microfoneStatus').hidden = false;
  $('microfoneStatus').textContent = `Ouvi: "${textoOriginal}". Confira os campos antes de salvar.`;

  let tipoDetectado = 'tarefa';
  if (/medica[çc][ãa]o|rem[ée]dio/.test(minusculo)) tipoDetectado = 'autocuidado';
  else if (/consulta|terapia|reuni[ãa]o|dentista|m[ée]dico/.test(minusculo)) tipoDetectado = 'compromisso';
  else if (/h[áa]bito/.test(minusculo)) tipoDetectado = 'habito';
  else if (/\bdepois\b|algum dia|quando der/.test(minusculo)) tipoDetectado = 'depois';

  let dias = []; // [] = todo dia — também serve pra "limpar" dia da fala anterior, se houver
  if (/todos os dias|toda dia|diariamente/.test(minusculo)) dias = [0, 1, 2, 3, 4, 5, 6];
  else {
    for (const [nomeDia, numDia] of Object.entries(DIAS_NOME_PARA_NUM)) {
      if (minusculo.includes(nomeDia)) { dias = [numDia]; break; }
    }
  }

  let horario = null;
  if (/meio[- ]dia/.test(minusculo)) horario = '12:00';
  else if (/meia[- ]noite/.test(minusculo)) horario = '00:00';
  else {
    const numerico = minusculo.match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(da manh[ãa]|da tarde|da noite)?\s*(horas?)?\b/);
    const porExtenso = minusculo.match(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:horas?)?\s*(da manh[ãa]|da tarde|da noite)?/);
    if (numerico && (minusculo.includes('às') || minusculo.includes('as ') || numerico[4])) {
      let h = Number(numerico[1]);
      const min = numerico[2] ? Number(numerico[2]) : 0;
      const periodo = numerico[3] || '';
      if (periodo.includes('tarde') && h < 12) h += 12;
      if (periodo.includes('noite') && h < 12) h += 12;
      if (h <= 23 && min <= 59) horario = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    } else if (porExtenso && NUMEROS_POR_EXTENSO[porExtenso[1]]) {
      let h = NUMEROS_POR_EXTENSO[porExtenso[1]];
      const periodo = porExtenso[2] || '';
      if ((periodo.includes('tarde') || periodo.includes('noite')) && h < 12) h += 12;
      horario = `${String(h).padStart(2, '0')}:00`;
    }
  }

  let titulo = textoOriginal
    .replace(/\btodos os dias\b|\btoda dia\b|\bdiariamente\b/gi, '')
    .replace(/\b(domingo|segunda(-feira)?|ter[çc]a(-feira)?|quarta(-feira)?|quinta(-feira)?|sexta(-feira)?|s[áa]bado)\b/gi, '')
    // sem \b antes de "à": \w do JS é só ASCII, então \b nunca "vê" fronteira
    // antes de acento e o strip abaixo nunca batia (bug encontrado na verificação)
    .replace(/às?\s*\d{1,2}([:h]\d{2})?\s*(da manh[ãa]|da tarde|da noite)?(\s*horas?)?/gi, '')
    .replace(/às?\s*(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(horas?)?\s*(da manh[ãa]|da tarde|da noite)?/gi, '')
    .replace(/\b(a|ao|à)?\s*meio[- ]dia\b|\b(a|à)?\s*meia[- ]noite\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[,.]$/, '');
  if (!titulo) titulo = textoOriginal;
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  $('campoTipo').value = tipoDetectado;
  atualizarCamposTipo();
  $('campoNome').value = titulo;
  if (horario) {
    $('campoDiaInteiro').checked = false;
    atualizarCamposDiaInteiro();
    $('campoHorario').value = horario;
  }
  if (tipoDetectado === 'tarefa' || tipoDetectado === 'compromisso') {
    document.querySelectorAll('#diasGrade input').forEach(i => { i.checked = dias.includes(Number(i.value)); });
  }
  if (dias || horario) $('maisOpcoes').open = true;
}

$('microfoneCadastroBtn').addEventListener('click', () => {
  const ReconhecimentoDeFala = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!ReconhecimentoDeFala) {
    $('microfoneStatus').hidden = false;
    $('microfoneStatus').textContent = 'Reconhecimento de voz não é compatível com este navegador. Preencha manualmente.';
    return;
  }
  const btn = $('microfoneCadastroBtn');
  const reconhecimento = new ReconhecimentoDeFala();
  reconhecimento.lang = 'pt-BR';
  reconhecimento.interimResults = false;
  reconhecimento.maxAlternatives = 1;
  btn.classList.add('gravando');
  $('microfoneStatus').hidden = false;
  $('microfoneStatus').textContent = 'Ouvindo… fale o que quer cadastrar (ex: "terapia terça-feira às três da tarde").';
  reconhecimento.addEventListener('result', e => {
    preencherFormularioPorVoz(e.results[0][0].transcript);
  });
  reconhecimento.addEventListener('error', () => {
    $('microfoneStatus').textContent = 'Não consegui te ouvir direito. Tenta de novo ou preenche manualmente.';
  });
  reconhecimento.addEventListener('end', () => { btn.classList.remove('gravando'); });
  try { reconhecimento.start(); } catch (erro) {
    btn.classList.remove('gravando');
    $('microfoneStatus').textContent = 'Não consegui acessar o microfone.';
  }
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
function blocosAtuais() {
  return (dadosUsuario.painel && dadosUsuario.painel.blocos && dadosUsuario.painel.blocos.length)
    ? dadosUsuario.painel.blocos : painelPadrao();
}
function encontrarBloco(id) {
  return blocosAtuais().find(b => b.id === id);
}
function atualizarBloco(id, mudancas) {
  const blocos = blocosAtuais().map(b => b.id === id ? { ...b, ...mudancas } : b);
  return salvarDados({ painel: { blocos } }, { aviso: false });
}
// Como atualizarBloco, mas atualiza a tela na hora (sem esperar o Firestore
// ir e voltar) e mostra o aviso "Organização salva." — usado nas ações que
// não têm mais um botão "Salvar" dedicado (ocultar, mostrar de novo, editar).
async function atualizarBlocoComAviso(id, mudancas, aviso) {
  const blocos = blocosAtuais().map(b => b.id === id ? { ...b, ...mudancas } : b);
  dadosRaiz.painel = { ...(dadosRaiz.painel || {}), blocos };
  remontarDadosMesclados();
  aplicarPersonalizacaoPainel();
  await salvarDados({ painel: { blocos } }, { aviso: false });
  if (aviso) mostrarToast(aviso);
}
function tituloDoId(id) {
  const bloco = encontrarBloco(id);
  return bloco ? resolverAparenciaBloco(bloco).titulo : 'Card';
}
function anunciar(texto) {
  const el = $('anuncioPainel');
  if (el) el.textContent = texto;
}
let toastTimeout;
function mostrarToast(texto) {
  const el = $('toastPainel');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('visivel'));
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.classList.remove('visivel');
    setTimeout(() => { el.hidden = true; }, 220);
  }, 1800);
}

// ---------- Gravação central (usada por toda gravação iniciada pela pessoa) ----------
// aviso:true mostra "Salvando…"/"Salvo" (formulários, adicionar/excluir).
// aviso:false pula esse aviso pra não spammar em toques rápidos (checkboxes,
// texto com debounce) — mas o erro sempre aparece, nos dois casos, porque é
// a parte que realmente importa pra não deixar algo marcado sem ter salvo.
async function salvarDados(campos, opcoes = {}) {
  const { aviso = true } = opcoes;
  if (aviso) mostrarToast('Salvando…');
  try {
    await updateDoc(doc(db, 'usuarios', uid), campos);
    if (aviso) mostrarToast('Salvo');
  } catch (erro) {
    console.error('Erro ao salvar no Firestore:', erro);
    mostrarToast('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    throw erro;
  }
}

// ---------- Layout do painel: coluna/ordem separados por dispositivo ----------
// O conteúdo do card (dadosUsuario.painel.blocos) é uma coisa; ONDE ele fica na
// tela é outra, guardada à parte em layoutDesktop/layoutMobile (a ordem no
// array = a ordem visual). Isso permite o celular ter uma organização
// diferente do computador sem duplicar título/cor/itens em dois lugares.
function ehTelaMobile() { return window.matchMedia('(max-width:759px)').matches; }

function layoutDesktopAtual() {
  const blocos = blocosAtuais();
  const salvo = (dadosUsuario.painel && dadosUsuario.painel.layoutDesktop) || [];
  const validos = salvo.filter(l => blocos.some(b => b.id === l.id));
  const idsVistos = new Set(validos.map(l => l.id));
  // cards novos (usuária nova, ou card criado numa atualização futura) entram
  // no fim, preenchendo as 3 colunas em sequência — nunca embaralha o que já
  // foi salvo antes.
  let colAtual = 1;
  const novos = blocos.filter(b => !idsVistos.has(b.id)).map(b => {
    const entrada = { id: b.id, coluna: colAtual };
    colAtual = colAtual >= 3 ? 1 : colAtual + 1;
    return entrada;
  });
  return [...validos, ...novos];
}
function layoutMobileAtual() {
  const blocos = blocosAtuais();
  const salvo = (dadosUsuario.painel && dadosUsuario.painel.layoutMobile) || [];
  const validos = salvo.filter(l => blocos.some(b => b.id === l.id));
  const idsVistos = new Set(validos.map(l => l.id));
  const novos = blocos.filter(b => !idsVistos.has(b.id)).map(b => ({ id: b.id }));
  return [...validos, ...novos];
}
function nomeLayoutAtivo() { return ehTelaMobile() ? 'layoutMobile' : 'layoutDesktop'; }
function layoutAtivo(nome) { return (nome || nomeLayoutAtivo()) === 'layoutMobile' ? layoutMobileAtual() : layoutDesktopAtual(); }
function salvarLayout(nome, entradas) {
  return updateDoc(doc(db, 'usuarios', uid), { painel: { [nome]: entradas } });
}

// ---------- Animação suave de reordenação (técnica FLIP: mede antes/depois e anima a diferença) ----------
function capturarRetangulos(painel) {
  const mapa = new Map();
  [...painel.children].forEach(el => mapa.set(el, el.getBoundingClientRect()));
  return mapa;
}
function animarReflow(painel, antes, excluir) {
  [...painel.children].forEach(el => {
    if (el === excluir) return;
    const rectAntes = antes.get(el);
    if (!rectAntes) return;
    const rectDepois = el.getBoundingClientRect();
    const dx = rectAntes.left - rectDepois.left;
    const dy = rectAntes.top - rectDepois.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.getBoundingClientRect(); // força o navegador a aplicar antes de animar
    requestAnimationFrame(() => {
      el.style.transition = 'transform .2s ease';
      el.style.transform = '';
    });
  });
}
function legendaPosicao(indice, total) {
  if (indice === 0) return 'a primeira posição';
  if (indice === total - 1) return 'a última posição';
  return `a posição ${indice + 1}`;
}

function moverBlocoOrdem(id, delta) {
  const nome = nomeLayoutAtivo();
  const entradas = layoutAtivo(nome);
  const i = entradas.findIndex(e => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= entradas.length) return;
  const [item] = entradas.splice(i, 1);
  entradas.splice(j, 0, item);
  dadosRaiz.painel = { ...(dadosRaiz.painel || {}), [nome]: entradas };
  remontarDadosMesclados();
  aplicarPersonalizacaoPainel();
  salvarLayout(nome, entradas);
  mostrarToast('Organização salva.');
  anunciar(`Card ${tituloDoId(id)} movido para ${legendaPosicao(j, entradas.length)}.`);
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
    alca.setAttribute('aria-label', 'Reordenar card ' + resolverAparenciaBloco(encontrarBloco(id) || {}).titulo);
    alca.innerHTML = '<svg><use href="#i-alca"/></svg>';
    controles.insertBefore(alca, controles.firstChild);
  }
  if (!controles.querySelector('.bloco-opcoes-btn')) {
    const opcoes = document.createElement('button');
    opcoes.type = 'button'; opcoes.className = 'bloco-opcoes-btn';
    opcoes.setAttribute('aria-label', 'Opções do card');
    opcoes.setAttribute('aria-haspopup', 'true');
    opcoes.setAttribute('aria-expanded', 'false');
    opcoes.innerHTML = '<svg><use href="#i-tres-pontos"/></svg>';
    opcoes.addEventListener('click', () => abrirMenuOpcoes(opcoes, id));
    controles.appendChild(opcoes);
  }
}

function criarBlocoPersonalizado(entry) {
  const el = document.createElement('article');
  el.className = 'bloco'; el.dataset.id = entry.id;
  const conteudo = entry.conteudo || 'checklist';
  const corpoHtml = conteudo === 'texto'
    ? `<textarea class="mente-area" data-texto-personalizado maxlength="2000" placeholder="Escreva livremente…"></textarea>`
    : `<ul class="lista-itens" data-lista-personalizada></ul>
       <p class="bloco-sub" data-vazio-personalizada hidden>Nada por aqui ainda.</p>
       <form class="bloco-personalizado-form mini-form">
         <input type="text" maxlength="60" placeholder="Adicionar item…">
         ${conteudo === 'checklist' ? '<input type="time" class="mini-form-hora" aria-label="Horário (opcional)">' : ''}
         <button type="submit" class="botao-icone-destaque" aria-label="Adicionar item"><svg><use href="#i-mais"/></svg></button>
       </form>`;
  el.innerHTML = `
    <div class="bloco-cab">
      <div class="bloco-titulo-grupo">
        <span class="bloco-icone"><svg><use href="#i-estrela"/></svg></span>
        <span class="bloco-titulo"></span>
      </div>
    </div>
    ${corpoHtml}
  `;
  if (conteudo === 'texto') {
    const area = el.querySelector('[data-texto-personalizado]');
    let debounceTexto;
    area.addEventListener('input', () => {
      clearTimeout(debounceTexto);
      debounceTexto = setTimeout(() => atualizarBloco(entry.id, { texto: area.value }), 500);
    });
  } else {
    el.querySelector('.bloco-personalizado-form').addEventListener('submit', e => {
      e.preventDefault();
      const input = e.target.querySelector('input[type="text"]');
      const horarioInput = e.target.querySelector('input[type="time"]');
      const texto = input.value.trim();
      if (!texto) return;
      adicionarItemPersonalizado(entry.id, texto, horarioInput ? horarioInput.value || null : null);
      input.value = ''; if (horarioInput) horarioInput.value = '';
    });
  }
  return el;
}

function renderizarConteudoPersonalizado(entry, el) {
  const conteudo = entry.conteudo || 'checklist';
  if (conteudo === 'texto') {
    const area = el.querySelector('[data-texto-personalizado]');
    if (area && document.activeElement !== area) area.value = entry.texto || '';
    return;
  }
  const ul = el.querySelector('[data-lista-personalizada]');
  const vazio = el.querySelector('[data-vazio-personalizada]');
  if (!ul) return;
  ul.innerHTML = '';
  const mostraCheck = conteudo === 'checklist';
  const itensBloco = entry.itens || [];
  itensBloco.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item' + (item.feita ? ' feita' : '');
    li.innerHTML = `
      ${mostraCheck ? '<button class="marca-check" aria-label="Marcar concluído"><svg><use href="#i-check"/></svg><svg class="patinha"><use href="#i-pata"/></svg></button>' : ''}
      <div class="item-corpo"><p class="item-nome"></p><div class="item-meta">${item.horario ? '<span class="item-hora"></span>' : ''}</div></div>
      <div class="item-acoes">
        <button type="button" class="item-acao item-falar" aria-label="Ouvir este item"><svg><use href="#i-alto-falante"/></svg></button>
        <button type="button" class="item-acao" aria-label="Excluir item"><svg><use href="#i-lixo"/></svg></button>
      </div>
    `;
    li.querySelector('.item-nome').textContent = item.texto;
    if (item.horario) li.querySelector('.item-hora').textContent = item.horario;
    if (mostraCheck) li.querySelector('.marca-check').addEventListener('click', () => alternarItemPersonalizado(entry.id, item.id));
    li.querySelector('.item-falar').addEventListener('click', () => falarItem({ nome: item.texto, horario: item.horario }));
    li.querySelector('.item-acoes .item-acao:last-child').addEventListener('click', () => excluirItemPersonalizado(entry.id, item.id));
    ul.appendChild(li);
  });
  if (vazio) vazio.hidden = itensBloco.length > 0;
}
async function adicionarItemPersonalizado(id, texto, horario = null) {
  const bloco = encontrarBloco(id); if (!bloco) return;
  const itens = [...(bloco.itens || []), { id: crypto.randomUUID(), texto, feita: false, horario }];
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
  const blocos = blocosAtuais();
  const mobile = ehTelaMobile();
  const layout = mobile ? layoutMobileAtual() : layoutDesktopAtual();
  const antes = capturarRetangulos(painel);
  const idsVistos = new Set();
  layout.forEach(entrada => {
    const entry = blocos.find(b => b.id === entrada.id);
    if (!entry) return;
    idsVistos.add(entry.id);
    let el = [...painel.children].find(c => c.dataset.id === entry.id);
    if (!el) {
      if (entry.tipo !== 'personalizado') return;
      el = criarBlocoPersonalizado(entry);
    }
    painel.appendChild(el);
    el.hidden = !!entry.oculto;
    if (mobile) {
      el.style.gridColumn = '';
      delete el.dataset.coluna;
    } else {
      const coluna = Math.min(Math.max(entrada.coluna || 1, 1), 3);
      el.style.gridColumn = coluna + ' / span 1';
      el.dataset.coluna = String(coluna);
    }
    const aparencia = resolverAparenciaBloco(entry);
    el.dataset.cor = aparencia.cor;
    const iconeUse = el.querySelector('.bloco-icone svg use');
    if (iconeUse) iconeUse.setAttribute('href', '#' + aparencia.icone);
    const tituloEl = el.querySelector('.bloco-titulo');
    if (tituloEl) tituloEl.textContent = aparencia.titulo;
    garantirControlesEdicao(el, entry.id);
    if (entry.tipo === 'personalizado') renderizarConteudoPersonalizado(entry, el);
  });
  [...painel.querySelectorAll('.bloco[data-id^="custom-"]')].forEach(el => {
    if (!idsVistos.has(el.dataset.id)) el.remove();
  });
  animarReflow(painel, antes);
  renderizarCardsOcultos(blocos);
}

function renderizarCardsOcultos(blocos) {
  const cab = $('cardsOcultosCab');
  const secao = $('cardsOcultos');
  const lista = $('listaCardsOcultos');
  const ocultos = blocos.filter(b => b.oculto);
  lista.innerHTML = '';
  const temOcultos = ocultos.length > 0;
  cab.hidden = !temOcultos;
  secao.hidden = !temOcultos;
  ocultos.forEach(b => {
    const aparencia = resolverAparenciaBloco(b);
    const chip = document.createElement('div'); chip.className = 'card-oculto-chip';
    chip.innerHTML = '<span></span><button type="button"><svg><use href="#i-olho"/></svg>Mostrar novamente</button>';
    chip.querySelector('span').textContent = aparencia.titulo;
    chip.querySelector('button').addEventListener('click', () => {
      atualizarBlocoComAviso(b.id, { oculto: false }, `${aparencia.titulo} está visível de novo.`);
    });
    lista.appendChild(chip);
  });
}

// Celular e computador têm layouts salvos separados — ao cruzar o breakpoint
// (girar o aparelho, redimensionar a janela) precisa re-renderizar com o layout certo.
(function observarMudancaDeTelaDoPainel() {
  const mq = window.matchMedia('(max-width:759px)');
  const ouvir = () => { if (dadosUsuario) aplicarPersonalizacaoPainel(); };
  if (mq.addEventListener) mq.addEventListener('change', ouvir); else mq.addListener(ouvir);
})();

// ---------- Menu "…" de cada card (editar / mover / ocultar) ----------
let menuOpcoesCardId = null;
function fecharMenuOpcoes() {
  const menu = $('blocoOpcoesMenu');
  menu.hidden = true;
  if (menuOpcoesCardId) {
    const btn = document.querySelector(`.bloco[data-id="${menuOpcoesCardId}"] .bloco-opcoes-btn`);
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  menuOpcoesCardId = null;
}
function abrirMenuOpcoes(botao, id) {
  const menu = $('blocoOpcoesMenu');
  if (menuOpcoesCardId === id && !menu.hidden) { fecharMenuOpcoes(); return; }
  fecharMenuOpcoes();
  menuOpcoesCardId = id;
  menu.hidden = false;
  botao.setAttribute('aria-expanded', 'true');
  const rect = botao.getBoundingClientRect();
  const largura = menu.offsetWidth || 192;
  let esquerda = rect.right - largura;
  if (esquerda < 8) esquerda = 8;
  if (esquerda + largura > window.innerWidth - 8) esquerda = window.innerWidth - largura - 8;
  let topo = rect.bottom + 6;
  if (topo + menu.offsetHeight > window.innerHeight - 8) topo = rect.top - menu.offsetHeight - 6;
  menu.style.left = esquerda + 'px';
  menu.style.top = topo + 'px';
}
$('blocoOpcoesMenu').addEventListener('click', e => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn || !menuOpcoesCardId) return;
  const id = menuOpcoesCardId;
  const acao = btn.dataset.acao;
  fecharMenuOpcoes();
  if (acao === 'editar') abrirEdicaoBloco(id);
  else if (acao === 'cima') moverBlocoOrdem(id, -1);
  else if (acao === 'baixo') moverBlocoOrdem(id, 1);
  else if (acao === 'ocultar') {
    const titulo = tituloDoId(id);
    atualizarBlocoComAviso(id, { oculto: true }, `${titulo} foi ocultado. Você pode trazer de volta em Config. → Cards ocultos.`);
  }
});
document.addEventListener('click', e => {
  const menu = $('blocoOpcoesMenu');
  if (menu.hidden) return;
  if (e.target.closest('#blocoOpcoesMenu') || e.target.closest('.bloco-opcoes-btn')) return;
  fecharMenuOpcoes();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('blocoOpcoesMenu').hidden) fecharMenuOpcoes();
});

// ---------- Diálogo: editar card (título, cor, ícone) ----------
$('iconeEscolhaBloco').innerHTML = ICONES_ESCOLHA_BLOCO
  .map(ic => `<label><input type="radio" name="iconeBloco" value="${ic}"><svg><use href="#${ic}"/></svg></label>`)
  .join('');

function abrirEdicaoBloco(id) {
  const bloco = encontrarBloco(id);
  if (!bloco) return;
  blocoEmEdicao = bloco;
  const aparencia = resolverAparenciaBloco(bloco);
  $('blocoDialogTitulo').textContent = 'Editar — ' + aparencia.titulo;
  $('campoBlocoTitulo').value = bloco.titulo || '';
  $('campoBlocoTitulo').placeholder = aparencia.titulo;
  document.querySelectorAll('#corEscolha input').forEach(i => { i.checked = i.value === aparencia.cor; });
  document.querySelectorAll('#iconeEscolhaBloco input').forEach(i => { i.checked = i.value === aparencia.icone; });
  $('blocoDialog').showModal();
}

$('blocoForm').addEventListener('submit', async () => {
  if (!blocoEmEdicao) return;
  const titulo = $('campoBlocoTitulo').value.trim();
  const cor = document.querySelector('#corEscolha input:checked')?.value || null;
  const icone = document.querySelector('#iconeEscolhaBloco input:checked')?.value || null;
  await atualizarBlocoComAviso(blocoEmEdicao.id, { titulo: titulo || null, cor, icone }, 'Card atualizado.');
  blocoEmEdicao = null;
});
$('fecharBlocoDialog').addEventListener('click', () => { $('blocoDialog').close(); blocoEmEdicao = null; });

// ---------- Diálogo: criar card novo ----------
$('iconeEscolhaNovoCard').innerHTML = ICONES_ESCOLHA_BLOCO
  .map(ic => `<label><input type="radio" name="iconeNovoCard" value="${ic}"><svg><use href="#${ic}"/></svg></label>`)
  .join('');

$('adicionarCardBtn').addEventListener('click', () => {
  $('novoCardForm').reset();
  document.querySelector('#corEscolhaNovoCard input[value="rosa"]').checked = true;
  document.querySelectorAll('#iconeEscolhaNovoCard input').forEach(i => { i.checked = false; });
  $('novoCardDialog').showModal();
});
$('fecharNovoCardDialog').addEventListener('click', () => $('novoCardDialog').close());
$('novoCardForm').addEventListener('submit', async () => {
  const nome = $('campoNovoCardNome').value.trim();
  if (!nome) return;
  const cor = document.querySelector('#corEscolhaNovoCard input:checked')?.value || 'rosa';
  const icone = document.querySelector('#iconeEscolhaNovoCard input:checked')?.value || 'i-estrela';
  const conteudo = document.querySelector('input[name="tipoNovoCard"]:checked')?.value || 'checklist';
  const novo = { id: 'custom-' + crypto.randomUUID(), tipo: 'personalizado', oculto: false, cor, icone, titulo: nome, conteudo };
  if (conteudo === 'texto') novo.texto = ''; else novo.itens = [];
  const blocos = [...blocosAtuais(), novo];
  dadosRaiz.painel = { ...(dadosRaiz.painel || {}), blocos };
  remontarDadosMesclados();
  aplicarPersonalizacaoPainel();
  await salvarDados({ painel: { blocos } }, { aviso: false });
  mostrarToast('Card criado — arraste pra posição que preferir.');
});

// ---------- Config da Rotina Falante ----------
function salvarPrefsVoz(mudancas) {
  const novo = { ...prefsVoz(), ...mudancas };
  return salvarDados({ voz: novo }, { aviso: false });
}
function sincronizarUiVoz() {
  const prefs = prefsVoz();
  $('interruptorVoz').setAttribute('aria-pressed', String(prefs.ativo));
  $('interruptorFalarAutomatico').setAttribute('aria-pressed', String(prefs.falarAutomatico));
  $('interruptorFalarProximo').setAttribute('aria-pressed', String(prefs.falarProximoItem));
  $('interruptorNaoPerturbe').setAttribute('aria-pressed', String(prefs.naoPerturbe.ativo));
  $('naoPerturbeHorarios').hidden = !prefs.naoPerturbe.ativo;
  if (document.activeElement !== $('campoVozVolume')) $('campoVozVolume').value = prefs.volume;
  if (document.activeElement !== $('campoVozVelocidade')) $('campoVozVelocidade').value = prefs.velocidade;
  if (document.activeElement !== $('campoVozMinutosPadrao')) $('campoVozMinutosPadrao').value = String(prefs.minutosAntesPadrao);
  if (document.activeElement !== $('campoNaoPerturbeInicio')) $('campoNaoPerturbeInicio').value = prefs.naoPerturbe.inicio;
  if (document.activeElement !== $('campoNaoPerturbeFim')) $('campoNaoPerturbeFim').value = prefs.naoPerturbe.fim;
}
$('interruptorVoz').addEventListener('click', () => salvarPrefsVoz({ ativo: $('interruptorVoz').getAttribute('aria-pressed') !== 'true' }));
$('interruptorFalarAutomatico').addEventListener('click', () => salvarPrefsVoz({ falarAutomatico: $('interruptorFalarAutomatico').getAttribute('aria-pressed') !== 'true' }));
$('interruptorFalarProximo').addEventListener('click', () => salvarPrefsVoz({ falarProximoItem: $('interruptorFalarProximo').getAttribute('aria-pressed') !== 'true' }));
$('interruptorNaoPerturbe').addEventListener('click', () => {
  const atual = prefsVoz();
  salvarPrefsVoz({ naoPerturbe: { ...atual.naoPerturbe, ativo: !atual.naoPerturbe.ativo } });
});
let vozSliderDebounce;
function agendarSalvarSlider(campo, valor) {
  clearTimeout(vozSliderDebounce);
  vozSliderDebounce = setTimeout(() => salvarPrefsVoz({ [campo]: valor }), 400);
}
$('campoVozVolume').addEventListener('input', () => agendarSalvarSlider('volume', Number($('campoVozVolume').value)));
$('campoVozVelocidade').addEventListener('input', () => agendarSalvarSlider('velocidade', Number($('campoVozVelocidade').value)));
$('campoVozMinutosPadrao').addEventListener('change', () => salvarPrefsVoz({ minutosAntesPadrao: Number($('campoVozMinutosPadrao').value) }));
$('campoNaoPerturbeInicio').addEventListener('change', () => {
  salvarPrefsVoz({ naoPerturbe: { ...prefsVoz().naoPerturbe, inicio: $('campoNaoPerturbeInicio').value } });
});
$('campoNaoPerturbeFim').addEventListener('change', () => {
  salvarPrefsVoz({ naoPerturbe: { ...prefsVoz().naoPerturbe, fim: $('campoNaoPerturbeFim').value } });
});

// ---------- Reordenar blocos (arrastar por toque/mouse/caneta + teclado) ----------
// Pointer Events em vez de Drag and Drop nativo: o HTML5 dragstart/dragover só
// dispara de verdade com mouse — no toque (celular) ele simplesmente não funciona.
// Pointer Events unificam mouse, dedo e caneta no mesmo código. Sempre ativo —
// não existe mais um "modo de personalizar" separado pra ligar isso.
(function ligarReordenacao() {
  const painel = $('painel');
  let arrastando = null;
  let origemProximoIrmao = null;
  let origemColuna = null;
  let alvoAtual = null;

  function limparAlvo() {
    if (alvoAtual) { alvoAtual.classList.remove('bloco-alvo-solta'); alvoAtual = null; }
  }

  function detectarColunaPorX(clientX) {
    const rect = painel.getBoundingClientRect();
    const relativo = Math.min(Math.max(clientX - rect.left, 0), rect.width - 1);
    return Math.min(3, Math.floor((relativo / rect.width) * 3) + 1);
  }

  function moverParaPosicao(clientX, clientY) {
    const mobile = ehTelaMobile();
    const antes = capturarRetangulos(painel);
    const alvo = document.elementFromPoint(clientX, clientY);
    const bloco = alvo && alvo.closest('.bloco');
    let mudou = false;
    if (bloco && bloco !== arrastando && painel.contains(bloco)) {
      const filhos = [...painel.children];
      const depois = filhos.indexOf(bloco) > filhos.indexOf(arrastando);
      painel.insertBefore(arrastando, depois ? bloco.nextSibling : bloco);
      if (!mobile && bloco.dataset.coluna && bloco.dataset.coluna !== arrastando.dataset.coluna) {
        arrastando.dataset.coluna = bloco.dataset.coluna;
        arrastando.style.gridColumn = bloco.dataset.coluna + ' / span 1';
      }
      limparAlvo();
      bloco.classList.add('bloco-alvo-solta'); alvoAtual = bloco;
      mudou = true;
    } else if (!mobile && !bloco) {
      const coluna = detectarColunaPorX(clientX);
      if (String(coluna) !== arrastando.dataset.coluna) {
        arrastando.dataset.coluna = String(coluna);
        arrastando.style.gridColumn = coluna + ' / span 1';
        mudou = true;
      }
      limparAlvo();
    }
    if (mudou) animarReflow(painel, antes, arrastando);
  }

  painel.addEventListener('pointerdown', e => {
    const alca = e.target.closest('.arrastar-alca');
    if (!alca) return;
    const bloco = alca.closest('.bloco');
    if (!bloco) return;
    e.preventDefault();
    arrastando = bloco;
    origemProximoIrmao = bloco.nextSibling;
    origemColuna = bloco.dataset.coluna || null;
    bloco.classList.add('arrastando');
    alca.setPointerCapture(e.pointerId);
  });
  painel.addEventListener('pointermove', e => {
    if (!arrastando) return;
    moverParaPosicao(e.clientX, e.clientY);
  });
  function soltarArraste(e) {
    if (!arrastando) return;
    const bloco = arrastando;
    bloco.classList.remove('arrastando');
    arrastando = null;
    limparAlvo();
    const nome = nomeLayoutAtivo();
    const entradas = layoutAtivo(nome);
    const ordemIds = [...painel.children].map(b => b.dataset.id);
    const porId = new Map(entradas.map(en => [en.id, en]));
    const reordenadas = ordemIds.map(id => porId.get(id)).filter(Boolean);
    if (nome === 'layoutDesktop' && bloco.dataset.coluna) {
      const entrada = reordenadas.find(en => en.id === bloco.dataset.id);
      if (entrada) entrada.coluna = Number(bloco.dataset.coluna);
    }
    dadosRaiz.painel = { ...(dadosRaiz.painel || {}), [nome]: reordenadas };
    remontarDadosMesclados();
    salvarLayout(nome, reordenadas);
    mostrarToast('Organização salva.');
    anunciar(`Card ${tituloDoId(bloco.dataset.id)} movido para ${legendaPosicao(ordemIds.indexOf(bloco.dataset.id), ordemIds.length)}.`);
    const alca = e.target.closest('.arrastar-alca');
    if (alca && alca.hasPointerCapture(e.pointerId)) alca.releasePointerCapture(e.pointerId);
  }
  painel.addEventListener('pointerup', soltarArraste);
  painel.addEventListener('pointercancel', soltarArraste);

  // Esc cancela o arraste em andamento e volta o card pro lugar original, sem salvar nada.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !arrastando) return;
    const bloco = arrastando;
    bloco.classList.remove('arrastando');
    arrastando = null;
    limparAlvo();
    const antes = capturarRetangulos(painel);
    painel.insertBefore(bloco, origemProximoIrmao);
    if (origemColuna) {
      bloco.dataset.coluna = origemColuna;
      bloco.style.gridColumn = origemColuna + ' / span 1';
    }
    animarReflow(painel, antes);
  });

  painel.addEventListener('keydown', e => {
    const alca = e.target.closest('.arrastar-alca');
    if (!alca) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const bloco = alca.closest('.bloco');
    moverBlocoOrdem(bloco.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
    alca.focus();
  });
})();

// ---------- Rotina Falante (voz) ----------
let vozAtualUtterance = null;
let ultimaFalaTexto = '';
let vozesDisponiveis = [];
let ultimoMinutoChecado = null;
const lembretesJaFalados = new Set();

function carregarVozes() { vozesDisponiveis = window.speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) {
  carregarVozes();
  window.speechSynthesis.onvoiceschanged = carregarVozes;
}
function prefsVoz() {
  const salvas = (dadosUsuario && dadosUsuario.voz) || {};
  return {
    ativo: false, volume: 1, velocidade: 1, vozNome: null, falarAutomatico: true,
    minutosAntesPadrao: 10, falarProximoItem: false,
    naoPerturbe: { ativo: false, inicio: '22:00', fim: '07:00' },
    ...salvas,
    naoPerturbe: { ativo: false, inicio: '22:00', fim: '07:00', ...(salvas.naoPerturbe || {}) }
  };
}
function escolherVoz(nomePreferido) {
  if (!vozesDisponiveis.length) return null;
  if (nomePreferido) {
    const escolhida = vozesDisponiveis.find(v => v.name === nomePreferido);
    if (escolhida) return escolhida;
  }
  const porIdioma = vozesDisponiveis.filter(v => (v.lang || '').toLowerCase().startsWith('pt-br'));
  const candidatas = porIdioma.length ? porIdioma : vozesDisponiveis.filter(v => (v.lang || '').toLowerCase().startsWith('pt'));
  const pistasFemininas = ['female', 'fem', 'maria', 'luciana', 'francisca', 'vitória', 'vitoria', 'camila'];
  const feminina = candidatas.find(v => pistasFemininas.some(p => v.name.toLowerCase().includes(p)));
  return feminina || candidatas[0] || vozesDisponiveis[0] || null;
}
function horarioFalado(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const hora12 = h % 12 === 0 ? 12 : h % 12;
  const periodo = h < 12 ? 'da manhã' : h < 18 ? 'da tarde' : 'da noite';
  if (h === 12 && m === 0) return 'meio-dia';
  if (h === 0 && m === 0) return 'meia-noite';
  return m === 0 ? `${hora12} horas ${periodo}` : `${hora12} horas e ${m} ${periodo}`;
}
function atualizarBarraVoz(falando) {
  const btn = $('pararFalarBtn');
  if (btn) btn.hidden = !falando;
}
function falarTexto(texto) {
  if (!texto || !('speechSynthesis' in window)) return;
  const prefs = prefsVoz();
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = 'pt-BR';
  utter.volume = prefs.volume;
  utter.rate = prefs.velocidade;
  const voz = escolherVoz(prefs.vozNome);
  if (voz) utter.voice = voz;
  utter.onend = () => atualizarBarraVoz(false);
  utter.onerror = () => atualizarBarraVoz(false);
  ultimaFalaTexto = texto;
  vozAtualUtterance = utter;
  atualizarBarraVoz(true);
  window.speechSynthesis.speak(utter);
}
function pararDeFalar() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  atualizarBarraVoz(false);
}
function repetirFala() { if (ultimaFalaTexto) falarTexto(ultimaFalaTexto); }

function falarItem(item) {
  let frase = item.nome || '';
  if (item.diaInteiro) frase += ', dia inteiro';
  else if (item.horario) frase += `, às ${horarioFalado(item.horario)}`;
  falarTexto(frase);
}

function lerMeuDia() {
  const hoje = new Date();
  const h = hoje.getHours();
  const nome = (dadosUsuario.perfil?.nome || '').split(' ')[0] || '';
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const partes = [`${saudacao}${nome ? ', ' + nome : ''}.`];
  const prioridades = itensPorTipo('tarefa').filter(t => t.prioridade);
  if (prioridades.length) partes.push(`Hoje você tem ${prioridades.length} prioridade${prioridades.length > 1 ? 's' : ''}.`);
  const agenda = itensAgendaHoje().filter(i => i.horario);
  agenda.slice(0, 4).forEach(i => partes.push(`Às ${horarioFalado(i.horario)}, ${i.nome}.`));
  const foco = (dadosUsuario.foco || {})[hojeISO()];
  if (foco && foco.texto) partes.push(`Seu foco de hoje é ${foco.texto}.`);
  if (partes.length === 1) partes.push('Você ainda não tem nada marcado pra hoje.');
  falarTexto(partes.join(' '));
}

function oQueFacoAgora() {
  const hoje = hojeISO();
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const paraMin = hhmm => { const [hh, mm] = (hhmm || '0:0').split(':').map(Number); return hh * 60 + mm; };
  const agendaveis = itensAgendaHoje().filter(i => i.horario && i.tipo !== 'lembrar' && i.tipo !== 'personalizado');

  const atrasado = agendaveis.find(i => paraMin(i.horario) < agoraMin && !estaConcluida(i.id, hoje));
  if (atrasado) { falarTexto(`Você está atrasada pra "${atrasado.nome}", marcado pras ${horarioFalado(atrasado.horario)}.`); return; }

  const agora = agendaveis.find(i => Math.abs(paraMin(i.horario) - agoraMin) <= 15 && !estaConcluida(i.id, hoje));
  if (agora) { falarTexto(`Agora é hora de "${agora.nome}".`); return; }

  const prioridade = itensPorTipo('tarefa', hoje).find(t => t.prioridade && !estaConcluida(t.id, hoje));
  if (prioridade) { falarTexto(`Sua prioridade agora é "${prioridade.nome}".`); return; }

  const autocuidado = itensPorTipo('autocuidado', hoje).find(a => !estaConcluida(a.id, hoje));
  if (autocuidado) { falarTexto(`Não esqueça: "${autocuidado.nome}".`); return; }

  const proximo = itensPorTipo('compromisso', hoje)
    .filter(c => c.horario && paraMin(c.horario) >= agoraMin)
    .sort((a, b) => paraMin(a.horario) - paraMin(b.horario))[0];
  if (proximo) { falarTexto(`Seu próximo compromisso é "${proximo.nome}", às ${horarioFalado(proximo.horario)}.`); return; }

  falarTexto('Por enquanto está tudo em dia. Você pode escolher qualquer tarefa da sua lista, sem pressa.');
}

function falarProximoAposConcluir(idConcluido) {
  const hoje = hojeISO();
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const paraMin = hhmm => { const [hh, mm] = (hhmm || '0:0').split(':').map(Number); return hh * 60 + mm; };
  const pendentes = itensAgendaHoje().filter(i =>
    i.id !== idConcluido && i.horario && i.tipo !== 'lembrar' && i.tipo !== 'personalizado' && !estaConcluida(i.id, hoje));
  const proximo = pendentes.filter(i => paraMin(i.horario) >= agoraMin).sort((a, b) => paraMin(a.horario) - paraMin(b.horario))[0] || pendentes[0];
  falarTexto(proximo
    ? `Você concluiu essa tarefa. Muito bem. Agora o próximo passo é ${proximo.nome}.`
    : 'Você concluiu essa tarefa. Muito bem.');
}

function subtrairMinutos(hhmm, minutos) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = (((h * 60 + m - minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function calcularGatilhoLembrete(item) {
  if (!item.horario) return null;
  if (item.lembrete) {
    if (!item.lembrete.ativo || !item.lembrete.falar) return null;
    return subtrairMinutos(item.horario, item.lembrete.minutosAntes || 0);
  }
  return item.horario; // lembrar / personalizado: avisa no horário exato
}
function fraseDeLembrete(item) {
  if (item.lembrete && item.lembrete.minutosAntes > 0) return `Daqui a pouco: ${item.nome}, às ${horarioFalado(item.horario)}.`;
  return `Agora é hora de ${item.nome}.`;
}
function dentroDeNaoPerturbe(prefs) {
  if (!prefs.naoPerturbe.ativo) return false;
  const agora = new Date();
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = prefs.naoPerturbe.inicio.split(':').map(Number);
  const [hf, mf] = prefs.naoPerturbe.fim.split(':').map(Number);
  const inicioMin = hi * 60 + mi, fimMin = hf * 60 + mf;
  if (inicioMin === fimMin) return false;
  return inicioMin < fimMin ? (agoraMin >= inicioMin && agoraMin < fimMin) : (agoraMin >= inicioMin || agoraMin < fimMin);
}
function checarLembretesFalados() {
  if (!dadosUsuario) return;
  const prefs = prefsVoz();
  if (!prefs.ativo || !prefs.falarAutomatico || dentroDeNaoPerturbe(prefs)) return;
  const agora = new Date();
  const minutoChave = `${hojeISO()}T${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  if (minutoChave === ultimoMinutoChecado) return;
  ultimoMinutoChecado = minutoChave;
  const horaAtual = minutoChave.slice(-5);
  itensAgendaHoje().forEach(item => {
    if (calcularGatilhoLembrete(item) !== horaAtual) return;
    const chave = minutoChave + ':' + item.id;
    if (lembretesJaFalados.has(chave)) return;
    lembretesJaFalados.add(chave);
    falarTexto(fraseDeLembrete(item));
    mostrarAviso(fraseDeLembrete(item));
  });
}
setInterval(checarLembretesFalados, 20000);

$('lerMeuDiaBtn').addEventListener('click', lerMeuDia);
$('oQueFacoBtn').addEventListener('click', oQueFacoAgora);
$('repetirFalaBtn').addEventListener('click', repetirFala);
$('pararFalarBtn').addEventListener('click', pararDeFalar);

// Se o app abriu (ou já estava aberto) a partir de um clique em notificação,
// lê o lembrete em voz alta — chega pela URL (app fechado, abre janela nova)
// ou por postMessage do service worker (app já aberto em outra aba).
function falarTextoSeAtivo(texto) {
  const tentar = (restantes) => {
    if (!dadosUsuario) { if (restantes > 0) setTimeout(() => tentar(restantes - 1), 500); return; }
    if (prefsVoz().ativo) falarTexto(texto);
  };
  tentar(10);
}
(function falarSeVeioDeNotificacao() {
  const texto = new URLSearchParams(location.search).get('falar');
  if (!texto) return;
  history.replaceState({}, '', location.pathname);
  falarTextoSeAtivo(decodeURIComponent(texto));
})();
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.tipo === 'falar-lembrete' && event.data.texto) falarTextoSeAtivo(event.data.texto);
  });
}

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
    await salvarDados({ pushTokens: tokens }, { aviso: false });
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
