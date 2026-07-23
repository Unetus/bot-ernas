/**
 * pesquisaLogic.js — Regras client-side de gate por nível de Pesquisa.
 *
 * Espelha as funções de `lib/pesquisa.ts` e `lib/registro-exec.ts` do site.
 * O BOT usa para PRÉ-COMPUTAR (sem round-trip) o que o jogador pode fazer.
 * O site REVALIDA no `prepararRegistro` (defesa em profundidade).
 */

// ============================================================
// DISCIPLINAS (16) - espelho de src/lib/pesquisa.ts
// ============================================================

const GRUPOS = {
    OFICIOS: 'oficios',
    DESENVOLVIMENTO: 'desenvolvimento',
    BENEFICIOS: 'beneficios',
};

const DISCIPLINAS = {
    // OFICIOS (10)
    ferraria:             { slug: 'ferraria',             nome: 'Ferraria',             grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-ferraria.png' },
    mineracao:            { slug: 'mineracao',            nome: 'Mineração',            grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-mineracao.png' },
    forja_magica:         { slug: 'forja_magica',         nome: 'Forja Mágica',         grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-fora_magica.png' },
    dendrologia:          { slug: 'dendrologia',          nome: 'Dendrologia',          grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-dendrologia.png' },
    geologia_arcana:      { slug: 'geologia_arcana',      nome: 'Geologia Arcana',      grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-geologia_arcana.png' },
    alquimia:             { slug: 'alquimia',             nome: 'Alquimia',             grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-alquimia.png' },
    herbologia:           { slug: 'herbologia',           nome: 'Herbologia',           grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-herbologia.png' },
    sintetizacao:         { slug: 'sintetizacao',         nome: 'Sintetização',         grupo: GRUPOS.OFICIOS,        nivelMax: 10, iconKey: 'pesquisa/icon-sintetizacao.png' },
    catalisacao:          { slug: 'catalisacao',          nome: 'Catalisação',          grupo: GRUPOS.OFICIOS,        nivelMax: 10, iconKey: 'pesquisa/icon-catalisacao.png' },
    runografia:           { slug: 'runografia',           nome: 'Runografia',           grupo: GRUPOS.OFICIOS,        nivelMax: 5,  iconKey: 'pesquisa/icon-runografia.png' },
    // DESENVOLVIMENTO (4)
    roleplay:             { slug: 'roleplay',             nome: 'Roleplay',             grupo: GRUPOS.DESENVOLVIMENTO, nivelMax: 10, iconKey: 'pesquisa/icon-roleplay.png' },
    estudo_designios:     { slug: 'estudo_designios',     nome: 'Estudo dos Desígnios', grupo: GRUPOS.DESENVOLVIMENTO, nivelMax: 10, iconKey: 'pesquisa/icon-estudo_designios.png' },
    engenharia_habilidades:{ slug: 'engenharia_habilidades',nome: 'Engenharia de Habilidades', grupo: GRUPOS.DESENVOLVIMENTO, nivelMax: 5,  iconKey: 'pesquisa/icon-engenharia_habilidades.png' },
    potencial:            { slug: 'potencial',            nome: 'Potencial',            grupo: GRUPOS.DESENVOLVIMENTO, nivelMax: 20, iconKey: 'pesquisa/icon-potencial.png' },
    // BENEFICIOS (3)
    metodologia_estudo:   { slug: 'metodologia_estudo',   nome: 'Metodologia de Estudo', grupo: GRUPOS.BENEFICIOS,     nivelMax: 5,  iconKey: 'pesquisa/icon-metodologia_estudo.png' },
    valoracao_comercial:  { slug: 'valoracao_comercial',  nome: 'Valoração Comercial',  grupo: GRUPOS.BENEFICIOS,     nivelMax: 5,  iconKey: 'pesquisa/icon-valoracao_comercial.png' },
    negociacao_mercantil: { slug: 'negociacao_mercantil', nome: 'Negociação Mercantil', grupo: GRUPOS.BENEFICIOS,     nivelMax: 5,  iconKey: 'pesquisa/icon-negociacao_mercantil.png' },
};

const DISCIPLINAS_LIST = Object.values(DISCIPLINAS);

const GRUPO_LABEL = {
    oficios: 'Ofícios',
    desenvolvimento: 'Desenvolvimento',
    beneficios: 'Benefícios',
};

const GRUPO_ORDER = [GRUPOS.OFICIOS, GRUPOS.DESENVOLVIMENTO, GRUPOS.BENEFICIOS];

const GRUPO_COLOR = {
    oficios: '#D4AF37',       // dourado
    desenvolvimento: '#5B9BD5', // azul
    beneficios: '#9B7EDE',   // roxo
};

// ============================================================
// RARIDADES (espelho de lib/raridade.ts)
// ============================================================

const RARIDADES = ['comum', 'raro', 'epico', 'lendario', 'mitico'];

const RARIDADE_LABEL = {
    comum: 'Comum',
    raro: 'Raro',
    epico: 'Épico',
    lendario: 'Lendário',
    mitico: 'Mítico',
};

const RARIDADE_COLOR = {
    comum: '#8B949E',
    raro: '#3498DB',
    epico: '#8B5CF6',
    lendario: '#F59E0B',
    mitico: '#EF4444',
};

// ============================================================
// TIPOS DE REGISTRO + gate por nível (espelho de lib/registro-exec.ts)
// ============================================================

const REFINO_UNLOCK_NIVEL = 2;
const ENGENHARIA_NIVEL_MIN = 20; // nível do personagem

const REGISTRO_TIPOS = {
    extracao: {
        tipo: 'extracao',
        rotulo: 'Extração',
        label: 'Extração',
        oficio: true, // requer seleção de ofício
        raridade: true, // requer seleção de raridade
        gate: (niveis) => ({
            mineracao: niveis.mineracao ?? 0,
            dendrologia: niveis.dendrologia ?? 0,
            herbologia: niveis.herbologia ?? 0,
            geologia_arcana: niveis.geologia_arcana ?? 0,
            catalisacao: niveis.catalisacao ?? 0,
        }),
    },
    forja: {
        tipo: 'forja',
        rotulo: 'Forja',
        label: 'Forja',
        gate: (niveis) => (niveis.ferraria ?? 0) >= 1 || (niveis.forja_magica ?? 0) >= 1,
        requerMoldeLingote: true,
    },
    refino: {
        tipo: 'refino',
        rotulo: 'Refino',
        label: 'Refino',
        gate: (niveis) => (niveis.ferraria ?? 0) >= REFINO_UNLOCK_NIVEL || (niveis.forja_magica ?? 0) >= REFINO_UNLOCK_NIVEL,
    },
    alquimia: {
        tipo: 'alquimia',
        rotulo: 'Alquimia',
        label: 'Alquimia',
        gate: (niveis) => (niveis.alquimia ?? 0) >= 1,
    },
    sintese: {
        tipo: 'sintese',
        rotulo: 'Síntese',
        label: 'Síntese',
        gate: (niveis) => (niveis.sintetizacao ?? 0) >= 1,
    },
    skill_maestria: {
        tipo: 'skill_maestria',
        rotulo: 'Skill de Maestria',
        label: 'Skill de Maestria',
        gate: (niveis) => (niveis.estudo_designios ?? 0) >= 1,
    },
    receita_encantamento: {
        tipo: 'receita_encantamento',
        rotulo: 'Receita',
        label: 'Receita',
        gate: (niveis) => (niveis.runografia ?? 0) >= 1,
    },
    roleplay: {
        tipo: 'roleplay',
        rotulo: 'Roleplay',
        label: 'Roleplay',
        gate: (niveis) => (niveis.roleplay ?? 0) >= 1,
    },
    beneficio: {
        tipo: 'beneficio',
        rotulo: 'Benefício',
        label: 'Benefício',
        gate: (niveis) => (niveis.metodologia_estudo ?? 0) >= 1 || (niveis.valoracao_comercial ?? 0) >= 1 || (niveis.negociacao_mercantil ?? 0) >= 1,
    },
};

// ============================================================
// STATUS DE UMA DISCIPLINA
// ============================================================

const STATUS = {
    BLOQUEADO: 'bloqueado',
    DESBLOQUEADO: 'desbloqueado',
    EM_ANDAMENTO: 'em_andamento',
    PRONTO: 'pronto', // terminou, aguardando coleta
    MAXIMO: 'maximo',
};

function statusDisciplina(statusObj, slug) {
    const arvore = Array.isArray(statusObj) ? statusObj : (statusObj?.arvore || []);
    const node = arvore.find?.((n) => n?.slug === slug) || arvore?.[slug];
    if (!node) return STATUS.BLOQUEADO;
    const max = DISCIPLINAS[slug]?.nivelMax || 5;
    if (node.nivel >= max) return STATUS.MAXIMO;

    const ativas = statusObj?.slots?.ativas || statusObj?.ativas || arvore?.ativas || [];
    const ativa = Array.isArray(ativas) ? ativas.find((a) => a.disciplina === slug) : null;
    if (ativa) {
        const terminou = new Date(ativa.termina_em).getTime() <= Date.now();
        return terminou ? STATUS.PRONTO : STATUS.EM_ANDAMENTO;
    }
    return STATUS.DESBLOQUEADO;
}

// ============================================================
// HELPERS DE FORMATAÇÃO
// ============================================================

function formatDuracao(segundos) {
    if (!segundos || segundos <= 0) return '0min';
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const partes = [];
    if (dias) partes.push(`${dias}d`);
    if (horas) partes.push(`${horas}h`);
    if (minutos) partes.push(`${minutos}min`);
    return partes.join(' ') || '< 1min';
}

function formatConhecimento(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString('pt-BR');
}

function formatDataCurta(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi} UTC`;
}

function progresso(ativa) {
    if (!ativa) return 0;
    const inicio = new Date(ativa.iniciado_em).getTime();
    const fim = new Date(ativa.termina_em).getTime();
    if (isNaN(inicio) || isNaN(fim) || fim <= inicio) return 1;
    const agora = Date.now();
    if (agora >= fim) return 1;
    if (agora <= inicio) return 0;
    return (agora - inicio) / (fim - inicio);
}

module.exports = {
    GRUPOS, GRUPO_LABEL, GRUPO_ORDER, GRUPO_COLOR,
    DISCIPLINAS, DISCIPLINAS_LIST,
    RARIDADES, RARIDADE_LABEL, RARIDADE_COLOR,
    REGISTRO_TIPOS, REFINO_UNLOCK_NIVEL, ENGENHARIA_NIVEL_MIN,
    STATUS,
    statusDisciplina,
    formatDuracao, formatConhecimento, formatDataCurta, progresso,
};
