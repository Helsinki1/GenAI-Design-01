import { fileURLToPath } from "node:url";
import { startFixture } from "../../tests/admin-fixture.mjs";

const fixture = await startFixture({
  appDirectory: fileURLToPath(new URL("../", import.meta.url)),
  cookieName: "sb-admin-localhost-auth-token",
});
console.log(`Admin sign-in: ${fixture.url}/sign-in`);
console.log(`Member sign-in: ${fixture.url}/sign-in?role=member`);
fixture.startNext();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
  await fixture.close();
  process.exit();
});
