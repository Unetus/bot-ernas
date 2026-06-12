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

async function gerarBannerPerfil(p) {
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
    ctx.fillText(`${raca} • ${classe}`, 340, 170);

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
            ctx.fillText('★', bx + 22, by + 17);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(b.label, bx + 22, by + 34);
            ctx.textAlign = 'left';
        });
    }

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
    ctx.fillText(`${formatarTexto(item.categoria || '')}${item.grau ? ' • Grau ' + item.grau : ''}`, 200, 162);

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

async function gerarBannerInventario(p, sliceItens, categoria, pag, totalPaginas) {
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

async function gerarBannerRanking(tipo, dados) {
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
            subText = ` (${formatarTexto(item.raca)} • ${formatarTexto(item.classe)})`;
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
            valorText = `${(item.xp_total_guilda || 0).toLocaleString('pt-BR')} XP • ${(item.banco_libras || item.libras || 0).toLocaleString('pt-BR')} L`;
        } else if (tipo === 'arena') {
            valorText = `${item.rating || item.pontos_arena || item.arena_pontos || 0} pts`;
        }

        ctx.fillText(valorText, 730, y + rowHeight / 2 + 5);
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
        ctx.fillText('Nenhum bônus ativo no momento.', 50, 370);
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
                nome: p.nome || formatarTexto(perkKey.replace(/_/g, ' ')) || 'Bônus Ativo',
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

async function renderInventarioPage(interaction, p, itens, categoria, pagina) {
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
        .setColor(p.indice_poder_cor || 0x3498DB)
        .setImage('attachment://inventario.png');

    // Botões de Categorias
    const rowCats = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inventario_cat_${p.id}_todos`).setLabel('Tudo').setStyle(categoria === 'todos' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventario_cat_${p.id}_armas`).setLabel('Armas').setStyle(categoria === 'armas' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventario_cat_${p.id}_armaduras`).setLabel('Defesas').setStyle(categoria === 'armaduras' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventario_cat_${p.id}_consumiveis`).setLabel('Consumíveis').setStyle(categoria === 'consumiveis' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventario_cat_${p.id}_materiais`).setLabel('Materiais').setStyle(categoria === 'materiais' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    // Botões de Paginação
    const rowPag = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`inventario_pag_${p.id}_${categoria}_${pag - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Primary).setDisabled(pag === 0),
        new ButtonBuilder().setCustomId(`inventario_pag_${p.id}_${categoria}_${pag + 1}`).setLabel('Próximo').setStyle(ButtonStyle.Primary).setDisabled(pag >= totalPaginas - 1)
    );

    const components = [rowCats];
    if (totalPaginas > 1) {
        components.push(rowPag);
    }

    if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ embeds: [embed], files: [attachment], components });
    } else {
        return await interaction.update({ embeds: [embed], files: [attachment], components });
    }
}

