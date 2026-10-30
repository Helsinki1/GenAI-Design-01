import { fileURLToPath } from "node:url";

// This folder is independently installable and is the Vercel Root Directory.
export default {
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};
