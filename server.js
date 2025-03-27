
const dotenv = require("dotenv");
const express = require("express");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
//const API_URL = "https://backendgoodexam-production.up.railway.app"; // Remplace par ton URL d'API

const { v4: uuidv4 } = require("uuid"); // Pour générer des noms uniques


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


const API_KEY = process.env.DEEPSEEK_API_KEY; // Utilisation de la clé Groq

require("dotenv").config();
const db = require("./db"); // Importation de la connexion MySQL


const db = require("./db"); // Importation du pool MySQL

app.get('/', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT '🚀 Backend opérationnel !' AS message");
        res.send(rows[0].message);
    } catch (error) {
        console.error("Erreur lors de la connexion à la base de données :", error);
        res.status(500).send("Erreur de connexion à la base de données");
    }
});






// Fonction pour corriger une copie individuelle
async function corrigerCopie(idCopie, idExamen, fichierCopie) {
  try {
    // Récupérer la correction de l'examen
    const getCorrectionSql = 'SELECT * FROM correction WHERE idExamen = ?';
    const correctionResults = await new Promise((resolve, reject) => {
      db.query(getCorrectionSql, [idExamen], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (correctionResults.length === 0) {
      console.log(`❌ Aucune correction trouvée pour l'examen ${idExamen}`);
      return;
    }
    
    const correction = correctionResults[0];
    
    // Lire le fichier de correction
    const correctionFilePath = path.join(__dirname, "corrections", correction.nomCorrige);
    const correctionContent = fs.readFileSync(correctionFilePath, 'utf8');
    console.log("la correction ",correctionContent);
    
    // Lire le contenu de la copie
    const copieFilePath = path.join(__dirname, "MesCopies", fichierCopie);
    let copieContent;
    
    try {
      if (fichierCopie.endsWith('.pdf')) {
        const data = fs.readFileSync(copieFilePath);
        const pdfData = await pdf(data);
        copieContent = pdfData.text;
        console.log("copie de l'etudiant",copieContent);
      } else {
        copieContent = fs.readFileSync(copieFilePath, 'utf8');
        
      }
    } catch (err) {
      console.error(`❌ Erreur lors de la lecture de la copie ${idCopie}:`, err);
      return;
    }
    
    // Appeler l'API IA pour évaluer la copie
    const notePrompt = `
      Voici le corrigé de l'examen:
      ${correctionContent}
      
      Voici la copie de l'étudiant:
      ${copieContent}
      
      corrige cette copie sur 20 points par rapport a la conformite avec correction . Donne uniquement la note sous forme de nombre, sans texte supplémentaire.
    `;
    
    // Appel à l'API pour évaluer
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        //model: "mixtral-8x7b-32768",
        messages: [
          { role: "user", content: notePrompt },
          { role: "system", content: "Réponds uniquement par un nombre entre 0 et 20, sans texte supplémentaire." },
        ],
      }),
    });
    
    const data = await response.json();
    console.log("IA REPONSE",data);
    const noteStr = data.choices?.[0]?.message?.content || "0";
    
    // Convertir la note en nombre
    let note = parseFloat(noteStr.trim());
    if (isNaN(note) || note < 0 || note > 20) {
      note = 0; // Valeur par défaut si la note n'est pas valide
    }
    
    // Mettre à jour la note dans la base de données
    const updateNoteSql = 'UPDATE Copie SET note = ? WHERE idCopie = ?';
    await new Promise((resolve, reject) => {
      db.query(updateNoteSql, [note, idCopie], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    console.log(`✅ Copie ${idCopie} corrigée avec succès ! Note: ${note}/20`);
    
  } catch (error) {
    console.error(`❌ Erreur lors de la correction de la copie ${idCopie}:`, error);
  }
}



//-----------------------------------------------------------------------------------

//  inserer copie dans examen pour eleve 
const MesCopiesDir = path.join(__dirname, "MesCopies");

// Vérifier et créer le dossier s'il n'existe pas
if (!fs.existsSync(MesCopiesDir)) {
  fs.mkdirSync(MesCopiesDir, { recursive: true });
  console.log("📂 Dossier 'MesCopies' créé automatiquement.");
} else {
  console.log("📂 Dossier 'MesCopies' déjà existant.");
}


// 📂 Définition du stockage des copies dans le dossier "MesCopies"
const storageCopies = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "MesCopies/"); // 📂 Dossier où les fichiers seront enregistrés
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Nom unique du fichier
  },
});


const soumis = multer({ storage: storageCopies });
//------------------------------------------------------------------------------------

