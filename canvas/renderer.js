const { createCanvas, loadImage: _originalLoadImage } = require('@napi-rs/canvas');
const { formatarTexto } = require('../utils/helpers');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { cenasAtivas, missoesPreparacao, renderTimers, arenasDraft, timersTurno, mestresNarrando } = require('../utils/state');
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

async function loadImage(source) {
    if (typeof source === 'string' && source.includes('ernas.com.br/')) {
        if (source.includes('ernas.com.br/assets/')) {
            const localPath = source.replace(/https?:\/\/(www\.)?ernas\.com\.br\/assets\//, '/var/www/assets/');
            if (fs.existsSync(localPath)) {
                return _originalLoadImage(localPath);
            }
        }
        try {
            const response = await axios.get(source, {
                responseType: 'arraybuffer',
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });
            return _originalLoadImage(response.data);
        } catch (e) {}
    }
    return _originalLoadImage(source);
}

const HUD_ASSET_PATH = './assets/ui/painel-hud-medieval.png';
const HUD_GOLD = '#D4AF37';
const HUD_TEXT = '#F4E7C8';
const HUD_MUTED = '#AEB6C2';
const HUD_PANEL = 'rgba(18, 20, 27, 0.78)';
const HUD_BORDER = 'rgba(212, 175, 55, 0.28)';

async function drawHudBase(ctx, w, h, options = {}) {
    const focusX = Math.max(0, Math.min(1, options.focusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, options.focusY ?? 0.5));

    ctx.fillStyle = '#0F1015';
    ctx.fillRect(0, 0, w, h);

    try {
        const bg = await loadImage(HUD_ASSET_PATH);
        const scale = Math.max(w / bg.width, h / bg.height);
        const sw = w / scale;
        const sh = h / scale;
        const sx = Math.max(0, (bg.width - sw) * focusX);
        const sy = Math.max(0, (bg.height - sh) * focusY);
        ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, w, h);
    } catch (e) {
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#20222B');
        grd.addColorStop(1, '#0F1015');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, h);
    overlay.addColorStop(0, 'rgba(6, 7, 10, 0.12)');
    overlay.addColorStop(0.45, 'rgba(6, 7, 10, 0.38)');
    overlay.addColorStop(1, 'rgba(6, 7, 10, 0.55)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, w, h);
}

function drawHudBox(ctx, x, y, w, h, radius = 12) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = HUD_PANEL;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = HUD_BORDER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
    ctx.stroke();
}

function drawHudHeader(ctx, title, subtitle, x, y, width) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(title, x, y);

    if (subtitle) {
        ctx.fillStyle = HUD_MUTED;
        ctx.font = '18px sans-serif';
        ctx.fillText(subtitle, x + 2, y + 34);
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 62);
    ctx.lineTo(x + width, y + 62);
    ctx.stroke();
}

function trimToWidth(ctx, text, maxWidth) {
    const str = String(text || '');
    if (ctx.measureText(str).width <= maxWidth) return str;
    let out = str;
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
        out = out.slice(0, -1);
    }
    return `${out}...`;
}

async function gerarBannerPerfilLegacy(p) {
    const canvas = createCanvas(1100, 415);
    const ctx = canvas.getContext('2d');

    const colorHex = typeof p.indice_poder_cor === 'number' 
        ? `#${p.indice_poder_cor.toString(16).padStart(6, '0')}` 
        : (p.indice_poder_cor || '#3498DB');

    // Fundo base (Seção Principal)
    ctx.fillStyle = '#1A1C23';
    ctx.fillRect(0, 0, 900, 415);

    // Forma geométrica no fundo
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(300, 0);
    ctx.lineTo(150, 300);
    ctx.lineTo(0, 300);
    ctx.fill();
    
    // Gradiente escuro para suavizar
    const grd = ctx.createLinearGradient(0, 0, 900, 0);
    grd.addColorStop(0, 'rgba(26, 28, 35, 0.3)');
    grd.addColorStop(0.35, 'rgba(26, 28, 35, 0.95)');
    grd.addColorStop(1, '#1A1C23');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 900, 300);

    // Separador para a área de skills
    ctx.fillStyle = '#13141C';
    ctx.fillRect(0, 300, 900, 115);
    
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 300);
    ctx.lineTo(900, 300);
    ctx.stroke();

    // Avatar
    const avatarSize = 220;
    const avatarX = 80;
    const avatarY = 40;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    try {
        const avatar = await loadImage(p.avatar_url || 'https://i.imgur.com/vHqB3q0.png');
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch(e) {
        ctx.fillStyle = '#333';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    // Moldura do Avatar
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    const nome = formatarTexto(p.nome);
    const titulo = p.titulo ? formatarTexto(p.titulo) : '';
    const raca = formatarTexto(p.raca);
    const classe = formatarTexto(p.classe);

    // Textos Principais
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText(nome, 340, 90);

    if (titulo) {
        ctx.fillStyle = colorHex;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(titulo, 340, 130);
    }

    ctx.fillStyle = '#A0AAB5';
    ctx.font = '22px sans-serif';
    ctx.fillText(`${raca} â€¢ ${classe}`, 340, 170);

    // Status boxes (Rank & Nível, Tier & Poder)
    const drawConsolidatedStat = (label, mainVal, subVal, x, y, w) => {
        ctx.fillStyle = '#252830';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, 85, 12);
        } else {
            ctx.fillRect(x, y, w, 85);
        }
        ctx.fill();
        
        ctx.strokeStyle = '#2D313E';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.fillStyle = '#8B949E';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x + w / 2, y + 22);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(mainVal, x + w / 2, y + 50);
        
        ctx.fillStyle = colorHex;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(subVal, x + w / 2, y + 72);
        ctx.textAlign = 'left';
    };

    const romanTiers = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
    const tierNum = p.indice_poder_faixa || 1;
    const tierRomano = romanTiers[tierNum] || String(tierNum);

    drawConsolidatedStat('Rank & Nível', `${p.rank || '-'}`, `Nível ${p.nivel || 1}`, 420, 195, 200);
    drawConsolidatedStat('Tier & Poder', `Tier ${tierRomano}`, `${(p.indice_poder || 0).toLocaleString('pt-BR')} Poder`, 640, 195, 200);

    // Deck de Habilidades
    const skillsStart = 71;
    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('DECK DE HABILIDADES', skillsStart, 323);

    const skills = p.build_skills || [];
    const slots = [
        skills.find(s => s.slot === 'racial'),
        skills.find(s => s.slot === '1'),
        skills.find(s => s.slot === '2'),
        skills.find(s => s.slot === '3'),
        skills.find(s => s.slot === '4'),
        skills.find(s => s.slot === '5'),
        skills.find(s => s.slot === '6'),
        skills.find(s => s.slot === '7')
    ];

    const slotSize = 58;
    const slotY = 338;
    for (let i = 0; i < 8; i++) {
        const slotX = skillsStart + i * 100;
        const s = slots[i];

        if (s) {
            ctx.save();
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(slotX, slotY, slotSize, slotSize, 10);
            } else {
                ctx.rect(slotX, slotY, slotSize, slotSize);
            }
            ctx.clip();
            
            try {
                if (s.imagem_url) {
                    const img = await loadImage(s.imagem_url);
                    ctx.drawImage(img, slotX, slotY, slotSize, slotSize);
                } else {
                    ctx.fillStyle = s.tipo === 'passiva' ? '#4A2B7E' : '#2B4C7E';
                    ctx.fillRect(slotX, slotY, slotSize, slotSize);
                }
            } catch (e) {
                ctx.fillStyle = '#333';
                ctx.fillRect(slotX, slotY, slotSize, slotSize);
            }
            ctx.restore();

            ctx.strokeStyle = i === 0 ? '#D4AF37' : colorHex;
            ctx.lineWidth = i === 0 ? 3 : 2;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(slotX, slotY, slotSize, slotSize, 10);
            } else {
                ctx.rect(slotX, slotY, slotSize, slotSize);
            }
            ctx.stroke();

            if (i === 0) {
                ctx.fillStyle = '#D4AF37';
                ctx.font = '9px sans-serif';
                ctx.fillText('RACIAL', slotX, slotY - 4);
            }
        } else {
            ctx.strokeStyle = '#2D313E';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(slotX, slotY, slotSize, slotSize, 10);
            } else {
                ctx.rect(slotX, slotY, slotSize, slotSize);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#4F5660';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('+', slotX + slotSize / 2, slotY + slotSize / 2 + 7);
            ctx.textAlign = 'left';

            if (i === 0) {
                ctx.fillStyle = '#4F5660';
                ctx.font = '9px sans-serif';
                ctx.fillText('RACIAL', slotX, slotY - 4);
            }
        }
    }

    // ---------------------------------------------
    // PAINEL DE EQUIPAMENTOS (DIREITA - 900 a 1100px)
    // ---------------------------------------------
    ctx.fillStyle = '#13141C';
    ctx.fillRect(900, 0, 200, 415);

    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(900, 0);
    ctx.lineTo(900, 415);
    ctx.stroke();

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('EQUIPAMENTO', 920, 35);

    const equips = p.equipamento || [];
    const elmo = equips.find(e => ['capacete', 'cabeca', 'helmet', 'head', 'elmo'].includes(e.slot?.toLowerCase()));
    const armadura = equips.find(e => ['armadura', 'peito', 'chest', 'armor', 'body', 'veste'].includes(e.slot?.toLowerCase()));
    const arma = equips.find(e => ['arma_principal', 'arma', 'weapon', 'main_hand', 'espada', 'arco', 'bastao', 'machado', 'lança'].includes(e.slot?.toLowerCase()));
    const sapatos = equips.find(e => ['sapatos', 'botas', 'boots', 'shoes', 'feet', 'pes', 'bota'].includes(e.slot?.toLowerCase()));

    const drawEmptyEquipSlot = (label, x, y) => {
        ctx.strokeStyle = '#2D313E';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, 64, 64, 10);
        } else {
            ctx.rect(x, y, 64, 64);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#4F5660';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x + 32, y + 36);
        ctx.textAlign = 'left';
    };

    const drawOccupiedEquipSlot = async (item, x, y) => {
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, 64, 64, 10);
        } else {
            ctx.rect(x, y, 64, 64);
        }
        ctx.clip();
        
        try {
            if (item.imagem_url) {
                const img = await loadImage(item.imagem_url);
                ctx.drawImage(img, x, y, 64, 64);
            } else {
                ctx.fillStyle = '#2A2C35';
                ctx.fillRect(x, y, 64, 64);
            }
        } catch (e) {
            ctx.fillStyle = '#2A2C35';
            ctx.fillRect(x, y, 64, 64);
        }
        ctx.restore();

        const raridades = {
            comum: '#8B949E',
            raro: '#3498DB',
            epico: '#8B5CF6',
            lendario: '#F59E0B',
            mitico: '#EF4444'
        };
        const borderCol = raridades[item.raridade?.toLowerCase()] || '#2D313E';

        ctx.strokeStyle = borderCol;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, 64, 64, 10);
        } else {
            ctx.rect(x, y, 64, 64);
        }
        ctx.stroke();
    };

    if (elmo) {
        await drawOccupiedEquipSlot(elmo, 938, 70);
    } else {
        drawEmptyEquipSlot('Elmo', 938, 70);
    }

    if (armadura) {
        await drawOccupiedEquipSlot(armadura, 938, 160);
    } else {
        drawEmptyEquipSlot('Peito', 938, 160);
    }

    if (sapatos) {
        await drawOccupiedEquipSlot(sapatos, 938, 250);
    } else {
        drawEmptyEquipSlot('Botas', 938, 250);
    }

    if (arma) {
        await drawOccupiedEquipSlot(arma, 1018, 160);
    } else {
        drawEmptyEquipSlot('Arma', 1018, 160);
    }

    // Conquistas (abaixo dos equipamentos)
    const conquistas = p.conquistas;
    if (conquistas) {
        ctx.fillStyle = '#8B949E';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('CONQUISTAS', 920, 345);

        const badges = [
            { label: `${conquistas.ouro || 0}`, color: '#F59E0B' },
            { label: `${conquistas.prata || 0}`, color: '#C0C0C0' },
            { label: `${conquistas.bronze || 0}`, color: '#CD7F32' }
        ];

        badges.forEach((b, i) => {
            const bx = 920 + i * 52;
            const by = 358;

            ctx.fillStyle = '#252830';
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(bx, by, 44, 40, 8); } else { ctx.rect(bx, by, 44, 40); }
            ctx.fill();

            ctx.fillStyle = b.color;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('â˜…', bx + 22, by + 17);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(b.label, bx + 22, by + 34);
            ctx.textAlign = 'left';
        });
    }

    return canvas.toBuffer('image/png');
}

