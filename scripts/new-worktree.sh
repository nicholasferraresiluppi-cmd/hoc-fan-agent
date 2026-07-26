#!/usr/bin/env bash
#
# new-worktree.sh — crea un git worktree ISOLATO per una sessione Claude.
#
# PERCHÉ. Più sessioni Claude sulla stessa working dir condividono la cartella
# `.next`: un `npm run build` di una sessione corrompe il `next dev` dell'altra
# (errori tipo "Cannot find module './vendor-chunks/@clerk.js'"), e le modifiche
# uncommitted si intrecciano nel working tree. Un worktree per sessione elimina
# entrambi i problemi: `.git` è condiviso, ma working tree + `.next` + porta dev
# sono indipendenti. `node_modules` viene condiviso via symlink (deps identiche)
# perché il conflitto è su `.next`, non sulle dipendenze.
#
# USO:
#   scripts/new-worktree.sh <nome> [porta-dev]
#
# ESEMPI:
#   scripts/new-worktree.sh academy-redesign          # branch feature/academy-redesign, porta 3001
#   scripts/new-worktree.sh fix/nav-badge 3002        # branch fix/nav-badge, porta 3002
#
set -euo pipefail

name="${1:-}"
port="${2:-3001}"

if [ -z "$name" ]; then
  echo "Uso: scripts/new-worktree.sh <nome> [porta-dev]" >&2
  echo "Es:  scripts/new-worktree.sh academy-redesign 3001" >&2
  exit 1
fi

# Radice del repo principale (dove vive .git), così lo script funziona anche
# se invocato da dentro un altro worktree.
root="$(git rev-parse --show-toplevel)"

# Se il nome contiene già un prefisso (feature/…, fix/…, chore/…) usalo come
# branch e ricava la dir dal basename; altrimenti default a feature/<nome>.
case "$name" in
  */*) branch="$name"; dirname="$(basename "$name")" ;;
  *)   branch="feature/${name}"; dirname="$name" ;;
esac
dir="${root}/.claude/worktrees/${dirname}"

if [ -e "$dir" ]; then
  echo "Esiste già: $dir — scegli un altro nome o rimuovilo con:" >&2
  echo "  git -C \"$root\" worktree remove \"$dir\"" >&2
  exit 1
fi

git -C "$root" fetch origin main --quiet
git -C "$root" worktree add -b "$branch" "$dir" origin/main

# node_modules condiviso via symlink: deps identiche, .next resta isolata (è il punto).
if [ -d "${root}/node_modules" ] && [ ! -e "${dir}/node_modules" ]; then
  ln -s "${root}/node_modules" "${dir}/node_modules"
  nm_note="node_modules → symlink al repo principale (deps condivise)"
else
  nm_note="node_modules non trovato nel repo principale: lancia 'npm install' nel worktree"
fi

cat <<EOF

Worktree pronto.
  dir    : ${dir}
  branch : ${branch}   (da origin/main)
  ${nm_note}

Prossimi passi:
  cd "${dir}"
  npm run dev -- -p ${port}      # porta DEDICATA, non 3000 (evita la collisione con altre sessioni)

A lavoro finito (dopo il merge della PR):
  git -C "${root}" worktree remove "${dir}"     # aggiungi --force se il tree è sporco
EOF
