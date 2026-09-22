# How Muse reads the Adonis API contract

This document describes how Muse (the coach) reads the API contract and stays in
sync with the deployed backend. Commit this to the repo and keep it current.

## Source of truth

- **`dev/MUSE_API.txt`** is the authoritative, human- and AI-readable API contract.
  It lives in the public GitHub repo and is read fresh each session — never cached,
  never pasted by the user.
- **`dev/MUSE_SYNC.txt`** tracks system state, gaps, and the change log.

## How Muse reads it

1. Muse reads `dev/MUSE_API.txt` from the GitHub repo over plain HTTPS (no auth/token).
2. Before trusting it, Muse calls the live `version` action and requires
   `CONTRACT_VERSION` to match the doc. If they differ, the **live API wins** and the
   doc is flagged stale.
3. The doc is re-read each session.

## What does NOT go in the contract file

Async dev communication does **not** go in `MUSE_API.txt`. That goes in the
`muse_messages` board via the `send_message` / `list_messages` actions. Keep
`MUSE_API.txt` to: endpoint, auth, action shapes, conventions, error format.

## Changelog discipline

Bump `CONTRACT_VERSION` and update `dev/MUSE_API.txt` **in the same deploy commit**
whenever the action contract changes.