async function gerarBannerPainelJogador(user = {}) {
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

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(82, 194);
    ctx.lineTo(918, 194);
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
    const startY = 232;
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


// =====================================
// IA NARRATIVA E HUD DO MESTRE (ETAPAS 5.4 E 3.4)
// =====================================

async function gerarNarrativaIA(prompt, instruction = '') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Chave GEMINI_API_KEY não configurada no arquivo .env.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800
        }
    };
    if (instruction) {
        payload.systemInstruction = { parts: [{ text: instruction }] };
    }
    const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
    });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function gerarBannerPainelMestre(channelId, guild) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');

    // Fundo base medieval escuro
    ctx.fillStyle = '#13141C';
    ctx.fillRect(0, 0, 800, 450);
    
    const grd = ctx.createLinearGradient(0, 0, 0, 450);
    grd.addColorStop(0, '#1E202B');
    grd.addColorStop(1, '#0F1015');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 800, 450);

    // Borda dourada
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 780, 430);

    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 15, 770, 420);

    // Título Principal (Sem acentos ou caracteres especiais)
    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('PAINEL DO MESTRE - CENTRAL DE CONTROLE', 40, 52);

    // Divisor horizontal
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 70);
    ctx.lineTo(760, 70);
    ctx.stroke();

    // 1. Bloco Esquerdo: Status da Cena VTT
    const cena = cenasAtivas.get(channelId);
    ctx.fillStyle = '#1A1C23';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(40, 95, 340, 150, 10);
    else ctx.fillRect(40, 95, 340, 150);
    ctx.fill();
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('STATUS DA CENA (VTT)', 60, 125);

    if (cena) {
        ctx.fillStyle = cena.estado === 'COMBATE' ? '#EF4444' : '#3498DB';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`Estado: ${cena.estado}`, 60, 155);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.fillText(`- Grid: ${cena.colunas}x${cena.linhas} celulas`, 60, 180);
        ctx.fillText(`- Jogadores/Tokens: ${cena.players.length}`, 60, 205);
        if (cena.estado === 'COMBATE') {
            const ativo = cena.players[cena.turnoAtual];
            ctx.fillText(`- Turno: ${ativo ? ativo.name : 'Ninguem'} (Rodada ${cena.rodada})`, 60, 230);
        } else {
            ctx.fillText('- Movimentacao Livre Habilitada', 60, 230);
        }
    } else {
        ctx.fillStyle = '#4F5660';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Nenhuma Cena Ativa', 60, 160);
        ctx.fillStyle = '#8B949E';
        ctx.font = 'italic 12px sans-serif';
        ctx.fillText('Inicie um mapa tatico VTT no canal', 60, 185);
        ctx.fillText('para ver as estatisticas da sessao.', 60, 205);
    }

    // 2. Bloco Direito: Voz e Narração Habilitada
    let narrando = null;
    for (const [key, value] of mestresNarrando.entries()) {
        if (key.startsWith(channelId + '-')) {
            narrando = value;
            break;
        }
    }

    ctx.fillStyle = '#1A1C23';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(420, 95, 340, 150, 10);
    else ctx.fillRect(420, 95, 340, 150);
    ctx.fill();
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('IMPERSONACAO / VOZ ATIVA', 440, 125);

    if (narrando) {
        ctx.fillStyle = '#D4AF37';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(narrando.nome, 440, 155);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.fillText('- Canal de Webhook ativo', 440, 185);
        ctx.fillText('- Todas as suas falas comuns', 440, 210);
        ctx.fillText('sairao com esta identidade.', 440, 230);
    } else {
        ctx.fillStyle = '#4F5660';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Modo Narrador Desativado', 440, 160);
        ctx.fillStyle = '#8B949E';
        ctx.font = 'italic 12px sans-serif';
        ctx.fillText('Suas mensagens saem com seu proprio', 440, 185);
        ctx.fillText('perfil de usuario comum.', 440, 205);
    }

    // 3. Bloco Inferior Esquerdo: Missão Ativa
    let missao = null;
    for (const [key, m] of missoesPreparacao.entries()) {
        if (m.channelId === channelId) {
            missao = m;
            break;
        }
    }

    ctx.fillStyle = '#1A1C23';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(40, 265, 340, 135, 10);
    else ctx.fillRect(40, 265, 340, 135);
    ctx.fill();
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('PREPARACAO DE MISSAO', 60, 295);

    if (missao) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(missao.nome.substring(0, 30), 60, 325);
        
        ctx.font = '13px sans-serif';
        const prontos = missao.jogadores.filter(j => j.pronto).length;
        ctx.fillText(`- Herois Convocados: ${missao.jogadores.length}`, 60, 350);
        ctx.fillText(`- Prontos para Aventura: ${prontos} / ${missao.jogadores.length}`, 60, 375);
    } else {
        ctx.fillStyle = '#4F5660';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('Nenhuma Missao em Preparacao', 60, 335);
    }

    // 4. Bloco Inferior Direito: Atividade do Sistema
    ctx.fillStyle = '#1A1C23';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(420, 265, 340, 135, 10);
    else ctx.fillRect(420, 265, 340, 135);
    ctx.fill();
    ctx.strokeStyle = '#2D313E';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#8B949E';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('INFORMACOES DE LORE E REGIONAL', 440, 295);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    const channel = guild.channels.cache.get(channelId);
    const parentName = channel && channel.parent ? channel.parent.name : 'Arkandia Central';
    const channelName = channel ? channel.name : 'Geral';
    ctx.fillText(`Regiao: ${formatarTexto(parentName)}`, 440, 325);
    ctx.font = '13px sans-serif';
    ctx.fillText(`- Localidade: #${channelName}`, 440, 350);
    
    const hasGemini = !!process.env.GEMINI_API_KEY;
    ctx.fillStyle = hasGemini ? '#2E5A36' : '#C41E3A';
    ctx.fillText(hasGemini ? '- Assistente IA: ONLINE' : '- Assistente IA: CONFIGURAR CHAVE', 440, 375);

    return canvas.toBuffer('image/png');
}

