// Painel de confirmação — Aniversário da Ayarla Souza
// Netlify Function + Netlify Blobs (sem planilha, sem servidor externo)
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const TZ = 'America/Fortaleza';
const NOME_STORE = 'aniversario-ayarla';

// Valores iniciais — tudo editável pela aba "Evento" do painel.
export const CFG_PADRAO = {
  aniversariante: 'Ayarla Souza',
  titulo: 'Aniversário da Ayarla',
  idade: '28',
  mostrarIdade: 'sim',
  data: '2026-12-03',
  hora: '18:00',
  local: 'Salão de Festa',
  endereco: 'Av. Atlântica s/n, Terras Alphaville 2, Bairro Cidade Alpha, Eusébio-CE, CEP 61765-913',
  mapa: 'https://www.google.com/maps/search/?api=1&query=Av.%20Atl%C3%A2ntica%20s%2Fn%2C%20Terras%20Alphaville%202%2C%20Cidade%20Alpha%2C%20Eus%C3%A9bio-CE%2C%2061765-913',
  traje: 'Branco, off white, bege ou nude',
  prazo: '2026-11-30',
  criancas: 'sim',
  presente: 'Deixa Deus te usar',
  presenteDetalhe: 'Pé tamanho 38, roupa tamanho M',
  obs: 'Venha celebrar comigo este dia tão especial!',
  contato: '',
  alergiasOpcoes: 'Glúten, Lactose, Amendoim, Castanhas, Frutos do mar, Ovo, Soja, Corante',
  linkCondominio: '',
  whatsappAvisos: '5599991860341',
  dataAvisoCond: '2026-11-29',
  dataAviso1: '2026-12-01',
  dataAviso2: '2026-12-03',
  msgCond: 'Oi! 🎀 {faltam} para o meu aniversário!\nPara entrar no condomínio no dia {data}, é preciso fazer o cadastro na portaria por este link:\n{linkCondominio}\n\nCadastre todos que vão com você, combinado?\n{aniversariante}',
  msg1: 'Oi! Tá chegando o meu aniversário! 🎀\n{faltam}!\nDia {data}, às {hora}, no {local}.\nDress code: {traje}.\nJá estou contando os dias para te ver lá!\n{aniversariante}',
  msg2: 'Oi! É hoje! Vem comemorar comigo! 🥂\nÀs {hora}, no {local}\n{endereco}\n{mapa}\nDress code: {traje}.\nTe espero!\n{aniversariante}',
  enviadoCond: '',
  enviado1: '',
  enviado2: '',
  rodape: '_Este número envia apenas avisos e não recebe respostas._'
};

const CFG_PUBLICO = ['aniversariante', 'titulo', 'idade', 'mostrarIdade', 'data', 'hora', 'local', 'endereco',
  'mapa', 'traje', 'prazo', 'criancas', 'presente', 'presenteDetalhe', 'obs', 'contato', 'alergiasOpcoes', 'linkCondominio', 'dataAvisoCond', 'whatsappAvisos'];

/* ------------------------------ HTTP ------------------------------ */

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, msg: 'Use POST.' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, msg: 'Pedido inválido.' }, 400); }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  try {
    return json(await api(String(body.acao || ''), body.dados || {}, token));
  } catch (e) {
    return json({ ok: false, msg: String((e && e.message) || e) });
  }
};

export const config = { path: '/api' };

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

/* ------------------------------ API ------------------------------- */