async function gerarBannerPerfil(p) {
    const w = 1100;
    const h = 500;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await drawHudBase(ctx, w, h, { focusY: 0.38 });

    const nome = formatarTexto(p.nome || 'Aventureiro');
    const titulo = p.titulo ? formatarTexto(p.titulo) : '';
    const raca = formatarTexto(p.raca || '');
    const classe = formatarTexto(p.classe || '');
    const identidade = [raca, classe].filter(Boolean).join(' â€¢ ');

    drawHudHeader(ctx, trimToWidth(ctx, nome, 520), titulo || identidade || 'Ficha do personagem', 330, 96, 690);

    const avatarSize = 210;
    const avatarX = 82;
    const avatarY = 82;

    drawHudBox(ctx, 58, 58, 258, 258, 18);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    try {
        const avatar = await loadImage(p.avatar_url || 'https://i.imgur.com/vHqB3q0.png');
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } catch (e) {
        ctx.fillStyle = '#20222B';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.strokeStyle = HUD_GOLD;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();

    if (identidade && titulo) {
        ctx.fillStyle = HUD_MUTED;
        ctx.font = '18px sans-serif';
        ctx.fillText(identidade, 332, 196);
    }

    const romanTiers = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
    const tierNum = p.indice_poder_faixa || 1;
    const tierRomano = romanTiers[tierNum] || String(tierNum);
    const stats = [
        ['Rank', p.rank || '-'],
        ['Nível', p.nivel || 1],
        ['Tier', tierRomano],
        ['Poder', (p.indice_poder || 0).toLocaleString('pt-BR')]
    ];

    stats.forEach((stat, i) => {
        const x = 330 + i * 174;
        drawHudBox(ctx, x, 216, 150, 82, 12);
        ctx.fillStyle = HUD_MUTED;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(stat[0].toUpperCase(), x + 75, 242);
        ctx.fillStyle = HUD_TEXT;
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(String(stat[1]), x + 75, 277);
        ctx.textAlign = 'left';
    });

    drawHudBox(ctx, 58, 350, 698, 104, 14);
    ctx.fillStyle = HUD_GOLD;
    ctx.fillRect(82, 376, 4, 52);
    ctx.fillStyle = HUD_MUTED;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('DECK DE HABILIDADES', 104, 382);

    const skills = p.build_skills || [];
    const slots = [
        skills.find(s => s.slot === 'racial'),
        skills.find(s => s.slot === '1'),
        skills.find(s => s.slot === '2'),
        skills.find(s => s.slot === '3'),
        skills.find(s => s.slot === '4'),
        skills.find(s => s.slot === '5'),
        skills.find(s => s.slot === '6'),
        skills.find(s => s.slot === '7')
    ];

    for (let i = 0; i < 8; i++) {
        const slotX = 104 + i * 78;
        const slotY = 396;
        const slotSize = 52;
        const skill = slots[i];

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(slotX, slotY, slotSize, slotSize, 9);
        else ctx.rect(slotX, slotY, slotSize, slotSize);
        ctx.clip();
        try {
            if (skill?.imagem_url) {
                const img = await loadImage(skill.imagem_url);
                ctx.drawImage(img, slotX, slotY, slotSize, slotSize);
            } else {
                ctx.fillStyle = 'rgba(15, 16, 21, 0.86)';
                ctx.fillRect(slotX, slotY, slotSize, slotSize);
            }
        } catch (e) {
            ctx.fillStyle = 'rgba(15, 16, 21, 0.86)';
            ctx.fillRect(slotX, slotY, slotSize, slotSize);
        }
        ctx.restore();

        ctx.strokeStyle = skill ? HUD_GOLD : 'rgba(212, 175, 55, 0.18)';
        ctx.lineWidth = skill ? 2 : 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(slotX, slotY, slotSize, slotSize, 9);
        else ctx.rect(slotX, slotY, slotSize, slotSize);
        ctx.stroke();
    }

    drawHudBox(ctx, 790, 350, 252, 104, 14);
    ctx.fillStyle = HUD_GOLD;
    ctx.fillRect(814, 376, 4, 52);
    ctx.fillStyle = HUD_MUTED;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('EQUIPAMENTO', 836, 382);

    const equips = p.equipamento || [];
    const equipSlots = [
        ['Elmo', ['capacete', 'cabeca', 'helmet', 'head', 'elmo']],
        ['Peito', ['armadura', 'peito', 'chest', 'armor', 'body', 'veste']],
        ['Arma', ['arma_principal', 'arma', 'weapon', 'main_hand', 'espada', 'arco', 'bastao', 'machado', 'lança']],
        ['Botas', ['sapatos', 'botas', 'boots', 'shoes', 'feet', 'pes', 'bota']]
    ];

    equipSlots.forEach((slot, i) => {
        const item = equips.find(e => slot[1].includes(e.slot?.toLowerCase()));
        const x = 836 + i * 48;
        const y = 398;
        ctx.fillStyle = item ? 'rgba(212, 175, 55, 0.14)' : 'rgba(15, 16, 21, 0.86)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, 38, 38, 8);
        else ctx.rect(x, y, 38, 38);
        ctx.fill();
        ctx.strokeStyle = item ? HUD_GOLD : 'rgba(212, 175, 55, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = item ? HUD_TEXT : '#5E6673';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(slot[0].slice(0, 3).toUpperCase(), x + 19, y + 24);
        ctx.textAlign = 'left';
    });

    return canvas.toBuffer('image/png');
}

async function gerarBannerLoot(item, qtd) {
    const canvas = createCanvas(800, 200);
    const ctx = canvas.getContext('2d');

    const raridades = {
        comum: '#8B949E',
        raro: '#3498DB',
        epico: '#8B5CF6',
        lendario: '#F59E0B',
        mitico: '#EF4444'
    };
    const corRaridade = raridades[item.raridade?.toLowerCase()] || '#8B949E';

    // Fundo base
    ctx.fillStyle = '#1A1C23';
    ctx.fillRect(0, 0, 800, 200);

    // Glow da raridade (elipse no fundo)
    const glowGrd = ctx.createRadialGradient(140, 100, 10, 140, 100, 180);
    glowGrd.addColorStop(0, corRaridade + '40');
    glowGrd.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrd;
    ctx.fillRect(0, 0, 350, 200);

    // Borda inferior com cor da raridade
    ctx.fillStyle = corRaridade;
    ctx.fillRect(0, 195, 800, 5);

    // Imagem do item
    const imgSize = 120;
    const imgX = 40;
    const imgY = 40;

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(imgX, imgY, imgSize, imgSize, 16); } else { ctx.rect(imgX, imgY, imgSize, imgSize); }
    ctx.clip();

    try {
        if (item.imagem_url) {
            const img = await loadImage(item.imagem_url);
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
        } else {
            ctx.fillStyle = '#252830';
            ctx.fillRect(imgX, imgY, imgSize, imgSize);
        }
    } catch (e) {
        ctx.fillStyle = '#252830';
        ctx.fillRect(imgX, imgY, imgSize, imgSize);
    }
    ctx.restore();

    // Moldura do item
    ctx.strokeStyle = corRaridade;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(imgX, imgY, imgSize, imgSize, 16); } else { ctx.rect(imgX, imgY, imgSize, imgSize); }
    ctx.stroke();

    // Textos
    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LOOT DROP', 200, 55);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(formatarTexto(item.nome), 200, 100);

    ctx.fillStyle = corRaridade;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(formatarTexto(item.raridade || 'Comum'), 200, 132);

    ctx.fillStyle = '#A0AAB5';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${formatarTexto(item.categoria || '')}${item.grau ? ' â€¢ Grau ' + item.grau : ''}`, 200, 162);

    // Quantidade (badge no canto superior direito)
    if (qtd > 1) {
        const qtdStr = `x${qtd}`;
        ctx.font = 'bold 24px sans-serif';
        const tw = ctx.measureText(qtdStr).width;
        const qx = 760 - tw;

        ctx.fillStyle = '#252830';
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(qx - 14, 20, tw + 28, 40, 10); } else { ctx.rect(qx - 14, 20, tw + 28, 40); }
        ctx.fill();

        ctx.fillStyle = corRaridade;
        ctx.fillText(qtdStr, qx, 49);
    }

    return canvas.toBuffer('image/png');
}

async function gerarBannerInventarioLegacy(p, sliceItens, categoria, pag, totalPaginas) {
    const w = 1000;
    const h = 580;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    const raridades = {
        comum: '#8B949E',
        raro: '#3498DB',
        epico: '#8B5CF6',
        lendario: '#F59E0B',
        mitico: '#EF4444'
    };

    // Fundo base
    ctx.fillStyle = '#1A1C23';
    ctx.fillRect(0, 0, w, h);
    
    // Header
    const colorHex = typeof p.indice_poder_cor === 'number' 
        ? `#${p.indice_poder_cor.toString(16).padStart(6, '0')}` 
        : (p.indice_poder_cor || '#3498DB');
        
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, w, 8); // Borda superior
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`Inventário de ${formatarTexto(p.nome)}`, 40, 60);
    
    const libras = p.libras || p.saldo || 0;
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${libras.toLocaleString('pt-BR')} Libras`, w - 40, 60);
    ctx.textAlign = 'left';
    
    // Config da Grade (2 linhas de 4 itens, max 8 itens)
    const cols = 4;
    const rows = 2;
    const marginX = 40;
    const marginY = 100;
    const cardW = 215;
    const cardH = 190;
    const gapX = 20;
    const gapY = 20;
    
    for (let i = 0; i < 8; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = marginX + col * (cardW + gapX);
        const y = marginY + row * (cardH + gapY);
        
        const item = sliceItens[i];
        
        ctx.fillStyle = '#22252F';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, cardW, cardH, 12); ctx.fill(); } 
        else { ctx.fillRect(x, y, cardW, cardH); }
        
        if (item) {
            const raridade = (item.raridade || item.item?.raridade || 'comum').toLowerCase();
            const corRaridade = raridades[raridade] || '#8B949E';
            
            const iconSize = 80;
            const iconX = x + (cardW - iconSize) / 2;
            const iconY = y + 20;
            
            ctx.save();
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(iconX, iconY, iconSize, iconSize, 8); } 
            else { ctx.rect(iconX, iconY, iconSize, iconSize); }
            ctx.clip();
            
            try {
                const url = item.imagem_url || item.item?.imagem_url;
                if (url) {
                    const img = await loadImage(url);
                    ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
                } else {
                    ctx.fillStyle = '#111';
                    ctx.fillRect(iconX, iconY, iconSize, iconSize);
                }
            } catch (e) {
                ctx.fillStyle = '#111';
                ctx.fillRect(iconX, iconY, iconSize, iconSize);
            }
            ctx.restore();
            
            ctx.strokeStyle = corRaridade;
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(iconX, iconY, iconSize, iconSize, 8); }
            else { ctx.rect(iconX, iconY, iconSize, iconSize); }
            ctx.stroke();
            
            const qtd = item.quantidade || 1;
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`x${qtd}`, iconX + iconSize + 15, iconY + iconSize - 5);
            ctx.textAlign = 'left';
            
            if (item.equipado) {
                ctx.fillStyle = '#2ECC71';
                ctx.font = 'bold 12px sans-serif';
                ctx.fillText('EQUIPADO', x + 10, iconY + 15);
            }
            
            const itemNome = formatarTexto(item.nome || item.item?.nome || 'Item Desconhecido');
            const catLabel = formatarTexto(item.categoria || item.item?.categoria || '');
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            
            let nomeDisplay = itemNome;
            if (ctx.measureText(itemNome).width > cardW - 20) {
                nomeDisplay = itemNome.substring(0, 16) + '...';
            }
            ctx.fillText(nomeDisplay, x + cardW / 2, y + 130);
            
            ctx.fillStyle = corRaridade;
            ctx.font = '14px sans-serif';
            ctx.fillText(formatarTexto(raridade), x + cardW / 2, y + 152);
            
            ctx.fillStyle = '#A0AAB5';
            ctx.font = '13px sans-serif';
            ctx.fillText(catLabel, x + cardW / 2, y + 172);
            
            ctx.textAlign = 'left';
        } else {
            ctx.fillStyle = '#15171D';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('vazio', x + cardW / 2, y + cardH / 2 + 8);
            ctx.textAlign = 'left';
        }
    }
    
    ctx.fillStyle = '#8B949E';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Categoria: ${formatarTexto(categoria === 'todos' ? 'Tudo' : categoria)}`, 40, h - 20);
    
    ctx.textAlign = 'right';
    ctx.fillText(`Página ${pag + 1} de ${totalPaginas}`, w - 40, h - 20);
    
    return canvas.toBuffer('image/png');
}

