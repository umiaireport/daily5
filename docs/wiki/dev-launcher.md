# `dev.sh`

The executable launcher (`dev.sh:1-19`) resolves its own project directory, prefers the durable `.runtime/node-v24.21.0-linux-x64/bin` Node 24 installation when present, validates that Node and npm are available and major version 24, changes to `whale-arena/`, and execs `npm run dev`. It has no named functions.