export async function api(acao, d, token) {
  const publico = { info, rsvp, statusAdmin, criarAdmin, login };
  if (publico[acao]) return { ok: true, data: await publico[acao](d) };

  const papel = await papelDo(token);
  if (!papel) return { ok: false, erro: 'SESSAO', msg: 'Acesso expirado. Entre novamente.' };

  const portaria = { eu: async () => ({ papel }), portaria: portariaLista, checkin, registrarPorta };
  if (portaria[acao]) return { ok: true, data: await portaria[acao](d) };

  if (papel === 'portaria') return { ok: false, erro: 'PERMISSAO', msg: 'Esta conta é apenas da portaria.' };
  // Visualização: só lê
  if (acao === 'listar') return { ok: true, data: { ...(await listar()), papel } };
  // Edição: mexe em convidados, avisos e evento
  const edicao = { salvarConvidado, excluir, salvarConfig, marcarAviso };
  if (edicao[acao]) {
    if (papel !== 'admin' && papel !== 'editor') return { ok: false, erro: 'PERMISSAO', msg: 'Seu acesso é só de visualização.' };
    return { ok: true, data: await edicao[acao](d) };
  }
  // Somente admin: acessos e usuários
  const admin = { gerarConsulta, revogar: revogarAcao, trocarSenha, usuarios, salvarUsuario, excluirUsuario };
  if (admin[acao]) {
    if (papel !== 'admin') return { ok: false, erro: 'PERMISSAO', msg: 'Só o admin pode fazer isso.' };
    return { ok: true, data: await admin[acao](d) };
  }
  return { ok: false, msg: 'Ação desconhecida.' };
}

/* ---------------------------- Públicas ---------------------------- */

async function info() {
  const c = await cfg();
  const pub = {};
  CFG_PUBLICO.forEach(k => pub[k] = c[k]);
  // O link do condomínio só aparece para o convidado a partir da data do aviso.
  if (hoje() < c.dataAvisoCond) pub.linkCondominio = '';
  return { cfg: pub, encerrado: prazoEncerrado(c), hoje: hoje() };
}

async function rsvp(d) {
  const c = await cfg();
  const nome = limpa(d.nome, 80);
  const zap = normZap(d.whatsapp);
  if (nome.length < 2) throw new Error('Informe seu nome.');
  if (zap.length < 12 || zap.length > 13) throw new Error('Informe um WhatsApp válido, com DDD.');
  const vai = d.vai === 'nao' ? 'nao' : 'sim';
  const encerrado = prazoEncerrado(c);
  const id = 'z' + zap;
  const agora = agoraTxt();
  let o = await db().get('g/' + id, { type: 'json' });
  if (!o) o = { id, criadoEm: agora, origem: 'link', avisoCond: '', aviso1: '', aviso2: '', checkin: '', checkinEm: '' };
  const manterPrincipal = o.lista === 'principal' && o.vai === 'sim';
  Object.assign(o, {
    lista: (encerrado && !manterPrincipal) ? 'adicional' : 'principal',
    atualizadoEm: agora, nome, whatsapp: zap, vai,
    adultos: vai === 'sim' ? num(d.adultos, 1, 30) : 0,
    criancas: (vai === 'sim' && c.criancas !== 'nao') ? num(d.criancas, 0, 30) : 0,
    alergias: vai === 'sim' ? alergias(d.alergias, c) : '',
    alergiaOutra: vai === 'sim' ? limpa(d.alergiaOutra, 200) : '',
    observacoes: limpa(d.observacoes, 400),
    aceitaAvisos: d.aceitaAvisos ? 'sim' : 'nao'
  });
  o.idadesCriancas = o.criancas > 0 ? limpa(d.idadesCriancas, 120) : '';
  await db().setJSON('g/' + id, o);
  const mostraLink = vai === 'sim' && hoje() >= c.dataAvisoCond && c.linkCondominio;
  return { lista: o.lista, vai: o.vai, nome: o.nome, linkCondominio: mostraLink ? c.linkCondominio : '' };
}

/* ----------------------------- Acesso ----------------------------- */

async function statusAdmin() {
  const a = await auth();
  return { existe: !!a.admin };
}

