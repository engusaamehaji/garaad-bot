// =====================================================================
// Werewolf Role Card Generator — @napi-rs/canvas
// =====================================================================

const { createCanvas } = require('@napi-rs/canvas');

const ROLE_STYLES = {
    wolf:     { bg: '#1a0000', border: '#c0392b', accent: '#e74c3c', emoji: '🐺', label: 'WEREWOLF' },
    seer:     { bg: '#0d0020', border: '#8e44ad', accent: '#9b59b6', emoji: '🔮', label: 'SEER'     },
    doctor:   { bg: '#001a0d', border: '#1e8449', accent: '#27ae60', emoji: '💊', label: 'DOCTOR'   },
    villager: { bg: '#001020', border: '#1a5276', accent: '#2980b9', emoji: '🏘️', label: 'SOCIETY' },
};

const ROLE_DESC = {
    wolf:     ['● Habeenkii: Qof dooro oo dil', '● Maalintii: Is qarso', '● Kooxda: WOLVES'],
    seer:     ['● Habeenkii: Qof baro', '● Wolf hadduu yahay ogaanaysaa', '● Maalintii: Codeey'],
    doctor:   ['● Habeenkii: Qof badbaadi', '● Nafsadaada badbaadin kartaa', '● Maalintii: Codeey'],
    villager: ['● Awood: Codayn kaliya', '● Sawiraha raadso', '● Werewolf saaro!'],
};

function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function generateRoleCard(role) {
    const W = 420, H = 560;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const s = ROLE_STYLES[role];

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, s.bg);
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    drawRoundRect(ctx, 0, 0, W, H, 24);
    ctx.fill();

    // Outer border glow
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 4;
    drawRoundRect(ctx, 4, 4, W - 8, H - 8, 22);
    ctx.stroke();

    // Inner border
    ctx.strokeStyle = s.accent + '55';
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, 14, 14, W - 28, H - 28, 16);
    ctx.stroke();

    // Top accent bar
    ctx.fillStyle = s.accent;
    drawRoundRect(ctx, 14, 14, W - 28, 6, 3);
    ctx.fill();

    // Bottom accent bar
    ctx.fillStyle = s.accent;
    drawRoundRect(ctx, 14, H - 20, W - 28, 6, 3);
    ctx.fill();

    // Card title background
    ctx.fillStyle = s.accent + '22';
    drawRoundRect(ctx, 30, 35, W - 60, 70, 10);
    ctx.fill();

    // Role label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, W / 2, 82);

    // Emoji circle background
    ctx.fillStyle = s.accent + '33';
    ctx.beginPath();
    ctx.arc(W / 2, 210, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, 210, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Emoji
    ctx.font = '90px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.emoji, W / 2, 248);

    // Divider
    ctx.strokeStyle = s.accent + '88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 315);
    ctx.lineTo(W - 50, 315);
    ctx.stroke();

    // Description lines
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    const lines = ROLE_DESC[role] || [];
    lines.forEach((line, i) => {
        ctx.fillStyle = s.accent;
        ctx.fillText('▸', 50, 355 + i * 40);
        ctx.fillStyle = '#dddddd';
        ctx.fillText(line.replace('● ', ''), 75, 355 + i * 40);
    });

    // Bottom secret notice
    ctx.fillStyle = s.accent + 'bb';
    drawRoundRect(ctx, 30, H - 65, W - 60, 36, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔒  SIR AH — HA U SHEEGIN!', W / 2, H - 41);

    return canvas.toBuffer('image/png');
}

module.exports = { generateRoleCard };
