# 🧠 Garaad Quiz — Discord Bot

Bot tartan aqoon (Af-Soomaali) oo ku salaysan **IQ**, **XP**, iyo **dhibcaha tartanka quiz**. Cash / suuq ma jiro — kaliya IQ iyo XP.

---

## 🎮 Amarrada ugu muhiimsan

| Amarka | Sharaxaad |
|--------|-----------|
| `?solo` | Ciyaar kaligiis — sax **+3 IQ**, qalad/waqtiga **−1 IQ** |
| `?duel @user` | Labadu dhigaan **5 IQ**; guuleystaha **+10 IQ**; barbaro: dib u celinta dhigga |
| `?td` | Ka dooro **Su’aal**, **Xujo** ama **Random**; su’aasha/hawshu waxay ku muuqataa qoraal cad oo bold ah |
| `?sec @user` | U dir casuumaad private DM chat ah; fariimaha bot-ku ayuu labada qof u kala gudbiyaa, lama qoro public channel |
| `?sec end` | Jooji private DM chat-ka (ku qor bot-ka DM) |
| `?take` | Qabo hadiyadda si random ah ugu dhacda chat channel firfircoon (text ama VC chat); qofka ugu horreeya ayaa hela 100–300 Coins, 10–30 XP, iyo 1–3 IQ |
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
│   ├── games/         ← truth-or-dare.json
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

Kaydka cusub waxa ku jira **550 su'aalood oo xisaab ah oo Solo ah** iyo **400 su'aalood oo taxane-tiro ah oo Duel ah**. Ciyaarta `?td` waxay leedahay su'aalo iyo hawlo Af-Soomaali ah; Dare kuma jiraan xujooyin xisaabeed.

`?sec @user` wuxuu tirtiraa amarka public-ka isla markiiba wuxuuna casuumaad ugu diraa qofka la xushay. Bot-ku wuxuu u baahan yahay **Manage Messages** channel-kaas iyo in labada qof ay aqbalaan DMs-ka bot-ka. Fariimaha waxaa lagu kala diraa DM-yada bot-ka; dadka kale ee server-ka kama arki karaan, laakiin tani ma aha end-to-end encryption, bot-kuna wuxuu farsameeyaa fariimaha si uu u gudbiyo. Bot restart-ku wuxuu soo afjaraa chats-ka firfircoon.

Hadiyadaha `?take` waxay ku dhacaan random ahaan 15–45 daqiiqo kasta, server kasta oo chat channel-kiisu dhowaan firfircoonaa. Waxay ka muuqan karaan text channel ama chat-ka voice channel-ka. Qofka ugu horreeya ee `?take` ku qora isla channel-kaas ayaa helaya 100–300 Coins, 10–30 XP iyo 1–3 IQ. Haddii aan daqiiqad gudaheed la qaadan, hadiyaddu way dhacaysaa.

---

*Garaad Quiz — nidaam fudud: solo, duel, quiz + exchange, dukaanka XP.*