async function criarAdmin(d) {
  const a = await auth();
  if (a.admin) throw new Error('A conta de admin já existe. Use "Entrar".');
  const s = String(d.senha || '');
  if (s.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  a.admin = hashSenha(s, a.sal);
  await db().setJSON('auth', a);
  return { token: await novoToken('admin') };
}

async function login(d) {
  const papel = d.papel === 'portaria' ? 'portaria' : 'admin';
  const kf = 'falhas/' + papel;
  const f = (await db().get(kf, { type: 'json' })) || { n: 0, ate: 0 };
  if (f.ate > Date.now()) throw new Error('Muitas tentativas. Aguarde 15 minutos.');
  const a = await auth();
  const digitado = String(d.senha || '').trim();
  const usuario = String(d.usuario || '').trim().toLowerCase();
  // Usuário de edição/visualização criado pelo admin
  if (papel === 'admin' && usuario && usuario !== 'admin') {
    const u = (a.usuarios || {})[usuario];
    if (u && iguais(hashSenha(digitado, a.sal), u.hash)) { await db().delete(kf); return { token: await novoToken(u.papel, usuario) }; }
    f.n = (f.ate && f.ate < Date.now()) ? 1 : f.n + 1; f.ate = f.n >= 8 ? Date.now() + 15 * 60 * 1000 : 0; if (f.n >= 8) f.n = 0;
    await db().setJSON(kf, f);
    throw new Error('Usuário ou senha incorretos.');
  }
  const ok = a[papel] && iguais(hashSenha(papel === 'portaria' ? digitado.toUpperCase() : digitado, a.sal), a[papel]);
  if (!ok) {
    f.n = (f.ate && f.ate < Date.now()) ? 1 : f.n + 1;
    f.ate = f.n >= 8 ? Date.now() + 15 * 60 * 1000 : 0;
    if (f.n >= 8) f.n = 0;
    await db().setJSON(kf, f);
    throw new Error(papel === 'portaria' ? 'Código inválido ou desativado.' : 'Senha incorreta.');
  }
  await db().delete(kf);
  return { token: await novoToken(papel) };
}

/* ------------------------------ Admin ----------------------------- */

async function listar() {
  const c = await cfg();
  const a = await auth();
  return { convidados: await todos(), cfg: c, encerrado: prazoEncerrado(c), hoje: hoje(), portariaAtiva: !!a.portaria };
}

async function salvarConvidado(d) {
  let o = d.id ? await db().get('g/' + d.id, { type: 'json' }) : null;
  const agora = agoraTxt();
  if (!o) o = { id: 'a' + crypto.randomBytes(5).toString('hex'), criadoEm: agora, origem: 'admin', avisoCond: '', aviso1: '', aviso2: '', checkin: '', checkinEm: '' };
  o.nome = limpa(d.nome, 80);
  if (o.nome.length < 2) throw new Error('Informe o nome.');
  Object.assign(o, {
    atualizadoEm: agora,
    whatsapp: d.whatsapp ? normZap(d.whatsapp) : '',
    vai: d.vai === 'nao' ? 'nao' : 'sim',
    idadesCriancas: limpa(d.idadesCriancas, 120),
    alergias: limpa(d.alergias, 300),
    alergiaOutra: limpa(d.alergiaOutra, 200),
    observacoes: limpa(d.observacoes, 400),
    lista: ['principal', 'adicional', 'porta'].includes(d.lista) ? d.lista : 'principal',
    aceitaAvisos: d.aceitaAvisos ? 'sim' : 'nao'
  });
  o.adultos = o.vai === 'sim' ? num(d.adultos, 0, 30) : 0;
  o.criancas = o.vai === 'sim' ? num(d.criancas, 0, 30) : 0;
  await db().setJSON('g/' + o.id, o);
  return o;
}

async function excluir(d) {
  if (!/^[a-z0-9]+$/i.test(String(d.id || ''))) throw new Error('Convidado inválido.');
  await db().delete('g/' + d.id);
  return { id: d.id };
}

async function salvarConfig(d) {
  const c = await cfg();
  Object.keys(d || {}).forEach(k => {
    if (k in CFG_PADRAO) c[k] = String(d[k] == null ? '' : d[k]).slice(0, 2000);
  });
  if (c.whatsappAvisos) c.whatsappAvisos = normZap(c.whatsappAvisos);
  for (const k of ['mapa', 'linkCondominio']) {
    if (c[k] && !/^https:\/\//i.test(c[k])) throw new Error('Os links precisam começar com https://');
  }
  await db().setJSON('cfg', c);
  return c;
}

// Marca convidados (um ou vários) — ex.: adicionado à lista de transmissão.
async function marcarAviso(d) {
  const ids = (Array.isArray(d.ids) ? d.ids : [d.id]).filter(i => /^[a-z0-9]+$/i.test(String(i || ''))).slice(0, 500);
  const campo = ['naLista', 'avisoCond', 'aviso1', 'aviso2'].includes(d.qual) ? d.qual : 'naLista';
  const quando = d.valor ? agoraTxt() : '';
  const saida = [];
  for (const id of ids) {
    const o = await db().get('g/' + id, { type: 'json' });
    if (!o) continue;
    o[campo] = quando;
    await db().setJSON('g/' + id, o);
    saida.push(o);
  }
  return saida;
}

async function gerarConsulta() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let cod = '';
  const b = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) cod += letras[b[i] % letras.length];
  const a = await auth();
  a.portaria = hashSenha(cod, a.sal);
  await db().setJSON('auth', a);
  await revogar('portaria');
  return { codigo: cod };
}