async function gerarBannerInventario(p, sliceItens, categoria, pag, totalPaginas) {
    const w = 1000;
    const h = 580;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await drawHudBase(ctx, w, h);

    const categoriaLabel = formatarTexto(categoria === 'todos' ? 'Tudo' : categoria);
    const libras = p.libras || p.saldo || 0;
    drawHudHeader(ctx, `Inventário de ${formatarTexto(p.nome || 'Aventureiro')}`, `${categoriaLabel} â€¢ ${libras.toLocaleString('pt-BR')} Libras`, 82, 100, 836);

    const raridades = {
        comum: '#8B949E',
        raro: '#3498DB',
        epico: '#8B5CF6',
        lendario: '#F59E0B',
        mitico: '#EF4444'
    };

    const cols = 4;
    const marginX = 82;
    const marginY = 196;
    const cardW = 198;
    const cardH = 128;
    const gapX = 20;
    const gapY = 22;

    for (let i = 0; i < 8; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = marginX + col * (cardW + gapX);
        const y = marginY + row * (cardH + gapY);
        const item = sliceItens[i];

        drawHudBox(ctx, x, y, cardW, cardH, 12);
        ctx.fillStyle = HUD_GOLD;
        ctx.fillRect(x + 14, y + 22, 4, cardH - 44);

        if (!item) {
            ctx.fillStyle = '#5E6673';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Vazio', x + cardW / 2, y + cardH / 2 + 6);
            ctx.textAlign = 'left';
            continue;
        }

        const raridade = (item.raridade || item.item?.raridade || 'comum').toLowerCase();
        const corRaridade = raridades[raridade] || HUD_MUTED;
        const iconSize = 58;
        const iconX = x + 32;
        const iconY = y + 28;
        const qtd = item.quantidade || 1;

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(iconX, iconY, iconSize, iconSize, 10);
        else ctx.rect(iconX, iconY, iconSize, iconSize);
        ctx.clip();
        try {
            const url = item.imagem_url || item.item?.imagem_url;
            if (url) {
                const img = await loadImage(url);
                ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
            } else {
                ctx.fillStyle = '#101116';
                ctx.fillRect(iconX, iconY, iconSize, iconSize);
            }
        } catch (e) {
            ctx.fillStyle = '#101116';
            ctx.fillRect(iconX, iconY, iconSize, iconSize);
        }
        ctx.restore();

        ctx.strokeStyle = corRaridade;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(iconX, iconY, iconSize, iconSize, 10);
        else ctx.rect(iconX, iconY, iconSize, iconSize);
        ctx.stroke();

        if (qtd > 1) {
            ctx.fillStyle = 'rgba(15, 16, 21, 0.9)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(iconX + 34, iconY + 37, 34, 24, 10);
            else ctx.rect(iconX + 34, iconY + 37, 34, 24);
            ctx.fill();
            ctx.fillStyle = HUD_TEXT;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`x${qtd}`, iconX + 51, iconY + 54);
            ctx.textAlign = 'left';
        }

        const itemNome = formatarTexto(item.nome || item.item?.nome || 'Item Desconhecido');
        const catLabel = formatarTexto(item.categoria || item.item?.categoria || '');

        ctx.fillStyle = HUD_TEXT;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(trimToWidth(ctx, itemNome, 92), x + 104, y + 48);

        ctx.fillStyle = corRaridade;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(formatarTexto(raridade), x + 104, y + 70);

        ctx.fillStyle = HUD_MUTED;
        ctx.font = '12px sans-serif';
        ctx.fillText(trimToWidth(ctx, catLabel, 82), x + 104, y + 90);

        if (item.equipado) {
            ctx.fillStyle = HUD_GOLD;
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('EQUIPADO', x + 32, y + 106);
        }
    }

    ctx.fillStyle = 'rgba(15, 16, 21, 0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(82, 510, 836, 38, 12);
    else ctx.rect(82, 510, 836, 38);
    ctx.fill();

    ctx.fillStyle = HUD_MUTED;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Página ${pag + 1} de ${totalPaginas}`, w / 2, 535);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

async function gerarBannerRankingLegacy(tipo, dados) {
    const canvas = createCanvas(800, 620);
    const ctx = canvas.getContext('2d');

    // Fundo base
    ctx.fillStyle = '#1A1C23';
    ctx.fillRect(0, 0, 800, 620);

    // Gradiente sutil
    const grd = ctx.createLinearGradient(0, 0, 0, 620);
    grd.addColorStop(0, 'rgba(26, 28, 35, 0.4)');
    grd.addColorStop(1, '#13141C');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 800, 620);

    // Cabeçalho
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('RANKING DE ARKANDIA', 50, 60);

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 18px sans-serif';
    const tipoTraduzido = {
        poder: 'ÍNDICE DE PODER',
        nivel: 'NÍVEL E EXPERIÊNCIA',
        guildas: 'GUILDAS DE VERMÉCIA',
        arena: 'PONTOS DE ARENA'
    }[tipo.toLowerCase()] || tipo.toUpperCase();
    ctx.fillText(tipoTraduzido, 50, 95);

    // Linha divisória
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(50, 115);
    ctx.lineTo(750, 115);
    ctx.stroke();

    const list = Array.isArray(dados) ? dados : (dados.personagens || dados.guildas || dados.rankings || dados.data || []);
    const top10 = list.slice(0, 10);

    if (top10.length === 0) {
        ctx.fillStyle = '#8B949E';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum dado encontrado no ranking no momento.', 400, 320);
        ctx.textAlign = 'left';
        return canvas.toBuffer('image/png');
    }

    let startY = 135;
    const rowHeight = 44;

    for (let i = 0; i < top10.length; i++) {
        const item = top10[i];
        const y = startY + i * rowHeight;

        // Fundo da linha
        if (i === 0) {
            ctx.fillStyle = 'rgba(212, 175, 55, 0.15)'; // Ouro para #1
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = 1.5;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(48, y, 704, rowHeight - 4, 8);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillRect(48, y, 704, rowHeight - 4);
            }
        } else {
            ctx.fillStyle = i % 2 === 0 ? '#1E1F26' : '#17181F';
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(48, y, 704, rowHeight - 4, 8);
                ctx.fill();
            } else {
                ctx.fillRect(48, y, 704, rowHeight - 4);
            }
        }

        // Posição
        ctx.fillStyle = i === 0 ? '#D4AF37' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#8B949E';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        const posText = `#${i + 1}`;
        ctx.fillText(posText, 80, y + rowHeight / 2 + 5);

        // Nome
        ctx.textAlign = 'left';
        ctx.fillStyle = i === 0 ? '#FFFFFF' : '#D0D5DD';
        ctx.font = i === 0 ? 'bold 16px sans-serif' : '15px sans-serif';
        
        let nomeStr = item.nome || 'Desconhecido';
        if (item.sigla) {
            nomeStr = `${nomeStr} [${item.sigla}]`;
        }
        
        // Detalhes menores (classe/raça se personagem)
        let subText = '';
        if (item.classe && item.raca) {
            subText = ` (${formatarTexto(item.raca)} â€¢ ${formatarTexto(item.classe)})`;
        }

        ctx.fillText(nomeStr + subText, 130, y + rowHeight / 2 + 5);

        // Valor
        ctx.textAlign = 'right';
        ctx.fillStyle = i === 0 ? '#D4AF37' : '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';

        let valorText = '';
        if (tipo === 'poder') {
            valorText = `${(item.poder || item.indice_poder || 0).toLocaleString('pt-BR')} Poder`;
        } else if (tipo === 'nivel') {
            valorText = `Nível ${item.nivel || 1}`;
        } else if (tipo === 'guildas') {
            valorText = `${(item.xp_total_guilda || 0).toLocaleString('pt-BR')} XP â€¢ ${(item.banco_libras || item.libras || 0).toLocaleString('pt-BR')} L`;
        } else if (tipo === 'arena') {
            valorText = `${item.rating || item.pontos_arena || item.arena_pontos || 0} pts`;
        }

        ctx.fillText(valorText, 730, y + rowHeight / 2 + 5);
        ctx.textAlign = 'left';
    }

    return canvas.toBuffer('image/png');
}

