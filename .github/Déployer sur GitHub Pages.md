# 🚀 Déployer sur GitHub Pages

---

## Étape 1 : Configurer le champ `homepage` dans `package.json`

C'est l'étape la plus importante pour éviter les fameuses **pages blanches** après le déploiement. React doit savoir dans quel sous-dossier l'application va être hébergée.

1. Ouvrez le fichier `package.json` à la racine de votre projet.
2. Ajoutez ou mettez à jour la ligne `"homepage"` tout en haut en respectant ce format :

```json
{
  "name": "nom-de-votre-projet",
  "homepage": "https://<votre-nom-utilisateur>.github.io/<nom-du-depot>",
  "version": "1.0.0",
  ...
}
```
*(Remplacez `<votre-nom-utilisateur>` par votre pseudo GitHub et `<nom-du-depot>` par le nom exact de votre dépôt GitHub).*

---

## Étape 2 : Installer le module de déploiement (`gh-pages`)

L'outil `gh-pages` permet de créer automatiquement une branche dédiée sur votre dépôt et d'y pousser vos fichiers compilés.

Dans votre terminal, à la racine du projet, lancez la commande suivante :

```bash
npm install gh-pages --save-dev
# Ou si vous utilisez Yarn :
yarn add gh-pages --dev
```

---

## Étape 3 : Ajouter les scripts de build et de déploiement

Vérifiez ou ajoutez les scripts suivants dans la section `"scripts"` de votre fichier `package.json` :

```json
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d build",
  "build": "react-scripts build",
  "start": "react-scripts start"
}
```
*Note : Si votre outil de build génère un dossier de sortie nommé `dist` au lieu de `build`, modifiez le paramètre de la commande deploy par `-d dist`.*

---

## Étape 4 : Configurer les permissions GitHub Actions

Pour permettre à l'outil de pousser les fichiers sur votre dépôt sans rencontrer d'erreur d'autorisation (`403 Permission Denied`) :

1. Rendez-vous sur la page de votre dépôt sur GitHub.
2. Cliquez sur l'onglet **Settings** (Paramètres) en haut.
3. Dans le menu vertical de gauche, cliquez sur **Actions**, puis sur **General**.
4. Faites défiler la page vers le bas jusqu'à la section **Workflow permissions**.
5. Cochez l'option **Read and write permissions** (Permissions de lecture et d'écriture).
6. Cliquez sur le bouton **Save** pour enregistrer.

---

## Étape 5 : Lancer le déploiement

Vous êtes prêt à envoyer votre site en ligne ! 

1. Sauvegardez tous vos fichiers modifiés et commitez-les sur votre branche principale (`main` ou `master`) :
   ```bash
   git add .
   git commit -m "feat: prepare project for github pages deployment"
   git push origin main
   ```

2. Exécutez la commande de déploiement dans votre terminal :
   ```bash
   npm run deploy
   # Ou avec yarn :
   yarn deploy
   ```

*(Si vous utilisez une version de Node.js récente et un vieux projet nécessitant l'ancienne configuration OpenSSL pour Webpack, pensez à exécuter `set NODE_OPTIONS=--openssl-legacy-provider` sous Windows avant de lancer le déploiement).*

---

## Étape 6 : Activer GitHub Pages sur le dépôt

Une fois que le script a terminé de pousser le code sur la branche `gh-pages` :

1. Retournez sur votre dépôt GitHub dans l'onglet **Settings > Pages**.
2. Dans la section **Build and deployment**, sous **Source**, assurez-vous de sélectionner **Deploy from a branch**.
3. Dans le menu déroulant **Branch**, sélectionnez **`gh-pages`** et laissez le dossier sur `/ (root)`.
4. Cliquez sur **Save**.

---

 🎉 **Félicitations !** 
Votre application est désormais en ligne et accessible publiquement à l'adresse :
