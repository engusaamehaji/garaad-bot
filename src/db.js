const { MongoClient } = require('mongodb');

let db = null;

async function connectDB() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.log('[DB] ⚠️  MONGO_URI lama helin — JSON files la isticmaalayaa');
        return null;
    }
    try {
        const client = new MongoClient(uri);
        await client.connect();
        db = client.db('garaad_bot');
        console.log('[DB] ✅ MongoDB ku xidnay');
        return db;
    } catch (err) {
        console.error('[DB] ❌ MongoDB connection failed:', err.message);
        return null;
    }
}

function getDB() { return db; }

module.exports = { connectDB, getDB };