async function gerarBannerRanking(tipo, dados) {
    const w = 800;
    const h = 620;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await drawHudBase(ctx, w, h);

    const tipoTraduzido = {
        poder: 'Índice de Poder',
        nivel: 'Nível e Experiência',
        guildas: 'Guildas de Vermécia',
        arena: 'Pontos de Arena'
    }[String(tipo).toLowerCase()] || formatarTexto(tipo);

    drawHudHeader(ctx, 'Ranking', tipoTraduzido, 62, 92, 676);

    const list = Array.isArray(dados) ? dados : (dados.personagens || dados.guildas || dados.rankings || dados.data || []);
    const top10 = list.slice(0, 10);

    if (top10.length === 0) {
        drawHudBox(ctx, 62, 230, 676, 130, 14);
        ctx.fillStyle = HUD_MUTED;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum dado encontrado no ranking no momento.', w / 2, 306);
        ctx.textAlign = 'left';
        return canvas.toBuffer('image/png');
    }

    const startY = 174;
    const rowHeight = 38;

    for (let i = 0; i < top10.length; i++) {
        const item = top10[i];
        const y = startY + i * rowHeight;

        drawHudBox(ctx, 62, y, 676, 32, 9);
        ctx.fillStyle = i === 0 ? 'rgba(212, 175, 55, 0.28)' : 'rgba(212, 175, 55, 0.12)';
        ctx.fillRect(82, y + 8, 4, 16);

        ctx.fillStyle = i === 0 ? HUD_GOLD : HUD_MUTED;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${i + 1}`, 110, y + 22);

        ctx.textAlign = 'left';
        ctx.fillStyle = i === 0 ? '#FFFFFF' : HUD_TEXT;
        ctx.font = i === 0 ? 'bold 15px sans-serif' : '14px sans-serif';

        let nomeStr = item.nome || 'Desconhecido';
        if (item.sigla) nomeStr = `${nomeStr} [${item.sigla}]`;

        let subText = '';
        if (item.classe && item.raca) {
            subText = ` â€¢ ${formatarTexto(item.raca)} / ${formatarTexto(item.classe)}`;
        }

        ctx.fillText(trimToWidth(ctx, nomeStr + subText, 410), 146, y + 22);

        let valorText = '';
        if (tipo === 'poder') {
            valorText = `${(item.poder || item.indice_poder || 0).toLocaleString('pt-BR')} Poder`;
        } else if (tipo === 'nivel') {
            valorText = `Nível ${item.nivel || 1}`;
        } else if (tipo === 'guildas') {
            valorText = `${(item.xp_total_guilda || 0).toLocaleString('pt-BR')} XP`;
        } else if (tipo === 'arena') {
            valorText = `${item.rating || item.pontos_arena || item.arena_pontos || 0} pts`;
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = i === 0 ? HUD_GOLD : HUD_MUTED;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(trimToWidth(ctx, valorText, 150), 710, y + 22);
        ctx.textAlign = 'left';
    }

    return canvas.toBuffer('image/png');
}

async function gerarBannerGuilda(guilda) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');

    // Fundo base
    ctx.fillStyle = '#1C1E24';
    ctx.fillRect(0, 0, 800, 450);

    // Gradiente de fundo medieval
    const grd = ctx.createLinearGradient(0, 0, 800, 0);
    grd.addColorStop(0, 'rgba(20, 21, 26, 0.4)');
    grd.addColorStop(1, '#1C1E24');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 800, 450);

    // Desenha escudo de guilda (Brasão)
    const shieldX = 50;
    const shieldY = 50;
    const shieldW = 120;
    const shieldH = 140;

    ctx.fillStyle = '#D4AF37'; // Borda dourada do escudo
    ctx.beginPath();
    ctx.moveTo(shieldX + shieldW/2, shieldY);
    ctx.lineTo(shieldX + shieldW, shieldY + 30);
    ctx.lineTo(shieldX + shieldW, shieldY + shieldH - 30);
    ctx.quadraticCurveTo(shieldX + shieldW, shieldY + shieldH, shieldX + shieldW/2, shieldY + shieldH);
    ctx.quadraticCurveTo(shieldX, shieldY + shieldH, shieldX, shieldY + shieldH - 30);
    ctx.lineTo(shieldX, shieldY + 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8B0000'; // Fundo vermelho do escudo
    ctx.beginPath();
    ctx.moveTo(shieldX + shieldW/2, shieldY + 6);
    ctx.lineTo(shieldX + shieldW - 6, shieldY + 33);
    ctx.lineTo(shieldX + shieldW - 6, shieldY + shieldH - 33);
    ctx.quadraticCurveTo(shieldX + shieldW - 6, shieldY + shieldH - 6, shieldX + shieldW/2, shieldY + shieldH - 6);
    ctx.quadraticCurveTo(shieldX + 6, shieldY + shieldH - 6, shieldX + 6, shieldY + shieldH - 33);
    ctx.lineTo(shieldX + 6, shieldY + 33);
    ctx.closePath();
    ctx.fill();

    // Icone/Emblema oficial ou Inicial da Guilda
    let logoCarregada = false;
    const logoUrl = guilda.emblema_url || guilda.logo_url;
    if (logoUrl) {
        try {
            const logoImg = await loadImage(logoUrl);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(shieldX + shieldW/2, shieldY + 6);
            ctx.lineTo(shieldX + shieldW - 6, shieldY + 33);
            ctx.lineTo(shieldX + shieldW - 6, shieldY + shieldH - 33);
            ctx.quadraticCurveTo(shieldX + shieldW - 6, shieldY + shieldH - 6, shieldX + shieldW/2, shieldY + shieldH - 6);
            ctx.quadraticCurveTo(shieldX + 6, shieldY + shieldH - 6, shieldX + 6, shieldY + shieldH - 33);
            ctx.lineTo(shieldX + 6, shieldY + 33);
            ctx.closePath();
            ctx.clip();
            
            ctx.drawImage(logoImg, shieldX + 6, shieldY + 6, shieldW - 12, shieldH - 12);
            ctx.restore();
            logoCarregada = true;
        } catch (e) {
            console.error('Erro ao carregar emblema da guilda:', e.message);
        }
    }

    if (!logoCarregada) {
        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 64px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const inicial = guilda.nome ? guilda.nome.charAt(0).toUpperCase() : 'G';
        ctx.fillText(inicial, shieldX + shieldW/2, shieldY + shieldH/2 + 5);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
    }

    // Nome e Sigla da Guilda
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    const nome = formatarTexto(guilda.nome || 'Sem Nome');
    const sigla = guilda.sigla ? `[${guilda.sigla.toUpperCase()}]` : '';
    ctx.fillText(`${nome} ${sigla}`, 200, 90);

    // Mestre / Líder da Guilda
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 18px sans-serif';
    const liderNome = (typeof guilda.lider === 'object' && guilda.lider !== null)
        ? (guilda.lider.nome || guilda.lider.lider_nome || 'Desconhecido')
        : (guilda.lider || guilda.lider_nome || 'Desconhecido');
    const lider = formatarTexto(liderNome);
    ctx.fillText(`Líder: ${lider}`, 200, 125);

    ctx.fillStyle = '#8B949E';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Membros: ${guilda.membros_qtd || (guilda.membros && guilda.membros.length) || 0} / 50`, 200, 155);

    // Caixa de Informações
    const drawInfoBox = (label, value, x, y, w, h) => {
        ctx.fillStyle = '#13141C';
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, w, h, 10); } else { ctx.rect(x, y, w, h); }
        ctx.fill();

        ctx.strokeStyle = '#2D313E';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#8B949E';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label.toUpperCase(), x + 15, y + 25);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`${value}`, x + 15, y + 55);
    };

    drawInfoBox('Nível da Guilda', `${guilda.nivel || 1}`, 50, 220, 220, 75);
    drawInfoBox('Saldo do Banco', `${guilda.libras || guilda.saldo || 0} Libras`, 290, 220, 220, 75);
    drawInfoBox('Experiência', `${guilda.xp || 0} XP`, 530, 220, 220, 75);

    // Seção de Perks
    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('BÔNUS E PERKS ATIVOS', 50, 335);

    const perks = guilda.perks || guilda.perks_ativos || [];
    if (perks.length === 0) {
        ctx.fillStyle = '#4F5660';
        ctx.font = 'italic 15px sans-serif';
        ctx.fillText('Nenhum bÃ´nus ativo no momento.', 50, 370);
    } else {
        perks.slice(0, 3).forEach((p, idx) => {
            const px = 50 + idx * 240;
            ctx.fillStyle = '#1A1C23';
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(px, 350, 220, 50, 8); } else { ctx.rect(px, 350, 220, 50); }
            ctx.fill();

            ctx.fillStyle = '#2E5A36';
            ctx.fillRect(px, 350, 4, 50);

            const perkKey = p.perk_key || '';
            const traducoes = {
                bencao_treinamento: { nome: 'Treinamento Cósmico', efeito: '+10% XP em Missões' },
                banco_expandido: { nome: 'Cofre Expandido', efeito: 'Banco de Libras ampliado' },
                escudo_conquista: { nome: 'Escudo de Glória', efeito: 'Proteção em masmorras' }
            };

            const info = traducoes[perkKey.toLowerCase()] || {
                nome: p.nome || formatarTexto(perkKey.replace(/_/g, ' ')) || 'BÃ´nus Ativo',
                efeito: p.efeito || 'Efeito ativo na guilda'
            };

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(info.nome, px + 15, 368);

            ctx.fillStyle = '#8B949E';
            ctx.font = '10px sans-serif';
            ctx.fillText(info.efeito, px + 15, 385);
        });
    }

    return canvas.toBuffer('image/png');
}

