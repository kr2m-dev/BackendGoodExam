const mysql = require('mysql2');

// Configuration de la base de données
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // Remplace par ton user MySQL
  password: '', // Mets ton mot de passe
  database: 'PLATEFORME', // Assure-toi que le nom de la base de données est correct
});

// Connexion à MySQL
db.connect((err) => {
  if (err) {
    console.error('Erreur de connexion à MySQL :', err);
    return;
  }
  console.log('✅ Connecté à la base de données MySQL');
});

module.exports = db // Utilisation de export default pour exporter la connexion
