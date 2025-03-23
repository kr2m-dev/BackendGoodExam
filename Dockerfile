# Utilisation de l'image Node.js
FROM node:18

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste du projet
COPY . .

# Exposer le port sur lequel tourne ton serveur (exemple : 3000)
EXPOSE 3000

# Démarrer le serveur
CMD ["npm", "run", "dev"]

