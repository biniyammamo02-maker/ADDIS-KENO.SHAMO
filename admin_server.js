const express = require('express');
const path = require('path');
const cors = require('cors');
const os = require('os');
const fs = require('fs');
const app = express();
const PORT = 5000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        users: { "0943918532": { phone: "0943918532", password: "1234", balance: 1803.00 } },
        deposits: [],
        withdrawals: [],
        history: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { users: {}, deposits: [], withdrawals: [], history: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let adminForcedNumbers = null; 

function getLocalNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const CURRENT_IP = getLocalNetworkIP();
const playerFilePath = path.join(__dirname, 'Dashbet3.html.html');

app.get('/', (req, res) => { res.sendFile(playerFilePath); });
app.get('/admin-panel', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

app.post('/login', (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ!" });
    phone = phone.trim();
    const db = readDB();
    const user = db.users[phone];
    if (user && user.password === password) {
        return res.json({ success: true, user: { phone: user.phone, balance: user.balance } });
    }
    return res.json({ success: false, message: "⚠️ ስልክ ቁጥር ወይም የይለፍ ቃል የተሳሳተ ነው!" });
});

app.post('/register', (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ሁሉንም ፎርም በትክክል ይሙሉ!" });
    phone = phone.trim();
    const db = readDB();
    if (db.users[phone]) return res.json({ success: false, message: "❌ ይህ ስልክ ቁጥር ቀድሞ የተመዘገበ ነው!" });
    db.users[phone] = { phone: phone, password: password, balance: 0.00 };
    writeDB(db);
    res.json({ success: true, message: "✅ ምዝገባዎ በቋሚነት ተጠናቋል! አሁን መግባት ይችላሉ።" });
});

app.post('/api/place-bet', (req, res) => {
    let { userPhone, betAmount } = req.body;
    const db = readDB();
    const user = db.users[userPhone.trim()];
    if (!user || user.balance < parseFloat(betAmount)) return res.json({ success: false });
    user.balance -= parseFloat(betAmount);
    writeDB(db);
    res.json({ success: true, newBalance: user.balance });
});

// 🎯 አዲስ የመገናኛ በሪ (Endpoint)፦ ያሸነፈው ብር በቋሚነት በዳታቤዙ ውስጥ እንዲደመርና እንዲቀመጥ ያደርጋል
app.post('/api/claim-win', (req, res) => {
    let { userPhone, winAmount } = req.body;
    const db = readDB();
    const user = db.users[userPhone.trim()];
    if (!user) return res.json({ success: false });
    
    user.balance += parseFloat(winAmount); // 🏆 ያሸነፈው ብር እዚህ ጋር ተደመረ!
    writeDB(db);
    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/save-draw', (req, res) => {
    const { roundNumber, results } = req.body;
    const db = readDB();
    if (!db.history) db.history = [];
    db.history.push({ roundNumber, results, timestamp: new Date().toISOString() });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/draw-history', (req, res) => {
    const db = readDB();
    res.json(db.history || []); 
});

app.post('/api/deposit', (req, res) => {
    let { userPhone, amount, senderPhone, method, screenshot } = req.body;
    const db = readDB();
    if (!db.deposits) db.deposits = [];
    const newRequest = { id: 'DEP-' + Date.now(), userPhone: userPhone.trim(), amount: parseFloat(amount), senderPhone, method, screenshot: screenshot || "", status: 'PENDING', date: new Date().toLocaleString('am-ET') };
    db.deposits.push(newRequest);
    writeDB(db);
    res.json({ success: true, message: "✅ የዲፖዚት ጥያቄዎ ለአድሚን ደርሷል!" });
});

app.post('/api/withdraw', (req, res) => {
    let { userPhone, amount, accountNumber, fullName, method } = req.body;
    const db = readDB();
    const cleanPhone = userPhone.trim();
    const user = db.users[cleanPhone];
    if (!user) return res.json({ success: false, message: "❌ ተጠቃሚው አልተገኘም!" });

    const reqAmount = parseFloat(amount);
    if (reqAmount < 80) return res.json({ success: false, message: "❌ ማውጣት የሚቻለው አነስተኛ መጠን 80 ETB ነው!" });

    const pendingWithdrawAmount = (db.withdrawals || [])
        .filter(w => w.userPhone === cleanPhone && w.status === 'PENDING')
        .reduce((sum, w) => sum + w.amount, 0);

    const availableToWithdraw = user.balance - pendingWithdrawAmount;

    if (reqAmount > availableToWithdraw) {
        return res.json({ success: false, message: `❌ በቂ ቀሪ ሂሳብ የሎትም! ማውጣት የሚችሉት ከፍተኛ መጠን፦ ${Math.max(0, availableToWithdraw).toFixed(2)} ETB` });
    }

    if (reqAmount > 10000) {
        const maxAllowedByPercent = user.balance * 0.65;
        if (reqAmount > maxAllowedByPercent) {
            return res.json({ success: false, message: `❌ ከ 10,000 ETB በላይ ማውጣት የሚቻለው ከአጠቃላይ ቀሪ ሂሳብዎ 65% ብቻ ነው! አሁን ማውጣት የሚችሉት ከፍተኛ መጠን፦ ${maxAllowedByPercent.toFixed(2)} ETB` });
        }
    }
    
    const newRequest = { id: 'WITH-' + Date.now(), userPhone: cleanPhone, amount: reqAmount, accountNumber, fullName, method, status: 'PENDING', date: new Date().toLocaleString('am-ET') };
    if (!db.withdrawals) db.withdrawals = [];
    db.withdrawals.push(newRequest);
    writeDB(db);
    res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ በተሳካ ሁኔታ ለአድሚን ተልኳል!" });
});

app.post('/admin/process-deposit', (req, res) => {
    const { id, action } = req.body;
    const db = readDB();
    const reqIndex = db.deposits.findIndex(r => r.id === id);
    if (reqIndex === -1) return res.json({ success: false });
    if (action === 'APPROVE') {
        db.deposits[reqIndex].status = 'APPROVED';
        if (db.users[db.deposits[reqIndex].userPhone]) db.users[db.deposits[reqIndex].userPhone].balance += db.deposits[reqIndex].amount;
    } else {
        db.deposits[reqIndex].status = 'REJECTED';
    }
    writeDB(db);
    res.json({ success: true });
});

app.post('/admin/process-withdrawal', (req, res) => {
    const { id, action } = req.body;
    const db = readDB();
    const reqIndex = db.withdrawals.findIndex(r => r.id === id);
    if (reqIndex === -1) return res.json({ success: false });
    
    const targetUserPhone = db.withdrawals[reqIndex].userPhone;
    const withdrawAmount = db.withdrawals[reqIndex].amount;
    
    if (action === 'APPROVE') {
        if (db.users[targetUserPhone] && db.users[targetUserPhone].balance >= withdrawAmount) {
            db.withdrawals[reqIndex].status = 'APPROVED';
            db.users[targetUserPhone].balance -= withdrawAmount;
        } else {
            return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የለም!" });
        }
    } else {
        db.withdrawals[reqIndex].status = 'REJECTED';
    }
    writeDB(db);
    res.json({ success: true });
});

app.get('/admin/stats', (req, res) => {
    const db = readDB();
    let totalCapital = Object.values(db.users).reduce((sum, u) => sum + u.balance, 0);
    res.json({ totalUsers: Object.keys(db.users).length, pendingDeposits: db.deposits.filter(r => r.status === 'PENDING').length, pendingWithdrawals: db.withdrawals.filter(r => r.status === 'PENDING').length, totalCapital });
});
app.get('/admin/deposits', (req, res) => { const db = readDB(); res.json(db.deposits || []); });
app.get('/admin/withdrawals', (req, res) => { const db = readDB(); res.json(db.withdrawals || []); });
app.get('/admin/users', (req, res) => { const db = readDB(); res.json(Object.values(db.users)); });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Dashbet ሰርቨር በተሳካ ሁኔታ ተነስቷል!`);
    console.log(`💻 ኮምፒውተርዎ ላይ ለመክፈት፡ http://localhost:5000`);
    console.log(`📱 በስልክዎ ለመክፈት፡ http://${CURRENT_IP}:5000`);
    console.log(`==================================================\n`);
});
