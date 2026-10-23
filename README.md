# 🧠 Garaad Quiz — Discord Bot

Bot tartan aqoon (Af-Soomaali) oo ku salaysan **IQ**, **XP**, iyo **dhibcaha tartanka quiz**. Cash / suuq ma jiro — kaliya IQ iyo XP.

---

## 🎮 Amarrada ugu muhiimsan

| Amarka | Sharaxaad |
|--------|-----------|
| `?solo` | Ciyaar kaligiis — sax **+3 IQ**, qalad/waqtiga **−1 IQ** |
| `?duel @user` | Labadu dhigaan **5 IQ**; guuleystaha **+10 IQ**; barbaro: dib u celinta dhigga |
| `?quiz` | Tartanka kooxda; dhibcaha laga helay waxaa lagu darayaa kayd — `?exchange` |
| `?exchange xp` / `?exchange iq` | Badal dhibcaha tartanka (1 dhibic = 5 XP ama 1 IQ — `src/config.js`) |
| `?shop` / `?buy` | Darajooyin lagu iibsanayo **XP** oo keliya |
| `?profile` | IQ, XP, level, dhibcaha tartanka ee sugaya |
| `?statistics` | Tirakoob |
| `?top` | 15-ka ugu IQ-da sarreeya |
| `?today` | **+5 IQ** iyo **+100 XP** (24 saac mar) |
| `?titles` / `?settitle` | Darajooyinka |
| `?caawin` | Liiska amarrada |
| `?cilada [fariin]` | Soo sheeg cilad |

Tartan weyn (admin): `?isdiiwaangeli`, `?tartan`, `?gal`, iwm. — faylasha `src/games/tournament.js`.

---

## 📁 Qaabka mashruuca

```
garaad-bot/
├── index.js
├── data/
│   ├── questions/     ← solo.json, duel.json, quiz.json, iwm.
│   └── users.json
└── src/
    ├── config.js
    ├── store.js
    ├── commands/
    ├── games/
    ├── handlers/
    └── utils/
```

---

## ➕ Su'aalaha: door iyo Run / Been

**Door (MCQ):**

```json
{
  "question": "Su'aal?",
  "options": ["A", "B", "C", "D"],
  "correct": "A"
}
```

**Run / Been:**

```json
{
  "question": "Cirka buluug yahay?",
  "type": "tf",
  "correct": true
}
```

`correct: true` macnaheedu waa bayaankan waa **run**; `false` waa **been**.

---

## ⚙️ Rakibidda

1. Node.js 18+
2. `npm install`
3. `.env` — `TOKEN=<bot token>`
4. Discord Portal: **Message Content Intent** fur
5. `npm start`

Habaynta (prefix, dhibcaha tartanka, duel IQ, iwm.) waxay ku jiraan `src/config.js`.

---

*Garaad Quiz — nidaam fudud: solo, duel, quiz + exchange, dukaanka XP.*