async function renderInventarioPage(interaction, p, itens, categoria, pagina, options = {}) {
    const ITEMS_PER_PAGE = 8;

    // Filtra itens por categoria
    let itensFiltrados = itens;
    if (categoria !== 'todos') {
        itensFiltrados = itens.filter(i => {
            const cat = (i.categoria || i.item?.categoria || '').toLowerCase();
            if (categoria === 'armas') return ['arma', 'espada', 'arco', 'bastao', 'lança', 'machado', 'principal', 'secundaria', 'weapon'].some(w => cat.includes(w));
            if (categoria === 'armaduras') return ['armadura', 'peito', 'elmo', 'capacete', 'bota', 'sapato', 'escudo', 'luvas', 'calça', 'armor', 'shield', 'helmet', 'boots'].some(w => cat.includes(w));
            if (categoria === 'consumiveis') return ['consumivel', 'poção', 'comida', 'potion', 'scroll', 'pergaminho'].some(w => cat.includes(w));
            if (categoria === 'materiais') return ['material', 'minerio', 'couro', 'essencia', 'ore', 'herb', 'planta'].some(w => cat.includes(w));
            return false;
        });
    }

    const totalPaginas = Math.ceil(itensFiltrados.length / ITEMS_PER_PAGE) || 1;
    const pag = Math.max(0, Math.min(pagina, totalPaginas - 1));
    const slice = itensFiltrados.slice(pag * ITEMS_PER_PAGE, (pag + 1) * ITEMS_PER_PAGE);

    const buffer = await gerarBannerInventario(p, slice, categoria, pag, totalPaginas);
    const attachment = new AttachmentBuilder(buffer, { name: 'inventario.png' });

    const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://inventario.png');

    const customIdPrefix = options.customIdPrefix || 'inventario';
    const prefixComponents = options.prefixComponents || [];
    const catLabel = (value, label) => `${categoria === value ? '◆' : '◇'} ${label}`;

    // Botões de Categorias
    const rowCats = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${customIdPrefix}_cat_${p.id}_todos`).setLabel(catLabel('todos', 'Tudo')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_cat_${p.id}_armas`).setLabel(catLabel('armas', 'Armas')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_cat_${p.id}_armaduras`).setLabel(catLabel('armaduras', 'Defesas')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_cat_${p.id}_consumiveis`).setLabel(catLabel('consumiveis', 'Consumíveis')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_cat_${p.id}_materiais`).setLabel(catLabel('materiais', 'Materiais')).setStyle(ButtonStyle.Secondary)
    );

    // Botões de Paginação
    const rowPag = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${customIdPrefix}_pag_${p.id}_${categoria}_${pag - 1}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId(`${customIdPrefix}_pag_${p.id}_${categoria}_${pag + 1}`).setLabel('Próximo ▶').setStyle(ButtonStyle.Secondary).setDisabled(pag >= totalPaginas - 1)
    );

    const components = [...prefixComponents, rowCats];
    if (totalPaginas > 1) {
        components.push(rowPag);
    }

    if (options.useEditReply || interaction.deferred || interaction.replied) {
        return await interaction.editReply({ embeds: [embed], files: [attachment], attachments: [], components, content: null });
    } else {
        return await interaction.update({ embeds: [embed], files: [attachment], attachments: [], components, content: null });
    }
}

async function gerarBannerPainelJogador(user = {}, context = {}) {
    const w = 1000;
    const h = 560;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const bgPath = './assets/ui/painel-hud-medieval.png';

    ctx.fillStyle = '#0F1015';
    ctx.fillRect(0, 0, w, h);

    try {
        const bg = await loadImage(bgPath);
        const scale = Math.max(w / bg.width, h / bg.height);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (bg.width - sw) / 2;
        const sy = (bg.height - sh) / 2;
        ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, w, h);
    } catch (e) {
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#20222B');
        grd.addColorStop(1, '#0F1015');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, h);
    overlay.addColorStop(0, 'rgba(6, 7, 10, 0.1)');
    overlay.addColorStop(0.42, 'rgba(6, 7, 10, 0.32)');
    overlay.addColorStop(1, 'rgba(6, 7, 10, 0.5)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, w, h);

    const drawPanel = (x, y, width, height, title) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = 'rgba(18, 20, 27, 0.78)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, width, height, 14);
        else ctx.rect(x, y, width, height);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, width, height, 14);
        else ctx.rect(x, y, width, height);
        ctx.stroke();

        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(x + 18, y + 20, 4, height - 40);

        ctx.fillStyle = '#F4E7C8';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, x + width / 2, y + height / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    };

    const displayName = user.globalName || user.username || 'Aventureiro';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('Painel do Jogador', 82, 132);

    ctx.fillStyle = '#AEB6C2';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Sessão privada para ${displayName}`, 84, 166);

    const contextParts = [];
    if (context.personagemNome) contextParts.push(`Personagem: ${formatarTexto(context.personagemNome)}`);
    if (Number.isFinite(context.inventarioQtd)) contextParts.push(`Inventário: ${context.inventarioQtd} itens`);
    if (Number.isFinite(context.missoesAbertas)) contextParts.push(`Missões abertas: ${context.missoesAbertas}`);

    if (contextParts.length > 0) {
        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(contextParts.join('  â€¢  '), 84, 188);
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(82, 204);
    ctx.lineTo(918, 204);
    ctx.stroke();

    const cards = [
        'Perfil',
        'Inventário',
        'Missões',
        'Rankings',
        'Guilda',
        'Cena RP'
    ];

    const startX = 82;
    const startY = 236;
    const cardW = 260;
    const cardH = 92;
    const gapX = 28;
    const gapY = 24;

    cards.forEach((card, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        drawPanel(
            startX + col * (cardW + gapX),
            startY + row * (cardH + gapY),
            cardW,
            cardH,
            card
        );
    });

    ctx.fillStyle = 'rgba(15, 16, 21, 0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(82, 478, 836, 44, 12);
    else ctx.rect(82, 478, 836, 44);
    ctx.fill();

    ctx.fillStyle = '#AEB6C2';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use os botões abaixo para navegar sem expor seus dados no canal.', w / 2, 505);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

async function gerarBannerEnciclopedia() {
    const w = 1000;
    const h = 560;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await drawHudBase(ctx, w, h, { focusY: 0.42 });

    drawHudHeader(ctx, 'Enciclopedia', 'Acervo oficial do universo de Ernas', 82, 108, 836);

    const cards = [
        {
            title: 'Itens',
            lines: ['Equipamentos', 'Consumiveis', 'Materiais']
        },
        {
            title: 'Habilidades',
            lines: ['Grimorios', 'Skills de classe', 'Tecnicas registradas']
        },
        {
            title: 'Bestiario',
            lines: ['Criaturas', 'Monstros', 'Entidades de Ernas']
        },
        {
            title: 'Canones',
            lines: ['NPCs', 'Figuras historicas', 'Nomes conhecidos']
        }
    ];

    const cardW = 390;
    const cardH = 126;
    const startX = 82;
    const startY = 198;
    const gapX = 54;
    const gapY = 28;

    cards.forEach((card, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);

        drawHudBox(ctx, x, y, cardW, cardH, 14);
        ctx.fillStyle = HUD_GOLD;
        ctx.fillRect(x + 22, y + 22, 4, cardH - 44);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 25px sans-serif';
        ctx.fillText(card.title, x + 50, y + 38);

        ctx.fillStyle = HUD_MUTED;
        ctx.font = '16px sans-serif';
        card.lines.forEach((line, lineIndex) => {
            ctx.fillText(line, x + 50, y + 62 + (lineIndex * 20));
        });
    });

    drawHudBox(ctx, 82, 506, 836, 30, 10);
    ctx.fillStyle = HUD_TEXT;
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use as abas para navegar ou abra a busca para localizar qualquer registro.', w / 2, 526);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}


// =====================================
// FUNÇÕES DE MAPA 2D E COORDENADAS
// =====================================

function parsePosicao(posStr) {
    const match = posStr.trim().toUpperCase().match(/^([A-Z])(\d+)$/);
    if (!match) return null;
    const x = match[1].charCodeAt(0) - 65;
    const y = parseInt(match[2]) - 1;
    return { x, y };
}

async function renderMap(scene) {
    const CELL_SIZE = scene.colunas > 12 || scene.linhas > 10 ? 64 : 72;
    const COORD = 40;
    const PAD = 28;
    const HEADER_H = 104;
    const FOOTER_H = 26;
    const SIDE_W = 280;
    const GAP = 24;

    const mapWidth = scene.colunas * CELL_SIZE;
    const mapHeight = scene.linhas * CELL_SIZE;
    const mapX = PAD + COORD;
    const mapY = HEADER_H + COORD;
    const sideX = mapX + mapWidth + GAP;
    const width = Math.max(sideX + SIDE_W + PAD, 760);
    const height = Math.max(mapY + mapHeight + FOOTER_H + PAD, 560);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    try {
        const moldura = await loadImage('./assets/ui/moldura-cena.png');
        const slice = 50; 
        
        ctx.drawImage(moldura, 0, 0, slice, slice, 0, 0, slice, slice);
        ctx.drawImage(moldura, moldura.width - slice, 0, slice, slice, width - slice, 0, slice, slice);
        ctx.drawImage(moldura, 0, moldura.height - slice, slice, slice, 0, height - slice, slice, slice);
        ctx.drawImage(moldura, moldura.width - slice, moldura.height - slice, slice, slice, width - slice, height - slice, slice, slice);
        
        ctx.drawImage(moldura, slice, 0, moldura.width - slice*2, slice, slice, 0, width - slice*2, slice);
        ctx.drawImage(moldura, slice, moldura.height - slice, moldura.width - slice*2, slice, slice, height - slice, width - slice*2, slice);
        ctx.drawImage(moldura, 0, slice, slice, moldura.height - slice*2, 0, slice, slice, height - slice*2);
        ctx.drawImage(moldura, moldura.width - slice, slice, slice, moldura.height - slice*2, width - slice, slice, slice, height - slice*2);

        ctx.drawImage(moldura, slice, slice, moldura.width - slice*2, moldura.height - slice*2, slice, slice, width - slice*2, height - slice*2);
    } catch(e) {
        ctx.fillStyle = '#101219';
        ctx.fillRect(0, 0, width, height);

        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        bgGrad.addColorStop(0, '#171922');
        bgGrad.addColorStop(0.55, '#0F1118');
        bgGrad.addColorStop(1, '#1B1712');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, width - 28, height - 28);

    const sceneName = formatarTexto(scene.nome || 'Cena Tatica');
    const active = scene.estado === 'COMBATE' ? scene.players[scene.turnoAtual] : null;
    const livingCount = scene.players.filter(p => !p.incapacitado).length;
    const totalCount = scene.players.length;

    const playersStartX = Math.max(PAD + 400, width - 420);
    const playersStartY = 32;
    const centerX = PAD + ((playersStartX - PAD) / 2);

    const descHeight = scene.descricao ? 28 : 0;
    drawHudBox(ctx, PAD - 14, 16, width - (PAD * 2) + 28, 70 + descHeight, 8);

    ctx.fillStyle = HUD_GOLD;
    ctx.font = 'bold 32px serif';
    ctx.textAlign = 'left';
    ctx.fillText(sceneName, PAD, 48);

    ctx.fillStyle = HUD_MUTED;
    ctx.font = '16px sans-serif';
    const subtitle = scene.estado === 'COMBATE'
        ? `Rodada ${scene.rodada} | Turno de ${active?.name || 'Ninguem'}`
        : `${scene.estado || 'ABERTA'} | ${totalCount} jogadores na cena`;
    ctx.fillText(subtitle, PAD, 74);

    if (scene.descricao) {
        ctx.fillStyle = '#D7D0BE';
        ctx.font = '14px sans-serif';
        ctx.fillText(String(scene.descricao).substring(0, 120), PAD, 96);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let currentX = playersStartX;
    let currentY = playersStartY;

    scene.players.forEach((p, i) => {
        const isActive = scene.estado === 'COMBATE' && scene.turnoAtual === i;
        ctx.font = isActive ? 'bold 13px sans-serif' : '13px sans-serif';
        const label = `${i + 1}. ${p.name}`;
        const textW = ctx.measureText(label).width;
        const boxW = textW + 16;

        if (currentX + boxW > width - PAD) {
            currentX = playersStartX;
            currentY += 26;
        }

        if (isActive) {
            ctx.fillStyle = 'rgba(212, 175, 55, 0.2)';
            ctx.fillRect(currentX, currentY - 12, boxW, 24);
            ctx.fillStyle = HUD_GOLD;
        } else {
            ctx.fillStyle = p.incapacitado ? '#7F8C8D' : p.isNpc ? '#C44A4A' : '#6EA7D6';
        }

        ctx.fillText(label, currentX + 8, currentY);
        currentX += boxW + 4;
    });
    ctx.textBaseline = 'alphabetic';

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
    ctx.beginPath();
    ctx.moveTo(PAD, HEADER_H - 4);
    ctx.lineTo(width - PAD, HEADER_H - 4);
    ctx.stroke();

    drawHudBox(ctx, mapX - 10, mapY - 10, mapWidth + 20, mapHeight + 20, 8);

    if (scene.fundoUrl) {
        try {
            const bg = await loadImage(scene.fundoUrl);
            ctx.drawImage(bg, mapX, mapY, mapWidth, mapHeight);
        } catch (e) {
            ctx.fillStyle = '#20242D';
            ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
        }
    } else {
        const gridGrad = ctx.createLinearGradient(mapX, mapY, mapX + mapWidth, mapY + mapHeight);
        gridGrad.addColorStop(0, '#252A31');
        gridGrad.addColorStop(1, '#181B22');
        ctx.fillStyle = gridGrad;
        ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(mapX, mapY, mapWidth, mapHeight);

    ctx.fillStyle = HUD_TEXT;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = 0; x < scene.colunas; x++) {
        ctx.fillText(String.fromCharCode(65 + x), mapX + (x * CELL_SIZE) + (CELL_SIZE / 2), mapY - 22);
    }
    for (let y = 0; y < scene.linhas; y++) {
        ctx.fillText((y + 1).toString(), mapX - 22, mapY + (y * CELL_SIZE) + (CELL_SIZE / 2));
    }

    ctx.strokeStyle = 'rgba(244, 231, 200, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= scene.colunas; x++) {
        const px = mapX + (x * CELL_SIZE);
        ctx.beginPath();
        ctx.moveTo(px, mapY);
        ctx.lineTo(px, mapY + mapHeight);
        ctx.stroke();
    }
    for (let y = 0; y <= scene.linhas; y++) {
        const py = mapY + (y * CELL_SIZE);
        ctx.beginPath();
        ctx.moveTo(mapX, py);
        ctx.lineTo(mapX + mapWidth, py);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

    for (let i = 0; i < scene.players.length; i++) {
        const p = scene.players[i];
        const cx = mapX + (p.x * CELL_SIZE) + (CELL_SIZE / 2);
        const cy = mapY + (p.y * CELL_SIZE) + (CELL_SIZE / 2);
        const radius = Math.max(18, (CELL_SIZE / 2) - 10);
        const isActive = scene.estado === 'COMBATE' && scene.turnoAtual === i;

        if (isActive && !p.incapacitado) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(212, 175, 55, 0.20)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.75)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        let avatarLoaded = false;
        try {
            if (p.avatarUrl) {
                const avatar = await loadImage(p.avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
                ctx.restore();
                avatarLoaded = true;
            }
        } catch (e) {
            console.error('Erro ao desenhar token (fallback ativado)');
        }

        if (!avatarLoaded) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = p.isNpc ? '#6E1E28' : '#234B6D';
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${Math.floor(radius * 0.78)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.name ? p.name.charAt(0).toUpperCase() : '?', cx, cy);
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = p.incapacitado ? '#7F8C8D' : isActive ? HUD_GOLD : p.isNpc ? '#B33A3A' : '#4C8DC4';
        ctx.lineWidth = isActive ? 5 : 3;
        ctx.stroke();

        if (p.incapacitado) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx - radius + 7, cy - radius + 7);
            ctx.lineTo(cx + radius - 7, cy + radius - 7);
            ctx.moveTo(cx + radius - 7, cy - radius + 7);
            ctx.lineTo(cx - radius + 7, cy + radius - 7);
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(196, 30, 58, 0.88)';
            ctx.stroke();
        }

        const label = p.name.length > 12 ? `${p.name.substring(0, 11)}.` : p.name;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 5;
        ctx.fillText(label, cx, Math.min(cy + radius + 16, mapY + mapHeight - 4));
        ctx.shadowBlur = 0;
    }

    drawHudBox(ctx, sideX, mapY - 10, SIDE_W, mapHeight + 20, 8);
    ctx.fillStyle = HUD_GOLD;
    ctx.font = 'bold 18px serif';
    ctx.textAlign = 'left';
    ctx.fillText('Histórico', sideX + 18, mapY + 26);

    ctx.fillStyle = HUD_MUTED;
    ctx.font = '13px sans-serif';
    ctx.fillText(`${livingCount}/${totalCount} jogadores na cena`, sideX + 18, mapY + 48);

    if (scene.tempoTurnoMs && scene.estado === 'COMBATE') {
        const remainingSecs = scene.fimTurnoTimestamp
            ? Math.max(0, Math.ceil((scene.fimTurnoTimestamp - Date.now()) / 1000))
            : Math.ceil(scene.tempoTurnoMs / 1000);
        ctx.fillStyle = remainingSecs <= 10 ? '#E76F51' : HUD_TEXT;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`${remainingSecs}s`, sideX + SIDE_W - 62, mapY + 38);
    }

    const logs = scene.logs || [];
    let currentLogY = mapY + mapHeight - 16;
    const logLineHeight = 16;
    const maxLogWidth = SIDE_W - 36;
    
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let idx = logs.length - 1; idx >= 0; idx--) {
        const log = String(logs[idx]);
        const words = log.split(' ');
        let lines = [];
        let line = '';

        ctx.font = (idx === logs.length - 1) ? 'bold 12px sans-serif' : '12px sans-serif';

        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxLogWidth && n > 0) {
                lines.push(line);
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line);

        const logBlockHeight = lines.length * logLineHeight + 8;
        if (currentLogY - logBlockHeight < mapY + 76) {
            break; 
        }

        currentLogY -= logBlockHeight;

        if (idx === logs.length - 1) {
            ctx.fillStyle = '#EBE2CD';
        } else {
            ctx.fillStyle = '#A39D8E';
        }

        let py = currentLogY + 4;
        for (const l of lines) {
            ctx.fillText(l, sideX + 18, py);
            py += logLineHeight;
        }

        if (idx < logs.length - 1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(sideX + 18, currentLogY);
            ctx.lineTo(sideX + SIDE_W - 18, currentLogY);
            ctx.stroke();
        }
    }
    ctx.textBaseline = 'alphabetic';

    return canvas.toBuffer('image/png');
}

