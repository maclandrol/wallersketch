# Guide d'utilisation

WallerSketch sert à composer une table cocktail en 3D, à la présenter au client et à préparer l'installation. Ce guide va de la première table au plan d'installation.

## L'écran

- **À gauche**, la **Bibliothèque** (tables, socles, tissus, cocktails, verres, décor, et vos objets) et la **Scène**, qui liste ce qui est posé sur quoi (« Blue Lagoon × 15 »).
- **Au centre**, la vue 3D.
- **À droite**, les **propriétés** de ce qui est sélectionné. Quand rien n'est sélectionné, ce panneau règle la présentation (ambiance, fond, sol) et affiche la liste **À prévoir** : tout le matériel à apporter.

## Composer

1. **Ajoutez une table.** Cliquez sur une carte de la bibliothèque, ou faites-la glisser dans la scène.
2. **Ajoutez des socles.** Sélectionnez la table, puis cliquez sur un socle : il se pose dessus, à une place libre. Les socles font 50 cm de haut au maximum.
3. **Ajoutez un tissu.** Avec la table sélectionnée, cliquez sur une nappe : elle tombe sur la table et se drape en quelques instants.
   - Une **nappe** reste sous les socles, qui se posent dessus.
   - Un **drapé** passe par-dessus les socles et suit leurs hauteurs. Le réglage **Recouvre aussi les socles** permet de changer ce comportement.
   - Les propriétés indiquent la **retombée** sur chaque bord, calculée à partir des dimensions.
4. **Ajoutez des cocktails.** Sélectionnez un socle ou la table, puis cliquez sur un cocktail.
5. **Disposez en grille.** Sélectionnez un cocktail, puis cliquez sur **Répéter → Disposer en grille…**. Choisissez la quantité, le nombre de verres par rangée et l'écart entre eux. L'aperçu s'affiche en bleu ; **Placer** valide. Une seule annulation retire toute la grille.

### Déplacer et tourner

- **Glisser** un objet le déplace sur la surface située sous le curseur. Ce qui est posé dessus le suit.
- **Glisser la nappe** déplace toute la table habillée. Avec **Alt**, seule la nappe bouge.
- Pour tourner un objet, faites glisser la **pastille bleue** de l'anneau, ou appuyez sur **R**. La rotation se cale par pas de 15° ; avec **Alt**, elle est libre.
- Le bouton **Grille** cale les positions sur 1, 5 ou 10 cm, en partant de l'angle du support. Pendant un déplacement, **Alt** déplace librement.
- Les **flèches** déplacent la sélection de 1 cm, ou de 10 cm avec Maj.
- Le **clic droit** ouvre le menu : dupliquer, grouper, verrouiller, supprimer.

### Apparence

Sélectionnez un objet pour changer :
- les couleurs et la finition : mat, satiné, brillant ou **miroir** (pour l'or, l'argent ou le laiton) ;
- la texture : bois ou marbre ;
- l'éclairage intérieur des socles en acrylique.

Les cocktails ont leurs couleurs du fond à la surface, le remplissage, les glaçons, la garniture et l'option **Cristal taillé**.

Les **chevalets** et le **cadre menu** affichent votre propre image : votre carte, ou le nom d'un cocktail.

## Créer ses propres éléments

- **Créer un cocktail** : dans la catégorie Cocktails, ou depuis un cocktail sélectionné avec **Enregistrer comme cocktail…**. Choisissez le verre, les couleurs, la garniture et les glaçons ; l'aperçu suit chaque réglage. Le cocktail rejoint **Mes cocktails** et reste disponible dans tous vos projets.
- **Enregistrer une composition** : sélectionnez une table habillée, puis cliquez sur ☆ dans les propriétés. Elle apparaît dans **Mes objets**.
- **Importer un modèle 3D ou CAO** : *… → Importer un modèle 3D ou CAO*. Formats acceptés : GLB, glTF, OBJ, STL, PLY, 3MF, DAE, FBX, STEP et IGES. Les fichiers CAO arrivent à leurs vraies dimensions ; les autres sont convertis s'ils sont en centimètres ou en millimètres. Les couleurs se modifient matière par matière.
- **L'assistant** : voir la section suivante.

