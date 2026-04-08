import { createApp } from "./app.js";
import { env } from "./utils/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Edulytics API listening on http://localhost:${env.PORT}`);
});