async function renderDraft(draft) {
    const canvasWidth = 1000;
    const canvasHeight = 600;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fundo escuro
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Titulo
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('â– Arena - Picks & Bans', canvasWidth / 2, 50);

    const cols = 3;
    const mapW = 300;
    const mapH = 200;
    const gapX = 25;
    const gapY = 50;

    const startX = (canvasWidth - ((cols * mapW) + ((cols - 1) * gapX))) / 2;
    let startY = 100;

    for (let i = 0; i < MAPAS_ARENA.length; i++) {
        const mapa = MAPAS_ARENA[i];
        const row = Math.floor(i / cols);
        const col = i % cols;

        let x = startX + col * (mapW + gapX);
        let y = startY + row * (mapH + gapY);

        if (i === 3) x += (mapW + gapX) / 2; // Centraliza a segunda linha
        if (i === 4) x += (mapW + gapX) / 2;

        try {
            const img = await loadImage(mapa.fundoUrl);
            ctx.drawImage(img, x, y, mapW, mapH);
        } catch(e) {
            ctx.fillStyle = '#555';
            ctx.fillRect(x, y, mapW, mapH);
        }

        // Borda do mapa
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, mapW, mapH);

        // Texto do nome
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mapa.nome, x + mapW / 2, y + mapH + 25);

        // Verifica se foi banido
        const isBanido = !draft.mapasRestantes.find(m => m.id === mapa.id);
        if (isBanido) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(x, y, mapW, mapH);

            ctx.strokeStyle = '#E74C3C';
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.moveTo(x + 20, y + 20);
            ctx.lineTo(x + mapW - 20, y + mapH - 20);
            ctx.moveTo(x + mapW - 20, y + 20);
            ctx.lineTo(x + 20, y + mapH - 20);
            ctx.stroke();
        }
    }

    return canvas.toBuffer('image/png');
}

