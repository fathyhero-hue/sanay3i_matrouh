const app = require("./api/server");

const PORT = process.env.PORT || 3000;
const listener = app.__sanay3iHttpServer || app;

listener.listen(PORT, () => {
  console.log("----------------------------------");
  console.log("Sanay3i Matrouh server is running");
  console.log(`http://localhost:${PORT}`);
  console.log("Realtime server: " + (app.__sanay3iHttpServer ? "WebSocket enabled" : "HTTP only"));
  console.log("----------------------------------");
});
