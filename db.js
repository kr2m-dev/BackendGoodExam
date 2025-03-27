const mysql = require('mysql2');

// Configuration de la base de données avec un pool de connexions
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL, // Utilisation de l'URI de connexion
    waitForConnections: true,
    connectionLimit: 10, // Nombre max de connexions simultanées
    queueLimit: 0
});

// Exporter le pool au lieu d'une connexion unique
module.exports = pool.promise(); // Utilisation de `.promise()` pour supporter async/await