function getCabecalhoCena(cena) {
    return '';
}

function iniciarTimerTurno(channel, cena) {
    if (!cena.tempoTurnoMs || cena.estado !== 'COMBATE' || !cena.msgId) return;
    
    if (timersTurno.has(cena.msgId)) clearInterval(timersTurno.get(cena.msgId));
    
    const interval = setInterval(async () => {
        if (cena.estado !== 'COMBATE') {
            clearInterval(interval);
            return;
        }
        const remaining = cena.fimTurnoTimestamp - Date.now();
        if (remaining <= 0) {
            clearInterval(interval);
            try {
                const oldActive = cena.players[cena.turnoAtual];
                
                do {
                    cena.turnoAtual++;
                    if (cena.turnoAtual >= cena.players.length) {
                        cena.turnoAtual = 0;
                        cena.rodada++;
                    }
                } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
                
                const active = cena.players[cena.turnoAtual];
                const msg = `Tempo esgotado para ${oldActive.name}. Agora: ${active.name}.`;
                if (!cena.logs) cena.logs = [];
                cena.logs.push(msg);
                if (cena.logs.length > 30) cena.logs.shift();
                
                if (active) {
                    cena.turnStartPos = { x: active.x, y: active.y };
                }

                await repintarMapaNovo(channel, cena);
            } catch(e) { console.error('Erro no auto-skip', e); }
            return;
        }
        
        try {
            await atualizarMapaDebounced(channel, cena);
        } catch(e) {}
    }, 5000);
    
    timersTurno.set(cena.msgId, interval);
}

async function renderBanner(scene) {
    const width = 1000;
    const height = 120;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    try {
        const banner = await loadImage('./assets/ui/banner-cena.png');
        ctx.drawImage(banner, 0, 0, width, height);
    } catch(e) {
        ctx.fillStyle = '#1A1C23';
        ctx.fillRect(0, 0, width, height);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const sceneName = formatarTexto(scene.nome || 'Cena Tatica');
    const active = scene.estado === 'COMBATE' ? scene.players[scene.turnoAtual] : null;

    if (scene.estado === 'COMBATE') {
        ctx.fillStyle = HUD_GOLD;
        ctx.font = 'bold 30px serif';
        ctx.fillText(`${sceneName} | Combate - Rodada ${scene.rodada}`, width / 2, 60);
        
        const baseText = `Turno de ${active?.name || 'Ninguem'}. Use os controles para mover ou passar o turno.`;
        
        if (scene.tempoTurnoMs && scene.fimTurnoTimestamp) {
            const remainingSecs = Math.max(0, Math.ceil((scene.fimTurnoTimestamp - Date.now()) / 1000));
            const timeText = `   |   Tempo restante: ${remainingSecs}s`;
            
            ctx.font = '14px sans-serif';
            const baseWidth = ctx.measureText(baseText).width;
            ctx.font = 'bold 14px sans-serif';
            const timeWidth = ctx.measureText(timeText).width;
            
            const startX = (width / 2) - ((baseWidth + timeWidth) / 2);
            
            ctx.textAlign = 'left';
            ctx.fillStyle = HUD_TEXT;
            ctx.font = '14px sans-serif';
            ctx.fillText(baseText, startX, 108);
            
            ctx.fillStyle = remainingSecs <= 10 ? '#E76F51' : HUD_GOLD;
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(timeText, startX + baseWidth, 108);
            
            ctx.textAlign = 'center'; // Reseta pro padrao caso precise no futuro
        } else {
            ctx.fillStyle = HUD_TEXT;
            ctx.font = '14px sans-serif';
            ctx.fillText(baseText, width / 2, 108);
        }
    } else {
        ctx.fillStyle = HUD_GOLD;
        ctx.font = 'bold 30px serif';
        ctx.fillText(`${sceneName} | Cena ${scene.estado || 'ABERTA'}`, width / 2, 60);
        
        ctx.fillStyle = HUD_TEXT;
        ctx.font = '14px sans-serif';
        ctx.fillText(`Cena em modo livre. Mova-se pelo mapa ou entre/saia da cena.`, width / 2, 108);
    }
    
    return canvas.toBuffer('image/png');
}

function getCenaBotoes(cena) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cena_toggle_entrar').setLabel('◇ Entrar / Sair').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_toggle_aberta').setLabel(cena.estado === 'FECHADA' ? '◇ Abrir Cena' : '◇ Fechar Cena').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_toggle_combate').setLabel(cena.estado === 'COMBATE' ? '◇ Encerrar Combate' : '◇ Iniciar Combate').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cena_move_up').setLabel('▲').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_down').setLabel('▼').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_left').setLabel('◀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_right').setLabel('▶').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_modal_mover_coord').setLabel('◇ Coordenada').setStyle(ButtonStyle.Secondary)
    );

    const rows = [row1, row2];

    if (cena.estado === 'COMBATE') {
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cena_passar_turno').setLabel('◆ Passar Turno').setStyle(ButtonStyle.Secondary)
        );
        rows.push(row3);
    }

    return rows;
}

