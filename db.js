const mysql = require('mysql2');

// Remplace `mysql.createConnection()` par `mysql.createPool()`
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Exportation du pool (sans `.promise()`, pour garder ton style de code actuel)
module.exports = pool;
