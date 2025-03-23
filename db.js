const mysql = require('mysql2');

// Configuration de la base de données
const db = mysql.createConnection(process.env.DATABASE_URL);

// Connexion à MySQL
db.connect((err) => {
  if (err) {
    console.error('Erreur de connexion à MySQL :', err);
    return;
  }
  console.log('✅ Connecté à la base de données MySQL');
});

module.exports = db // Utilisation de export default pour exporter la connexion