// 📌 Route pour soumettre une copie
// Modifions la route /api/soumettre dans le fichier server.js
app.post("/api/soumettre", soumis.single("copie"), async (req, res) => {
  console.log("📂 Fichier reçu :", req.file);
  console.log("📋 Données reçues :", req.body);

  const { idExamen, idEtudiant } = req.body;
  const idEx=parseInt(idExamen);

  const id=parseInt(idEtudiant);
 // console.log("souleymane degueur boppou",id);
  const fichier = req.file ? req.file.filename : null;
 

  if (!idEx || !fichier || !id) {
    return res.status(400).json({ error: "Tous les champs sont requis !" });
  }

  try {
    // Insérer la copie dans la base de données
    const insertCopySql = 'INSERT INTO Copie (fichier, note, estPlagiat, idExamen, idEtudiant) VALUES (?, ?, ?, ?, ?)';
    const insertResult = await new Promise((resolve, reject) => {
      db.query(insertCopySql, [fichier, 0, false, idEx, id], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    const idCopie = insertResult.insertId;
    
    // Vérifier si une correction existe pour cet examen
    const checkCorrectionSql = 'SELECT * FROM correction WHERE idExamen = ?';
    const correctionResult = await new Promise((resolve, reject) => {
      db.query(checkCorrectionSql, [idEx], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    // Si une correction existe, lancer la correction de la copie
    if (correctionResult.length > 0) {
      // Lancer la correction en arrière-plan pour ne pas bloquer la réponse
      corrigerCopie(idCopie, idEx, fichier);
      res.status(201).json({ 
        message: "Copie soumise avec succès ! La correction est en cours...",
        status: "correction_en_cours" 
      });
    } else {
      res.status(201).json({ 
        message: "Copie soumise avec succès ! Aucune correction disponible pour le moment.",
        status: "en_attente_correction" 
      });
    }
  } catch (error) {
    console.error("❌ Erreur lors de la soumission de la copie:", error);
    res.status(500).json({ error: "Erreur lors de l'envoi de la copie" });
  }
});


//-----------------------------------------------------------------------------------



// api pour recuperer les copies de l'etudiant

app.get("/api/copies/:Etudiant", (req, res) => {
  const { Etudiant } = req.params;
  const idEtudiant = parseInt(Etudiant);

  if (isNaN(idEtudiant)) {
    return res.status(400).json({ error: "Identifiant étudiant invalide." });
  }

  const query = `
    SELECT e.titre AS nomMatiere, e.type, c.note, c.estPlagiat 
    FROM Examen e 
    JOIN Copie c ON e.idExamen = c.idExamen 
    WHERE c.idEtudiant = ?`;

  db.query(query, [idEtudiant], (err, results) => {
    if (err) {
      console.error("Erreur lors de la récupération des copies :", err);
      return res.status(500).json({ error: "Erreur serveur lors de la récupération des copies." });
    }

    if (!results || results.length === 0) {
      return res.json([]); // Réponse avec un tableau vide et un code 200
    }
    

    res.json(results);
  });
});


//------------------------------------------------------------------------------

// Modifiez la fonction getAICorrection pour sauvegarder la correction
// Modifions la route /api/correction/:id dans le fichier IA.js
app.get("/api/correction/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const examenId = parseInt(id, 10);
    console.log("valeur de la conversion ", examenId);
    const [results] = await db.promise().query("SELECT * FROM Examen WHERE idExamen = ?", [examenId]);
    console.log("📋 Résultat SQL :", results);

    if (results.length === 0) {
      return res.status(404).json({ message: "Examen non trouvé" });
    }

    const examen = results[0];
    const fichierPath = `./uploads/${examen.fichier}`;

    if (!fs.existsSync(fichierPath)) {
      return res.status(404).json({ message: "Fichier non trouvé" });
    }

    const texteExamen = await extractTextFromFile(fichierPath);
    console.log("📄 Texte extrait :", texteExamen);

    console.log("📡 Envoi à l'IA pour correction...");
    const iaCorrection = await getAICorrection(texteExamen);
    console.log("✅ Réponse IA :", iaCorrection);

    // Générer un nom unique pour le fichier de correction
    const uniqueFileName = `correction_${examenId}_${uuidv4()}.txt`;
    const correctionPath = path.join(__dirname, "./corrections", uniqueFileName);
    console.log(correctionPath);
    
    // Créer le répertoire "corrections" s'il n'existe pas
    const correctionsDir = path.join(__dirname, "./corrections");
    if (!fs.existsSync(correctionsDir)) {
      console.log("🛠 Création du dossier corrections...");
      fs.mkdirSync(correctionsDir, { recursive: true });
    }
    console.log("📂 Dossier corrections existe :", fs.existsSync(correctionsDir));
    
    // Écrire la correction dans un fichier
    fs.writeFileSync(correctionPath, iaCorrection, "utf8");
    console.log(`📝 Correction sauvegardée dans ${correctionPath}`);
    
    // Insérer ou mettre à jour l'enregistrement dans la table correction
    try {
      // Vérifier si une correction existe déjà pour cet examen
      const [existingCorrections] = await db.promise().query(
        "SELECT * FROM correction WHERE idExamen = ?", 
        [examenId]
      );
      
      if (existingCorrections.length > 0) {
        // Mise à jour de la correction existante
        await db.promise().query(
          "UPDATE correction SET nomCorrige = ? WHERE idExamen = ?",
          [uniqueFileName, examenId]
        );
        console.log("✅ Correction mise à jour dans la base de données");
      } else {
        // Insertion d'une nouvelle correction
        await db.promise().query(
          "INSERT INTO correction (nomCorrige, idExamen) VALUES (?, ?)",
          [uniqueFileName, examenId]
        );
        console.log("✅ Correction ajoutée dans la base de données");
      }
      
      // Récupérer toutes les copies non corrigées pour cet examen
      const [copies] = await db.promise().query(
        "SELECT * FROM Copie WHERE idExamen = ? AND note = 0",
        [examenId]
      );
      
      console.log(`🔍 ${copies.length} copies à corriger trouvées`);
      
      // Corriger chaque copie
      if (copies.length > 0) {
        for (const copie of copies) {
          console.log(`⚙️ Correction de la copie ${copie.idCopie}...`);
          setTimeout(() => {
            corrigerCopie(copie.idCopie, examenId, copie.fichier);
          }, 100); // Léger délai pour éviter de surcharger l'API
        }
      }
      
    } catch (dbError) {
      console.error("❌ Erreur lors de l'enregistrement en base de données :", dbError);
      // On continue car la correction a déjà été générée
    }
  
    // Modifier la réponse pour inclure le chemin du fichier
    res.json({ 
      correction: iaCorrection,
      fichierCorrection: uniqueFileName,
      //message: `Correction générée avec succès. ${copies?.length || 0} copies à corriger.`
    });

  } catch (error) {
    console.error("❌ Erreur API :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});
 // 🔹 Fonction pour obtenir la correction depuis une API d'IA
 const getAICorrection = async (texteExamen) => {
  console.log("📡 Envoi du texte à l'IA pour correction...");
  try {
      const prompt = `Corrige cet examen : \n\n${texteExamen}. Fournis une réponse détaillée.`;
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
        model: "llama3-70b-8192",
        //model: "mixtral-8x7b-32768",
              messages: [
                  { role: "user", content: prompt },
                  { role: "system", content: "Réponds uniquement en français." },
              ],
          }),
      });
      
      console.log("📤 Groq API appelée...");
      
      const data = await response.json();
      console.log("✅ Réponse Groq :", data);
      
      return data.choices?.[0]?.message?.content || "Pas de correction disponible.";
      return data;
  } catch (error) {
      console.error("❌ Erreur API Groq :", error);
      return "Erreur lors de la génération de la correction.";
  }
};

//------------------------------------------------------------------------------------

// Route pour télécharger une correction
app.get("/api/telecharger-correction/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "corrections", filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Fichier de correction non trouvé" });
  }
  
  res.download(filePath);
});

