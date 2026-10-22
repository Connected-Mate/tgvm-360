# TGV M en 360

Page qui affiche les vues 360 de la visite virtuelle TGV M (Uptale), une par une, sans pastilles ni fiches.

- **Page** : `index.html` (GitHub Pages). Liste des 22 vues, options, code iframe prêt à coller.
- **Miroir** : `worker/` (Cloudflare Worker). Reçoit l'URL du lecteur Uptale, retire les pastilles de la liste des éléments avant que le lecteur démarre, renvoie la page. Rien n'est copié ni stocké.

## Options d'URL du miroir

| Option | Effet |
|---|---|
| `world=<id>` | Vue de départ (option native Uptale) |
| `hideTags=1` | Retire pastilles et fiches |
| `keepLinks=1` | Avec `hideTags` : garde les flèches de déplacement |
| `only=<id>` | Verrouille sur une vue, aucun enchaînement |
| `maxLinks=N` | Au plus N enchaînements par vue |

Exemple :

```
https://<miroir>/experience/Launch?id=TOBJjBO0K06Fg3xk7clw&lang=fr&playbackMode=Smartload&autostart=true&menu=false&ui=false&world=243d78a1-a4a7-4128-b7e3-f4e98872d5a3&hideTags=1&only=243d78a1-a4a7-4128-b7e3-f4e98872d5a3
```

## Déployer le miroir

```sh
cd worker
npx wrangler login
npx wrangler deploy
```

Puis coller l'adresse `https://tgvm-360.<compte>.workers.dev` dans la page (réglages avancés) ou dans `DEFAULT_MIRROR` de `index.html`.
