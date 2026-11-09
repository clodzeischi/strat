#!/usr/bin/env bash
# Strat launcher for macOS and Linux: gets the game, gets Node.js if needed, builds, starts the server
# and opens the game in your browser. Run it again any time to update and play.
#
#   curl -fsSL https://raw.githubusercontent.com/clodzeischi/strat/main/play.sh | bash
#
# Settings (environment variables): STRAT_DIR (where the game goes, default ~/strat), PORT (default 8080).
# Node.js is installed for you only if you don't have a recent enough one, into ~/.strat/ (no admin rights needed).

set -euo pipefail

REPO=clodzeischi/strat
NODE_VERSION=22.23.4
PORT=${PORT:-8080}

say() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

download() { # url file
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$2" "$1"
  else die "Neither curl nor wget is installed. Install one of them and run this again."; fi
}

have_git() {
  command -v git >/dev/null 2>&1 || return 1
  # On a Mac without the developer tools, "git" only pops up an install dialog.
  if [ "$(uname -s)" = Darwin ]; then xcode-select -p >/dev/null 2>&1 || return 1; fi
  git --version >/dev/null 2>&1
}

node_ok() { # Vite needs Node 20.19+ or 22.12+.
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v=$(node -v 2>/dev/null) || return 1
  v=${v#v}; major=${v%%.*}; minor=${v#*.}; minor=${minor%%.*}
  [ "$major" -ge 23 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; } || { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }
}

get_game() {
  # Running from inside a copy of the game: use it.
  local here
  here=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || true)
  if [ -n "$here" ] && [ -f "$here/package.json" ] && grep -q '"name": "strat"' "$here/package.json"; then
    STRAT_DIR=$here
  else
    STRAT_DIR=${STRAT_DIR:-$HOME/strat}
  fi

  if [ -d "$STRAT_DIR/.git" ] && have_git; then
    say "Updating the game in $STRAT_DIR"
    git -C "$STRAT_DIR" pull --ff-only || say "Couldn't update (offline, or files changed locally). Playing the copy you have."
  elif [ -f "$STRAT_DIR/package.json" ] && [ ! -d "$STRAT_DIR/.git" ]; then
    say "Updating the game in $STRAT_DIR"
    fetch_tarball || say "Couldn't download the update. Playing the copy you have."
  elif [ -e "$STRAT_DIR" ] && [ ! -f "$STRAT_DIR/package.json" ]; then
    die "$STRAT_DIR exists but isn't the game. Move it, or pick another folder: STRAT_DIR=~/games/strat bash play.sh"
  elif have_git; then
    say "Downloading the game into $STRAT_DIR"
    git clone --depth 1 "https://github.com/$REPO.git" "$STRAT_DIR"
  else
    say "Downloading the game into $STRAT_DIR (git isn't installed, so as an archive)"
    fetch_tarball
  fi
}

fetch_tarball() {
  local tmp
  tmp=$(mktemp -d)
  download "https://codeload.github.com/$REPO/tar.gz/refs/heads/main" "$tmp/strat.tar.gz" || { rm -rf "$tmp"; return 1; }
  mkdir -p "$STRAT_DIR"
  # -m: files get today's date, so the build below sees they changed.
  tar -xzmf "$tmp/strat.tar.gz" -C "$STRAT_DIR" --strip-components 1
  rm -rf "$tmp"
}

get_node() {
  if node_ok; then say "Using Node.js $(node -v)"; return; fi
  local os arch dir
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) die "Unsupported system $(uname -s). Install Node.js 22 from https://nodejs.org and run this again." ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    armv7l|armv7*) arch=armv7l ;;
    *) die "Unsupported processor $(uname -m). Install Node.js 22 from https://nodejs.org and run this again." ;;
  esac
  dir="$HOME/.strat/node-v$NODE_VERSION-$os-$arch"
  if [ ! -x "$dir/bin/node" ]; then
    say "Installing Node.js $NODE_VERSION into $HOME/.strat (only the game uses it)"
    mkdir -p "$HOME/.strat"
    download "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$os-$arch.tar.gz" "$dir.tar.gz"
    tar -xzf "$dir.tar.gz" -C "$HOME/.strat"
    rm -f "$dir.tar.gz"
  fi
  export PATH="$dir/bin:$PATH"
  say "Using Node.js $(node -v)"
}

build() {
  cd "$STRAT_DIR"
  # Install packages when they're missing or package-lock.json changed.
  local stamp=node_modules/.strat-lock
  if [ ! -d node_modules ] || ! cmp -s package-lock.json "$stamp"; then
    say "Installing the game's packages (a minute or two the first time)"
    npm ci --no-audit --no-fund
    cp package-lock.json "$stamp"
  fi
  if [ ! -f dist/index.html ] || [ -n "$(find src server index.html package-lock.json vite.config.ts -newer dist/index.html 2>/dev/null | head -n 1)" ]; then
    say "Building the game"
    npm run build
  fi
}

open_browser() {
  local url="http://localhost:$PORT" i
  for i in $(seq 1 60); do
    if curl -fs -o /dev/null "$url" 2>/dev/null || wget -q -O /dev/null "$url" 2>/dev/null; then
      say "Opening $url"
      if [ "$(uname -s)" = Darwin ]; then open "$url"
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
      else say "Open $url in your browser."; fi
      return
    fi
    sleep 1
  done
}

main() {
  get_game
  get_node
  build
  if curl -fs -o /dev/null "http://localhost:$PORT" 2>/dev/null; then
    die "Something is already running on port $PORT (maybe the game, in another window). Close it, or use another port: PORT=9000 bash play.sh"
  fi
  say "Starting the game server. Leave this window open while you play; press Ctrl+C to stop."
  open_browser &
  PORT=$PORT exec npm run serve
}

main "$@"
