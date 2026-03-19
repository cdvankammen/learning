USBIP webapp (scaffold)

This directory contains a minimal backend skeleton used for development and CI.

Backend:
  - webapp/backend/index.js : Express-based health endpoint
  - webapp/backend/package.json : Node package

To run locally (developer machine with Node):
  cd webapp/backend
  npm install
  npm start

CI note: The backend is intentionally minimal; add tests and a frontend build (Vite/React) as needed.
