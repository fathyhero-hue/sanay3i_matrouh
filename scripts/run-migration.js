#!/usr/bin/env node
// شغّل ملفات SQL مباشرة على قاعدة بيانات Supabase عبر اتصال Postgres حقيقي
// (DATABASE_URL في .env) - مطلوب لأي DDL (CREATE/ALTER TABLE) لأن REST API
// بتاع Supabase (اللي بيستخدمه باقي المشروع عبر supabase-js) بيدعم بس عمليات
// على جداول/دوال موجودة بالفعل، مش تنفيذ SQL خام.
//
// الاستخدام: node scripts/run-migration.js docs/sql/service_requests.sql docs/sql/customers.sql
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("استخدام: node scripts/run-migration.js <file1.sql> [file2.sql ...]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL غير موجود في .env");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.resolve(process.cwd(), file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`\n--- تنفيذ: ${file} ---`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("commit");
        console.log(`✔ نجح: ${file}`);
      } catch (err) {
        await client.query("rollback");
        console.error(`✘ فشل: ${file}\n${err.message}`);
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("فشل تنفيذ الـ migration:", err.message);
  process.exit(1);
});
