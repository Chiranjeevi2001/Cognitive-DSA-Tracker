# DSA Tracker

Cognitive NeetCode 150 tracker for one-hour daily practice, designed with spaced-reptition to help you retain the problem pattern recognition for a longer time.

## Install

Install Node.js and npm first. On this machine, Homebrew Node is available at `/opt/homebrew/Cellar/node/25.8.0/bin`.

From the project folder:

```sh
cd "/Users/chirabs/Developer/Personal/DSA Tracker"
env PATH=/opt/homebrew/Cellar/node/25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm install
```

If your shell already has `node` and `npm` on `PATH`, the normal command is enough:

```sh
npm install
```

## Run

```sh
env PATH=/opt/homebrew/Cellar/node/25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/.

## Checks

```sh
env PATH=/opt/homebrew/Cellar/node/25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm run lint
env PATH=/opt/homebrew/Cellar/node/25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/npm run build
```

The explicit PATH keeps Vite's native dependency on Homebrew Node in this Codex environment.

## Data

The problem list is copied from `neetcode150_list.json` into `src/data/neetcode150_list.json`.

Progress and notebook entries are stored in `tracker-data/tracker-state.json` through the local `/api/state` endpoint. Browser localStorage is still used as a fallback/cache, and the import/export buttons remain available for manual backups.
