const app = require("./api/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("----------------------------------");
  console.log("Sanay3i Matrouh server is running");
  console.log(`http://localhost:${PORT}`);
  console.log("----------------------------------");
});