//------------------------------------------------------------------------------------


// 🔹 Extraction de texte depuis un fichier PDF ou TXT
async function extractTextFromFile(filePath) {
  //const fichierPath = `../uploads/${fichierPath}`;
 console.log(`📂 Chemin du fichier : ${filePath}`);
 
 if (!fs.existsSync(filePath)) {
     return res.status(404).json({ message: "Fichier non trouvé" });
 }
 

if (filePath.endsWith(".pdf")) {
 const data = fs.readFileSync(filePath);
 const pdfData = await pdf(data);
 return pdfData.text;
} else {
 return fs.readFileSync(filePath, "utf8");
}
}

//-------------------------------------------------------------------------------------

// 🔹 Endpoint IA : Générer une réponse
app.post("/api/generate", async (req, res) => {
  console.log("📥 Requête reçue :", req.body);

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Le prompt est requis." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
       // model: "mixtral-8x7b-32768",
        messages: [
          { role: "user", content: prompt },
          { role: "system", content: "Réponds uniquement en français." },
        ],
      }),
    });

    console.log("📤 Groq API appelée...");

    const data = await response.json();
    console.log("✅ Réponse Groq :", data);

    res.json({ response: data.choices?.[0]?.message?.content || "Pas de réponse." });

  } catch (error) {
    console.error("❌ Erreur API Groq :", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

//-------------------------------------------------------------------------------------


// Récupérer la liste des examens publiés avec le nom du professeur pour eleve

app.get("/api/exams", (req, res) => {
  const sql = `
  SELECT e.idExamen AS id, 
    e.titre AS title, 
    CONCAT("https://backendgoodexam-production.up.railway.app/uploads/", e.fichier) AS fileUrl, 
    e.publie, 
    CONCAT(ens.prenom, ' ', ens.nom) AS teacher
  FROM Examen e
  LEFT JOIN Enseignant ens ON e.idEnseignant = ens.idEnseignant
  WHERE e.publie = 1;

  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Erreur lors de la récupération des examens :", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
    res.json(results);
  });
});

//----------------------------------------------------------------------------------


//Mettre à jour un examen pour le publier
app.put('/api/examens/:id', (req, res) => {
  const { id } = req.params;
  const { publie } = req.body; // Publier ou non l'examen

  db.query('UPDATE Examen SET publie = ? WHERE idExamen = ?', [publie, id], (err, result) => {
    if (err) return res.status(500).json({ message: "Erreur de mise à jour" });
    res.json({ message: 'Examen mis à jour avec succès' });
  });
});

//Récupérer les examens 
app.get('/api/examens/:id', (req, res) => {
  const teacherId = req.params.id; // Prendre l'ID de l'enseignant connecté
  db.query('SELECT * FROM Examen WHERE idEnseignant = ?', [teacherId], (err, results) => {
    if (err) return res.status(500).json({ message: "Erreur serveur" });
    res.json(results);
  });
});


//-----------------------------------------------------------------------------------

// Servir les fichiers statiques du dossier "uploads"
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const uploadDir = path.join(__dirname, 'uploads');

// Vérifier si le dossier existe, sinon le créer
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // Crée le dossier (et les sous-dossiers si nécessaire)
}


//configuration de multer pour stocké les fichiers dans le dossier /uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Dossier où seront stockés les fichiers
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Nom unique pour chaque fichier
  },
});

const upload = multer({ storage });

// 🚀 Route pour créer un devoir
app.post("/api/examens/", upload.single("fichier"), (req, res) => {
  const { matiere, type, dateDebut, dateLimite, idEnseignant} = req.body;
  const fichier = req.file ? req.file.filename : null; // Vérifie si un fichier a été envoyé

  if (!matiere || !type || !dateDebut || !dateLimite) {
    return res.status(400).json({ error: "Tous les champs sont requis !" });
  }

  const sql = `INSERT INTO Examen (titre, type, dateDebut, dateLimite, fichier, idEnseignant) VALUES (?, ?, ?, ?, ?, ?)`;
  db.query(sql, [matiere, type, dateDebut, dateLimite, fichier, parseInt(idEnseignant)], (err, result) => {
    if (err) {
      console.error("Erreur SQL :", err);
      return res.status(500).json({ error: "Erreur lors de l'ajout du devoir" });
    }
    res.status(201).json({ message: "Devoir créé avec succès !" });
  });
});

//--------------------------------------------------------------------------------------


// 🚀 Route d'inscription
app.post("/register", async (req, res) => {
    const { who, prenom, nom, email, motDePasse } = req.body;
  
    if (!who || !prenom || !nom || !email || !motDePasse) {
      return res.status(400).json({ error: "Tous les champs sont requis !" });
    }
  
    let tableName;
    if (who === "etudiant") {
      tableName = "Etudiant";
    } else if (who === "enseignant") {
      tableName = "Enseignant";
    } else {
      return res.status(400).json({ error: "Type d'utilisateur invalide." });
    }
  
    try {
      // Vérifier si l'email existe déjà
      const checkEmailQuery = `SELECT * FROM ${tableName} WHERE email_ = ?`;
      db.query(checkEmailQuery, [email], async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Erreur serveur" });
        }
  
        if (results.length > 0) {
          return res.status(400).json({ error: "Cet email est déjà utilisé !" });
        }
  
        // Hachage du mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(motDePasse, salt);
  
        // Insérer l'utilisateur dans la base de données
        const insertQuery = `INSERT INTO ${tableName} (prenom, nom, email_, motDepasse) VALUES (?, ?, ?, ?)`;
        db.query(insertQuery, [prenom, nom, email, hashedPassword], (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: "Erreur lors de l'inscription" });
          }
          res.status(201).json({ message: "Inscription réussie !" });
        });
      });
    } catch (error) {
      res.status(500).json({ error: "Une erreur est survenue" });
    }
  });
  //--------------------------------------------------------------------------------


// 🚀 Route de connexion
app.post("/login", (req, res) => {
    const { email, password, who } = req.body;
  
    let tableName;
    if (who === "etudiant") {
      tableName = "Etudiant";
    } else if (who === "enseignant") {
      tableName = "Enseignant";
    } else {
      return res.status(400).json({ error: "Type d'utilisateur invalide." });
    }
  
    const query = `SELECT * FROM ${tableName} WHERE email_ = ?`;
    db.query(query, [email], async (err, results) => {
      if (err) {
        console.error("Erreur SQL :", err);
        return res.status(500).json({ error: "Erreur serveur." });
      }
  
      if (results.length === 0) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect." });
      }
  
      const user = results[0];
  
      // Vérifier le mot de passe
      const isMatch = await bcrypt.compare(password, user.motDepasse);
      if (!isMatch) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect." });
      }
  
      // Retourner les infos de l'utilisateur sans le mot de passe
      res.json({
        id: user.idEtudiant || user.idEnseignant,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email_,
        who,
      });
    });
  });
//---------------------------------------------------------------------  



app.get("/api/statistiques/enseignant/:idEnseignant", async (req, res) => {
  const idEnseignant = parseInt(req.params.idEnseignant, 10); // Convertir en entier

  if (isNaN(idEnseignant)) {
    return res.status(400).json({ error: "ID enseignant invalide." });
  }

  try {
    console.log("🔍 Récupération des stats pour l'enseignant ID:",idEnseignant);

    // 1️⃣ Récupérer la moyenne par titre d'examen
    const moyenneQuery = `
      SELECT E.titre, AVG(C.note) AS moyenne
      FROM Copie C
      JOIN Examen E ON C.idExamen = E.idExamen
      WHERE E.idEnseignant = ? 
      GROUP BY E.titre;
    `;
    const [moyenneResult] = await db.promise().query(moyenneQuery, [idEnseignant]);
    console.log("📊 Moyenne par examen:", moyenneResult);

    // 2️⃣ Récupérer la distribution des notes
    const distributionQuery = `
      SELECT
        SUM(CASE WHEN C.note BETWEEN 0 AND 5 THEN 1 ELSE 0 END) AS "0-5",
        SUM(CASE WHEN C.note BETWEEN 5 AND 10 THEN 1 ELSE 0 END) AS "5-10",
        SUM(CASE WHEN C.note BETWEEN 10 AND 15 THEN 1 ELSE 0 END) AS "10-15",
        SUM(CASE WHEN C.note BETWEEN 15 AND 20 THEN 1 ELSE 0 END) AS "15-20"
      FROM Copie C
      JOIN Examen E ON C.idExamen = E.idExamen
      WHERE E.idEnseignant = ? GROUP BY E.titre;
    `;
    const [distributionResult] = await db.promise().query(distributionQuery, [idEnseignant]);
    console.log("📊 Distribution des notes:", distributionResult);

    const distribution = distributionResult.length > 0 ? [
      { name: "0-5", value: distributionResult[0]["0-5"] || 0 },
      { name: "5-10", value: distributionResult[0]["5-10"] || 0 },
      { name: "10-15", value: distributionResult[0]["10-15"] || 0 },
      { name: "15-20", value: distributionResult[0]["15-20"] || 0 }
    ] : [];

    // 3️⃣ Récupérer le taux de réussite
    const tauxQuery = `
      SELECT 
        (SUM(CASE WHEN C.note >= 10 THEN 1 ELSE 0 END) / COUNT(*)) * 100 AS tauxReussite
      FROM Copie C
      JOIN Examen E ON C.idExamen = E.idExamen
      WHERE E.idEnseignant = ? GROUP BY E.titre;
    `;
    const [tauxResult] = await db.promise().query(tauxQuery, [idEnseignant]);
    console.log("🎯 Taux de réussite:", tauxResult);

    const tauxReussite = tauxResult.length > 0 ? tauxResult[0]?.tauxReussite || 0 : 0;

    // ✅ Envoyer les données sous une structure claire
    res.json({
      moyenne: moyenneResult, // Tableau contenant titre et moyenne
      distribution,
      tauxReussite
    });
    console.log("✅ Données envoyées au frontend :", {
      moyenne: moyenneResult,
      distribution,
      tauxReussite
    });
    

  } catch (error) {
    console.error("❌ Erreur serveur:", error);
    res.status(500).json({ error: "Erreur serveur." });
  }
});



//---------------------------------------------------------------------------------



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
