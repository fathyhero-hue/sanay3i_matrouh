const app = require("./api/server");
const PORT = process.env.PORT || 3000;

// مسار إثبات ملكية النطاق لتطبيقات جوجل بلاي (Deep Links)
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json([
    {
      "relation": [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds"
      ],
      "target": {
        "namespace": "android_app",
        "package_name": "app.vercel.sanay3i_matrouh.twa",
        "sha256_cert_fingerprints": [
          "74:5F:ED:B6:8D:04:96:B8:2F:4C:9E:19:69:2D:6F:E6:34:B0:A8:7E:B3:90:6E:FD:DC:86:1F:3B:0B:47:69:AC"
        ]
      }
    }
  ]);
});

app.listen(PORT, () => {
  console.log("----------------------------------");
  console.log("Sanay3i Matrouh Supabase server is running");
  console.log(`http://localhost:${PORT}`);
  console.log("----------------------------------");
});