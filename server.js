const app = require("./api/server");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`صنايعي مطروح يعمل محليًا على: http://localhost:${PORT}`);
  console.log(`لوحة الإدارة: http://localhost:${PORT}/admin`);
  console.log(`إضافة صنايعي من الإدارة: http://localhost:${PORT}/admin/add-worker`);
});
