# 🚀 Déploiement — Afterglow by Kevin
### afterglowbykevin.ch · dépôt `snapshot-media/Afterglow` · VPS principal de Snapshot (srv888831)

Un push sur `main` met le site en ligne, sans rien d'autre à faire. Ce guide dit
comment, ce qui vit sur le serveur hors de git, et quoi vérifier.

> Mis à jour le 21.10.2026. Le guide d'origine (02.06.2026) décrivait une
> installation nginx + certbot + `git pull` par SSH qui n'existe plus : le site
> tourne derrière le Caddy partagé du VPS principal.

---

## Comment ça marche

```
poste de Kevin ──git push main──▶ GitHub (snapshot-media/Afterglow)
                                        │
                     runner dédié srv888831-afterglow (sur le VPS)
                                        ▼
             /var/www/afterglow : git fetch + git reset --hard origin/main
                                        ▼
       Caddy (/etc/caddy/Caddyfile, partagé) ──▶ fichiers statiques
                                             └─▶ php8.3-fpm (contact.php)
```

- **Workflow** `.github/workflows/deploy.yml` (« 🚀 Deploy to VPS ») : à chaque push
  sur `main`, le runner met le clone à jour, puis remet les droits (fichiers `.php`
  en 644, dossiers en 755). Aucune construction sur le serveur : ce qui est poussé
  est servi tel quel.
- **Runner** : service `actions.runner.snapshot-media-Afterglow.srv888831-afterglow`,
  installé dans `/opt/github-runner-afterglow`, sous l'utilisateur `github-runner`.
  Il est enregistré sur ce dépôt seul, hors du groupe de runners du portail.
- **Clone** : `/var/www/afterglow` (`github-runner:www-data`), remote
  `https://github.com/snapshot-media/Afterglow.git`, branche `main`.

---

## Avant de pousser : construire sur le poste

```bash
npm run build     # CSS minifiés (.min.css), chaque .jsx compilé en .js, pages prérendues, bundles/
npm run sitemap   # sitemap.xml
```

Commiter le résultat avec les sources : le serveur ne construit rien.
Aperçu local : `python -m http.server 8000` (configuration de `.claude/launch.json`) ;
le formulaire de contact (PHP) n'y tourne pas.

---

## Ce qui vit sur le serveur, hors de git

`git reset --hard` ne touche pas aux fichiers ignorés par `.gitignore` : ceux-ci
restent en place d'un déploiement à l'autre. Ils ne sont pas dans le dépôt, donc à
recréer à la main sur un nouveau serveur.

| Fichier | Rôle |
|---|---|
| `/var/www/afterglow/vendor/` + `composer.json` | PHPMailer, installé avec Composer dans le dossier du site. |
| `/var/www/afterglow/smtp-config.php` | Identifiants SMTP Infomaniak (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). `contact.php` le cherche d'abord dans `/var/www/`, puis dans le dossier du site (c'est là qu'il est aujourd'hui). Caddy refuse de le servir (404). |
| `/var/www/contact-log.csv` | Journal des demandes, écrit par `contact.php` hors de la racine web. ⚠️ Aujourd'hui il ne s'écrit pas : `/var/www` appartient à root et `www-data` ne peut pas y créer de fichier. L'envoi de l'e-mail n'en dépend pas. Il n'est pas non plus dans la sauvegarde de nuit. |

---

## Caddy et HTTPS

Le site est un bloc de la **section 4** du Caddyfile partagé du VPS principal
(`/etc/caddy/Caddyfile`), à côté de toutes les autres apps. Caddy obtient et renouvelle
le certificat tout seul.

Le fichier `Caddyfile` du dépôt n'est qu'une copie de référence de ce bloc, et elle
diffère du bloc en service (`preload` dans HSTS). **Ne jamais le copier sur
`/etc/caddy/Caddyfile`** : il remplacerait la configuration de tout le serveur.
Modifier le bloc en place, puis :

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Pas de `www` : `www.afterglowbykevin.ch` n'existe pas au DNS, et son bloc de
redirection a été retiré le 21.10.2026 (Caddy échouait à en obtenir le certificat).
Pour en ajouter un un jour : l'enregistrement DNS d'abord, puis le bloc
`www.afterglowbykevin.ch { redir https://afterglowbykevin.ch{uri} permanent }`.

Caddy refuse de servir (404) : `.git*`, `.env*`, `smtp-config.php`, `composer.*`,
`contact-log.csv`, `*.csv`, `*.md`, `*.jsx`, `vendor/`, `.github/`, `package*.json`,
`scripts/`. `.image-slots.state.json` doit rester servi (les images en dépendent).

---

## Vérifier un déploiement

1. GitHub → onglet **Actions** → « 🚀 Deploy to VPS » en vert
   (ou `gh run list -R snapshot-media/Afterglow --limit 3`).
2. `curl -sI https://afterglowbykevin.ch/` → `200`.
3. Sur le serveur, le clone est au commit poussé :
   `sudo -u github-runner git -C /var/www/afterglow log -1 --oneline`.

---

## Commandes utiles (VPS principal, en root)

```bash
# État du runner dédié
systemctl status actions.runner.snapshot-media-Afterglow.srv888831-afterglow

# Mettre à jour à la main, sans passer par GitHub (comme le workflow, sous son utilisateur)
sudo -u github-runner git -C /var/www/afterglow fetch origin
sudo -u github-runner git -C /var/www/afterglow reset --hard origin/main

# Erreurs de Caddy (il ne tient pas de journal d'accès)
journalctl -u caddy --since "-1h" --no-pager

# PHP (formulaire de contact)
systemctl reload php8.3-fpm
```

Toujours `sudo -u github-runner` pour `git` dans `/var/www/afterglow` : lancé en root,
il laisserait des fichiers à root que le runner ne pourrait plus réécrire au
déploiement suivant. (`.git/config` et `.git/index` sont déjà à root, restes d'anciens
passages ; sans gêne aujourd'hui, git remplace l'index au lieu de l'écrire.)

---

## Ce qui est publié

Tout ce qui est dans git arrive sur le serveur ; Caddy n'en sert que ce qu'il ne
bloque pas (voir plus haut). Pour l'essentiel :

```
/var/www/afterglow/
├── index.html, *.html          ← pages (prérendues par npm run build), 404.html
├── bundles/, kc-*.js           ← scripts compilés depuis les .jsx
├── kc.min.css, kc-pages.min.css
├── images/, fonts/, lib/
├── contact.php                 ← formulaire de contact (PHPMailer, SMTP Infomaniak)
├── .image-slots.state.json     ← doit rester servi
├── sitemap.xml, robots.txt, llms.txt, site.webmanifest
└── .github/workflows/deploy.yml
```

Les dossiers `screenshots/`, `scraps/`, `uploads/`, les fichiers `Wireframe - *.html`
et `HANDOFF-DEV.md` sont ignorés par `.gitignore` et ne sont pas publiés.
