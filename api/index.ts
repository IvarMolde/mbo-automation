// Vercel serverless-inngang. Vercel krever at funksjoner ligger i «api/».
// Vi gjenbruker Express-appen fra src/server.ts (alle ruter er mountet der).
import app from "../src/server.js";

export default app;