function getMestrePainelComponents() {
    const rowVtt = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_vtt')
            .setPlaceholder('Controle VTT (Grid e Combate)')
            .addOptions([
                { label: 'Iniciar Cena VTT', description: 'Cria um novo mapa tatico no canal', value: 'iniciar_cena' },
                { label: 'Iniciar Arena PvP', description: 'Inicia draft de picks/bans para combate PvP', value: 'iniciar_arena' },
                { label: 'Iniciar Combate', description: 'Tranca iniciativa e turnos no VTT', value: 'combate_iniciar' },
                { label: 'Avançar Turno', description: 'Passa para o próximo token vivo', value: 'combate_proximo' },
                { label: 'Mudar Status de Vida', description: 'Alterna token entre Vivo e Incapacitado', value: 'status_vida' },
                { label: 'Teleportar Token', description: 'Força o movimento de um token no grid', value: 'mover_livre' },
                { label: 'Fechar Entrada', description: 'Bloqueia novos jogadores no mapa', value: 'fechar' },
                { label: 'Encerrar Cena', description: 'Deleta o mapa e remove VTT da memória', value: 'encerrar' }
            ])
    );

    const rowVoz = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_voz')
            .setPlaceholder('Voz, Narracao e Consultas')
            .addOptions([
                { label: 'Assumir NPC ou Monstro', description: 'Fala através de Webhook personalizado', value: 'assumir_npc' },
                { label: 'Voltar ao Perfil de Mestre', description: 'Desativa o Webhook e fala como usuário normal', value: 'voltar_mestre' },
                { label: 'Consultar Bestiario Secreto', description: 'Pesquisa atributos e lore de forma secreta', value: 'consultar_bestiario' },
                { label: 'Consultar Ficha de Personagem', description: 'Gera e exibe a ficha Canvas de qualquer jogador', value: 'visualizar_perfil' },
                { label: 'Consultar Mochila de Personagem', description: 'Abre a mochila e inventario de qualquer jogador', value: 'visualizar_inventario' }
            ])
    );

    const rowLoot = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_economia')
            .setPlaceholder('Loot, Moedas e Recompensas')
            .addOptions([
                { label: 'Dropar Item do Catalogo', description: 'Pesquisa item na API e envia caixa de loot', value: 'dropar_item' },
                { label: 'Creditar Libras (Moedas)', description: 'Adiciona moedas diretamente à ficha do jogador', value: 'creditar_libras' }
            ])
    );

    const rowIa = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mestre_menu_ia')
            .setPlaceholder('IA Narrativa Assistente (Gemini)')
            .addOptions([
                { label: 'Descrever Ambiente', description: 'IA gera narração mística do canal/local atual', value: 'ia_descrever_ambiente' },
                { label: 'Improvisar Fala de NPC', description: 'IA responde in-character como o NPC ativo', value: 'ia_npc_fala' },
                { label: 'Gerar Encontro Aleatorio', description: 'IA sorteia monstros e gera enredo de emboscada', value: 'ia_encontro' }
            ])
    );

    return [rowVtt, rowVoz, rowLoot, rowIa];
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
    const CELL_SIZE = 100;
    const MARGIN = 40;
    
    const mapWidth = scene.colunas * CELL_SIZE;
    const mapHeight = scene.linhas * CELL_SIZE;
    const width = Math.max(mapWidth + MARGIN, 400); 
    const height = Math.max(mapHeight + MARGIN, 400);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fundo inteiro
    ctx.fillStyle = '#1E1F22'; 
    ctx.fillRect(0, 0, width, height);

    // Fundo do Grid
    if (scene.fundoUrl) {
        try {
            const bg = await loadImage(scene.fundoUrl);
            ctx.drawImage(bg, MARGIN, MARGIN, mapWidth, mapHeight);
        } catch (e) {
            ctx.fillStyle = '#2B2D31';
            ctx.fillRect(MARGIN, MARGIN, mapWidth, mapHeight);
        }
    } else {
        ctx.fillStyle = '#2B2D31';
        ctx.fillRect(MARGIN, MARGIN, mapWidth, mapHeight);
    }

    // Coordenadas Letras e Números
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = 0; x < scene.colunas; x++) {
        const letra = String.fromCharCode(65 + x);
        ctx.fillText(letra, MARGIN + (x * CELL_SIZE) + (CELL_SIZE / 2), MARGIN / 2);
    }
    for (let y = 0; y < scene.linhas; y++) {
        ctx.fillText((y + 1).toString(), MARGIN / 2, MARGIN + (y * CELL_SIZE) + (CELL_SIZE / 2));
    }

    // Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= scene.colunas; x++) {
        const px = MARGIN + (x * CELL_SIZE);
        ctx.beginPath(); ctx.moveTo(px, MARGIN); ctx.lineTo(px, MARGIN + mapHeight); ctx.stroke();
    }
    for (let y = 0; y <= scene.linhas; y++) {
        const py = MARGIN + (y * CELL_SIZE);
        ctx.beginPath(); ctx.moveTo(MARGIN, py); ctx.lineTo(MARGIN + mapWidth, py); ctx.stroke();
    }

    // Tokens
    for (let i = 0; i < scene.players.length; i++) {
        const p = scene.players[i];
        const cx = MARGIN + (p.x * CELL_SIZE) + (CELL_SIZE / 2);
        const cy = MARGIN + (p.y * CELL_SIZE) + (CELL_SIZE / 2);
        const radius = (CELL_SIZE / 2) - 10;

        let avatarLoaded = false;
        try {
            if (p.avatarUrl) {
                const avatar = await loadImage(p.avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.closePath();
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
            ctx.fillStyle = p.isNpc ? '#8B0000' : '#2B4C7E';
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const inicial = p.name ? p.name.charAt(0).toUpperCase() : '?';
            ctx.fillText(inicial, cx, cy);
            ctx.textBaseline = 'alphabetic'; // Reset para o nome principal
        }

        // Borda do Token
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        
        if (p.incapacitado) {
            ctx.strokeStyle = '#7F8C8D'; 
        } else if (scene.estado === 'COMBATE' && scene.turnoAtual === i) {
            ctx.strokeStyle = '#B8860B'; 
        } else {
            ctx.strokeStyle = p.isNpc ? '#8B0000' : '#2B4C7E'; 
        }
        ctx.lineWidth = 4;
        ctx.stroke();

        // Desenhando X vermelho se incapacitado
        if (p.incapacitado) {
            ctx.beginPath();
            ctx.moveTo(cx - radius + 5, cy - radius + 5);
            ctx.lineTo(cx + radius - 5, cy + radius - 5);
            ctx.moveTo(cx + radius - 5, cy - radius + 5);
            ctx.lineTo(cx - radius + 5, cy + radius - 5);
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(139, 0, 0, 0.8)'; 
            ctx.stroke();
        }

        // Texto com Nome
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.name, cx, cy + radius + 15);
        ctx.shadowBlur = 0;
    }

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
    ctx.fillText('❖ Arena - Picks & Bans', canvasWidth / 2, 50);

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
    if (cena.estado === 'COMBATE') {
        const ativo = cena.players[cena.turnoAtual];
        let cabecalho = `⚔ **COMBATE INICIADO! (Rodada ${cena.rodada})**\nÉ o turno de: **${ativo.name}**. Mova sua peça ou realize sua ação!`;
        if (cena.tempoTurnoMs && cena.fimTurnoTimestamp) {
            const remainingSecs = Math.max(0, Math.ceil((cena.fimTurnoTimestamp - Date.now()) / 1000));
            cabecalho += `\n⧖ Tempo Restante: **${remainingSecs}s** (Total: ${cena.tempoTurnoMs / 1000}s)`;
        }
        return cabecalho;
    }
    return `❖ **MAPA TÁTICO INICIADO!**\nUse \`/cena entrar\` para participar. Modos: livre.`;
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
                await channel.send(`⧖ O tempo de **${cena.players[cena.turnoAtual].name}** se esgotou! Passando o turno automaticamente.`);
                do {
                    cena.turnoAtual++;
                    if (cena.turnoAtual >= cena.players.length) {
                        cena.turnoAtual = 0;
                        cena.rodada++;
                    }
                } while (cena.players[cena.turnoAtual].incapacitado && cena.players.some(p => !p.incapacitado));
                await repintarMapaNovo(channel, cena);
            } catch(e) { console.error('Erro no auto-skip', e); }
            return;
        }
        
        try {
            const msg = await channel.messages.fetch(cena.msgId).catch(() => null);
            if (msg) {
                await msg.edit({ content: getCabecalhoCena(cena) });
            }
        } catch(e) {}
    }, 5000);
    
    timersTurno.set(cena.msgId, interval);
}