## Créer avec ChatGPT ou DeepSeek

L'assistant prépare des éléments à partir d'une simple description, par exemple « un bar à champagne doré pour 80 invités, avec une pyramide de coupes et des gradins pour les flûtes ». Un compte gratuit suffit.

1. Cliquez sur **Assistant**, onglet **ChatGPT, DeepSeek…**, et décrivez ce que vous voulez.
2. Cliquez sur **Copier et ouvrir ChatGPT** (ou DeepSeek). La demande est copiée et le site s'ouvre.
3. Dans une nouvelle discussion, collez (⌘V ou Ctrl+V) et envoyez.
4. Copiez toute la réponse avec le bouton « Copier » sous le message.
5. Revenez dans WallerSketch et cliquez sur **Coller la réponse** : les éléments s'affichent avec un aperçu.
6. **Garder dans la bibliothèque** les conserve, **Placer dans la scène** les ajoute à la composition.

Si une partie de la réponse n'est pas valable, cliquez sur **Copier les corrections pour l'assistant**, collez ce message dans la même discussion et recommencez à l'étape 4.

Avec une clé API (onglet **Clé API**), WallerSketch interroge directement ChatGPT, DeepSeek ou Claude, sans copier-coller, et accepte une photo. Les détails, y compris les assistants installés sur l'ordinateur, sont dans [AI.md](AI.md).

## Présenter au client

- **Vue** mémorise le point de vue actuel. Les vues apparaissent en vignettes en bas à droite ; un clic droit permet de les renommer, de les remplacer ou de les supprimer.
- **Présenter** passe en plein écran. Les flèches ← → font défiler les vues ; **Échap** quitte la présentation.
- **Ambiance** propose trois éclairages : Studio, Chaleureux, Soirée. Le fond et le sol se règlent avec.

## Exporter

Cliquez sur **Exporter** :
- **Images** : choisissez les vues, le format (16:9, 4:3, carré, 4:5, story 9:16) et la définition (jusqu'à 4K).
- **Plan coté** : une vue de dessus en centimètres, avec les socles numérotés, leur position depuis l'angle arrière gauche de la table et la liste du matériel. C'est la référence pour l'équipe d'installation.
- **Scène 3D** :
  - GLB pour Blender ou un logiciel de CAO ;
  - OBJ ;
  - USDZ, qui s'ouvre en réalité augmentée sur iPhone et iPad : le client voit la table chez lui, à taille réelle.

## Fichiers

- **Enregistrer** crée un fichier `.wsketch`. Il contient tout, y compris les modèles et les images importés, et s'ouvre donc tel quel sur un autre ordinateur.
- Les anciens fichiers `.cocktail` s'ouvrent aussi.
- Le travail non enregistré est proposé au prochain lancement si l'application se ferme mal.

## Raccourcis

| Action | macOS | Windows / Linux |
|---|---|---|
| Annuler / rétablir | ⌘Z / ⇧⌘Z | Ctrl+Z / Ctrl+Y |
| Dupliquer | ⌘D | Ctrl+D |
| Grouper / dégrouper | ⌘G / ⇧⌘G | Ctrl+G / Ctrl+Maj+G |
| Enregistrer | ⌘S | Ctrl+S |
| Exporter | ⌘E | Ctrl+E |
| Présenter | ⌘↩ | Ctrl+Entrée |
| Vue 3/4 / face / dessus | 1 / 2 / 3 | 1 / 2 / 3 |
| Cadrer | F | F |
| Tourner de 15° | R (Maj+R : sens inverse) | R (Maj+R : sens inverse) |
| Supprimer | ⌫ | Suppr |