async function atualizarMapaDebounced(channel, cena) {
    if (!cena.msgId) return;

    if (renderTimers.has(cena.msgId)) clearTimeout(renderTimers.get(cena.msgId));

    const timer = setTimeout(async () => {
        renderTimers.delete(cena.msgId);
        try {
            // Atualiza o banner separado
            if (cena.bannerMsgId) {
                try {
                    const bannerMsg = await channel.messages.fetch(cena.bannerMsgId);
                    const bannerBuffer = await renderBanner(cena);
                    const attachmentBanner = new AttachmentBuilder(bannerBuffer, { name: 'banner.png' });
                    await bannerMsg.edit({ files: [attachmentBanner] });
                } catch(e) {}
            }
            // Atualiza o mapa
            const msg = await channel.messages.fetch(cena.msgId);
            const buffer = await renderMap(cena);
            const attachment = new AttachmentBuilder(buffer, { name: 'mapa.png' });
            await msg.edit({ content: '', files: [attachment], components: getCenaBotoes(cena) });
        } catch (e) {
            console.error('Erro debounce', e);
        }
    }, 600);

    renderTimers.set(cena.msgId, timer);
}

// Cria uma Nova Mensagem do Mapa no Chat (Utilizado no Next Turn)
async function repintarMapaNovo(channel, cena) {
    if (cena.msgId) {
        if (cena.msgRodada === cena.rodada) {
            return atualizarMapaDebounced(channel, cena);
        }

        try {
            const velha = await channel.messages.fetch(cena.msgId);
            await velha.edit({ components: [] });
        } catch(e) {}
        
        if (timersTurno.has(cena.msgId)) {
            clearInterval(timersTurno.get(cena.msgId));
            timersTurno.delete(cena.msgId);
        }
        if (renderTimers.has(cena.msgId)) {
            clearTimeout(renderTimers.get(cena.msgId));
            renderTimers.delete(cena.msgId);
        }
    }
    
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs && (!cena.fimTurnoTimestamp || cena.msgRodada !== cena.rodada)) {
        cena.fimTurnoTimestamp = Date.now() + cena.tempoTurnoMs;
    }
    
    // Envia o banner como mensagem separada PRIMEIRO
    const bannerBuffer = await renderBanner(cena);
    const attachmentBanner = new AttachmentBuilder(bannerBuffer, { name: 'banner.png' });
    const bannerMsg = await channel.send({ files: [attachmentBanner] });
    cena.bannerMsgId = bannerMsg.id;
    
    // Envia o mapa com botões DEPOIS
    const buffer = await renderMap(cena);
    const attachmentMap = new AttachmentBuilder(buffer, { name: 'mapa.png' });
    const msg = await channel.send({ content: '', files: [attachmentMap], components: getCenaBotoes(cena) });
    
    cena.msgId = msg.id;
    cena.msgRodada = cena.rodada;
    
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs) {
        iniciarTimerTurno(channel, cena);
    }
}

async function gerarBannerPainelMestreModern(channelId, guild) {
    const w = 1000;
    const h = 560;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    await drawHudBase(ctx, w, h, { focusY: 0.4 });

    drawHudHeader(ctx, 'Painel do Mestre', 'Controle do canal atual', 82, 108, 836);

    const channel = guild.channels.cache.get(channelId);
    const parentName = channel?.parent ? formatarTexto(channel.parent.name) : 'Arkandia Central';
    const channelName = channel?.name || 'geral';
    const cena = cenasAtivas.get(channelId);

    let narrando = null;
    for (const [key, value] of mestresNarrando.entries()) {
        if (key.startsWith(channelId + '-')) {
            narrando = value;
            break;
        }
    }

    let missao = null;
    for (const [, data] of missoesPreparacao.entries()) {
        if (data.channelId === channelId) {
            missao = data;
            break;
        }
    }

    const cards = [
        {
            title: 'Cena',
            x: 82,
            y: 196,
            lines: cena
                ? [
                    `Estado: ${cena.estado}`,
                    `Grid: ${cena.colunas}x${cena.linhas} celulas`,
                    cena.estado === 'COMBATE'
                        ? `Turno: ${cena.players[cena.turnoAtual]?.name || 'Ninguem'}`
                        : `Tokens: ${cena.players.length}`
                ]
                : [
                    'Nenhuma cena ativa neste canal.',
                    'Abra um mapa para acompanhar estado.',
                    'O turno aparece aqui quando houver combate.'
                ]
        },
        {
            title: 'Voz',
            x: 526,
            y: 196,
            lines: narrando
                ? [
                    narrando.nome,
                    'Webhook ativo para este mestre.',
                    'As mensagens saem com esta identidade.'
                ]
                : [
                    'Nenhuma identidade ativa.',
                    'As mensagens saem com o perfil normal.',
                    'Use o menu abaixo para assumir um NPC.'
                ]
        },
        {
            title: 'Missao',
            x: 82,
            y: 352,
            lines: missao
                ? [
                    missao.nome,
                    `Convocados: ${missao.jogadores.length}`,
                    `Prontos: ${missao.jogadores.filter(j => j.pronto).length} / ${missao.jogadores.length}`
                ]
                : [
                    'Nenhuma preparacao ativa neste canal.',
                    'O status de convocacao aparece aqui.',
                    'Use o fluxo de missao quando precisar.'
                ]
        },
        {
            title: 'Canal',
            x: 526,
            y: 352,
            lines: [
                parentName,
                `Local: #${channelName}`,
                'As ferramentas abaixo atuam neste canal.'
            ]
        }
    ];

    cards.forEach(card => {
        drawHudBox(ctx, card.x, card.y, 392, 128, 14);
        ctx.fillStyle = HUD_GOLD;
        ctx.fillRect(card.x + 22, card.y + 24, 4, 80);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(card.title, card.x + 44, card.y + 42);
        ctx.fillStyle = HUD_MUTED;
        ctx.font = '16px sans-serif';
        card.lines.forEach((line, index) => {
            ctx.fillText(trimToWidth(ctx, line, 310), card.x + 44, card.y + 70 + (index * 22));
        });
    });

    drawHudBox(ctx, 82, 506, 836, 30, 10);
    ctx.fillStyle = HUD_TEXT;
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use os menus abaixo para abrir acoes do mestre sem poluir o canal.', w / 2, 526);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

function getMestrePainelComponentsModern() {
    const rowVtt = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_vtt')
            .setPlaceholder('Cena e combate')
            .addOptions([
                { label: 'Abrir cena', description: 'Indica o comando para iniciar mapa tatico', value: 'iniciar_cena' },
                { label: 'Abrir arena', description: 'Indica o comando para iniciar o draft', value: 'iniciar_arena' },
                { label: 'Iniciar combate', description: 'Trava a ordem de turnos da cena', value: 'combate_iniciar' },
                { label: 'Passar turno', description: 'Avanca para o proximo token vivo', value: 'combate_proximo' },
                { label: 'Alterar vida', description: 'Troca entre vivo e incapacitado', value: 'status_vida' },
                { label: 'Mover token', description: 'Teleporta um token para outra coordenada', value: 'mover_livre' },
                { label: 'Fechar entrada', description: 'Bloqueia novos participantes na cena', value: 'fechar' },
                { label: 'Encerrar cena', description: 'Apaga a cena ativa deste canal', value: 'encerrar' }
            ])
    );

    const rowVoz = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_voz')
            .setPlaceholder('Voz e consultas')
            .addOptions([
                { label: 'Assumir NPC', description: 'Ativa voz por webhook neste canal', value: 'assumir_npc' },
                { label: 'Voltar ao perfil', description: 'Desativa a voz atual e retorna ao normal', value: 'voltar_mestre' },
                { label: 'Consultar bestiario', description: 'Busca dados de NPC ou criatura', value: 'consultar_bestiario' },
                { label: 'Consultar perfil', description: 'Indica o comando de ficha do jogador', value: 'visualizar_perfil' },
                { label: 'Consultar inventario', description: 'Indica o comando de mochila do jogador', value: 'visualizar_inventario' }
            ])
    );

    const rowLoot = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_economia')
            .setPlaceholder('Loot e recompensas')
            .addOptions([
                { label: 'Dropar item', description: 'Pesquisa um item e envia o loot no chat', value: 'dropar_item' },
                { label: 'Creditar libras', description: 'Adiciona libras direto na ficha', value: 'creditar_libras' }
            ])
    );

    return [rowVtt, rowVoz, rowLoot];
}


module.exports = { loadImage, gerarBannerPerfil, gerarBannerLoot, gerarBannerInventario, gerarBannerRanking, gerarBannerGuilda, gerarBannerPainelJogador, gerarBannerEnciclopedia, gerarBannerPainelMestreModern, renderInventarioPage, renderMap, atualizarMapaDebounced, repintarMapaNovo, iniciarTimerTurno, getCenaBotoes, getCabecalhoCena, getMestrePainelComponentsModern };