function getCenaBotoes(cena) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cena_move_up').setLabel('▲').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_down').setLabel('▼').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_left').setLabel('◀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_move_right').setLabel('▶').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cena_modal_mover_coord').setLabel('⌖ Mover (Coord.)').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cena_passar_turno').setLabel('» Passar Turno').setStyle(ButtonStyle.Danger)
    );
    return [row, row2];
}

async function atualizarMapaDebounced(channel, cena) {
    if (!cena.msgId) return;

    if (renderTimers.has(cena.msgId)) clearTimeout(renderTimers.get(cena.msgId));

    const timer = setTimeout(async () => {
        renderTimers.delete(cena.msgId);
        try {
            const msg = await channel.messages.fetch(cena.msgId);
            const buffer = await renderMap(cena);
            const attachment = new AttachmentBuilder(buffer, { name: 'mapa.png' });
            await msg.edit({ content: getCabecalhoCena(cena), files: [attachment], components: getCenaBotoes(cena) });
        } catch (e) {
            console.error('Erro debounce', e);
        }
    }, 600);

    renderTimers.set(cena.msgId, timer);
}

// Cria uma Nova Mensagem do Mapa no Chat (Utilizado no Next Turn)
async function repintarMapaNovo(channel, cena) {
    if (cena.msgId) {
        if (timersTurno.has(cena.msgId)) {
            clearInterval(timersTurno.get(cena.msgId));
            timersTurno.delete(cena.msgId);
        }
        try {
            const velha = await channel.messages.fetch(cena.msgId);
            await velha.delete();
        } catch(e) {}
    }
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs) {
        cena.fimTurnoTimestamp = Date.now() + cena.tempoTurnoMs;
    }
    const buffer = await renderMap(cena);
    const attachment = new AttachmentBuilder(buffer, { name: 'mapa.png' });
    const msg = await channel.send({ content: getCabecalhoCena(cena), files: [attachment], components: getCenaBotoes(cena) });
    cena.msgId = msg.id;
    if (cena.estado === 'COMBATE' && cena.tempoTurnoMs) {
        iniciarTimerTurno(channel, cena);
    }
}


module.exports = { loadImage, gerarBannerPerfil, gerarBannerLoot, gerarBannerInventario, gerarBannerRanking, gerarBannerGuilda, gerarBannerPainelJogador, gerarBannerPainelMestre, renderInventarioPage, renderMap, atualizarMapaDebounced, repintarMapaNovo, iniciarTimerTurno, getCenaBotoes, getCabecalhoCena, getMestrePainelComponents };