async function revogarAcao(d) {
  const papel = d.papel === 'admin' ? 'admin' : 'portaria';
  await revogar(papel);
  if (papel === 'portaria' && d.desativar) {
    const a = await auth();
    delete a.portaria;
    await db().setJSON('auth', a);
  }
  return { ok: true };
}

async function trocarSenha(d) {
  const a = await auth();
  if (!iguais(hashSenha(String(d.atual || ''), a.sal), a.admin)) throw new Error('Senha atual incorreta.');
  const s = String(d.nova || '');
  if (s.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
  a.admin = hashSenha(s, a.sal);
  await db().setJSON('auth', a);
  await revogar('admin');
  return { token: await novoToken('admin') };
}

/* ----------------------------- Usuários --------------------------- */

async function usuarios() {
  const a = await auth();
  return Object.entries(a.usuarios || {}).map(([usuario, u]) => ({ usuario, nome: u.nome, papel: u.papel, criadoEm: u.criadoEm }));
}

async function salvarUsuario(d) {
  const usuario = String(d.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || usuario === 'admin') throw new Error('Usuário: 3 a 30 letras minúsculas, números, ponto ou traço (sem espaço).');
  const papel = d.papel === 'editor' ? 'editor' : 'leitor';
  const a = await auth();
  a.usuarios = a.usuarios || {};
  const atual = a.usuarios[usuario];
  const senha = String(d.senha || '');
  if (!atual && senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (senha && senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  a.usuarios[usuario] = { nome: limpa(d.nome, 60) || usuario, papel, hash: senha ? hashSenha(senha, a.sal) : atual.hash, criadoEm: atual ? atual.criadoEm : agoraTxt() };
  await db().setJSON('auth', a);
  return usuarios();
}

async function excluirUsuario(d) {
  const a = await auth();
  const usuario = String(d.usuario || '').toLowerCase();
  if (a.usuarios) delete a.usuarios[usuario];
  await db().setJSON('auth', a);
  return usuarios();
}

/* ----------------------------- Portaria --------------------------- */

async function portariaLista() {
  const c = await cfg();
  const campos = ['id', 'nome', 'adultos', 'criancas', 'idadesCriancas', 'alergias', 'alergiaOutra',
    'observacoes', 'lista', 'origem', 'checkin', 'checkinEm'];
  const lista = (await todos()).filter(r => r.vai === 'sim').map(r => {
    const o = {};
    campos.forEach(k => o[k] = r[k]);
    return o;
  });
  return { convidados: lista, titulo: c.titulo, aniversariante: c.aniversariante, data: c.data };
}

async function checkin(d) {
  const o = await db().get('g/' + d.id, { type: 'json' });
  if (!o) throw new Error('Convidado não encontrado.');
  o.checkin = d.valor ? 'sim' : '';
  o.checkinEm = d.valor ? agoraTxt() : '';
  await db().setJSON('g/' + o.id, o);
  return { id: o.id, checkin: o.checkin, checkinEm: o.checkinEm };
}

async function registrarPorta(d) {
  const agora = agoraTxt();
  const o = {
    id: 'p' + crypto.randomBytes(5).toString('hex'), criadoEm: agora, atualizadoEm: agora,
    nome: limpa(d.nome, 80), whatsapp: '', vai: 'sim',
    adultos: num(d.adultos, 0, 30), criancas: num(d.criancas, 0, 30), idadesCriancas: '',
    alergias: '', alergiaOutra: limpa(d.alergiaOutra, 200), observacoes: limpa(d.observacoes, 300),
    lista: 'porta', origem: 'portaria', aceitaAvisos: 'nao', avisoCond: '', aviso1: '', aviso2: '',
    checkin: 'sim', checkinEm: agora
  };
  if (o.nome.length < 2) throw new Error('Informe o nome.');
  if (o.adultos + o.criancas < 1) throw new Error('Informe quantas pessoas chegaram.');
  await db().setJSON('g/' + o.id, o);
  return o;
}

/* ------------------------------ Dados ----------------------------- */

let _db;
// Uma conexão nova a cada pedido: a autorização do Netlify Blobs expira entre execuções.
function db() { return _db || getStore({ name: NOME_STORE, consistency: 'strong' }); }
export function _usarStore(s) { _db = s; } // usado só nos testes

async function cfg() {
  const salvo = (await db().get('cfg', { type: 'json' })) || {};
  return Object.assign({}, CFG_PADRAO, salvo);
}

async function auth() {
  let a = await db().get('auth', { type: 'json' });
  if (!a) { a = { sal: crypto.randomBytes(16).toString('hex') }; await db().setJSON('auth', a); }
  return a;
}

async function todos() {
  const { blobs } = await db().list({ prefix: 'g/' });
  const itens = await Promise.all(blobs.map(b => db().get(b.key, { type: 'json' })));
  return itens.filter(Boolean);
}

async function novoToken(papel, usuario) {
  const t = crypto.randomBytes(32).toString('hex');
  await db().setJSON('tk/' + sha(t), { papel, usuario: usuario || '', em: agoraTxt() });
  return t;
}

async function papelDo(token) {
  if (!token || token.length !== 64) return '';
  const v = await db().get('tk/' + sha(token), { type: 'json' });
  if (!v) return '';
  if (v.papel === 'portaria' && !(await auth()).portaria) return '';
  if (v.usuario) { const u = ((await auth()).usuarios || {})[v.usuario]; if (!u) return ''; return u.papel; }
  return v.papel;
}

async function revogar(papel) {
  const { blobs } = await db().list({ prefix: 'tk/' });
  for (const b of blobs) {
    const v = await db().get(b.key, { type: 'json' });
    if (v && v.papel === papel) await db().delete(b.key);
  }
}

/* ---------------------------- Utilidades -------------------------- */

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hashSenha(s, sal) { return crypto.scryptSync(String(s), sal, 32).toString('hex'); }
function iguais(a, b) { if (!a || !b || a.length !== b.length) return false; return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function hoje() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function agoraTxt() { return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(',', ''); }
function prazoEncerrado(c) { return /^\d{4}-\d{2}-\d{2}$/.test(c.prazo || '') && hoje() > c.prazo; }
function limpa(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max || 200); }
function num(n, min, max) { n = parseInt(n, 10); if (isNaN(n)) n = min; return Math.max(min, Math.min(max, n)); }
function normZap(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
function alergias(lista, c) {
  const ok = String(c.alergiasOpcoes || '').split(',').map(s => s.trim()).filter(Boolean).concat(['Nenhuma']);
  const sel = (Array.isArray(lista) ? lista : []).filter(a => ok.includes(a));
  return (sel.includes('Nenhuma') && sel.length > 1 ? sel.filter(a => a !== 'Nenhuma') : sel).join('; ');
}
