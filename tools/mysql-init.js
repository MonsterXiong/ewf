const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function getUrl() {
  return process.env.EWF_TEST_MYSQL_URL || process.env.EWF_MYSQL_URL;
}

function stripComments(sql) {
  // remove /* ... */ block comments
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // remove -- line comments
  sql = sql.replace(/^\s*--.*$/gm, "");
  return sql;
}

function splitSql(sql) {
  // our schema has no procedures/triggers; split by ; is enough
  return stripComments(sql)
    .replace(/\r\n/g, "\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function existsColumn(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function existsIndex(pool, table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function ensureColumn(pool, table, column, ddl) {
  const ok = await existsColumn(pool, table, column);
  if (ok) return false;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  return true;
}

async function ensureIndex(pool, table, indexName, colsDDL) {
  const ok = await existsIndex(pool, table, indexName);
  if (ok) return false;
  await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${colsDDL})`);
  return true;
}

async function main() {
  const url = getUrl();
  if (!url) {
    console.error("EWF_TEST_MYSQL_URL or EWF_MYSQL_URL is required");
    process.exit(1);
  }

  const schemaPath = path.resolve("sql/mysql_schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error("schema not found:", schemaPath);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const stmts = splitSql(schemaSql);

  const pool = await mysql.createPool(url);

  try {
    // 1) apply base schema (text protocol)
    for (const stmt of stmts) {
      await pool.query(stmt);
    }

    // 2) idempotent upgrades (for existing DB)
    let upgraded = 0;

    upgraded += (await ensureColumn(pool, "workflow_versions", "draft_sha256", "VARCHAR(64) NULL")) ? 1 : 0;
    upgraded += (await ensureColumn(pool, "workflow_versions", "ir_sha256", "VARCHAR(64) NULL")) ? 1 : 0;

    // index depends on columns; safe to run after ensureColumn
    upgraded += (await ensureIndex(pool, "workflow_versions", "idx_wf_draft_sha", "`workflow_id`, `draft_sha256`")) ? 1 : 0;

    console.log(`mysql-init ok: ${stmts.length} statements applied, upgrades=${upgraded}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("mysql-init failed:", e?.message || e);
  process.exit(1);
});
