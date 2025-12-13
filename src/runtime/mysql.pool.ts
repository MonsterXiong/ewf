import mysql from "mysql2/promise";

export function createMySqlPoolFromEnv() {
  // 推荐：EWF_MYSQL_URL="mysql://admin:123456@127.0.0.1:3306/ewf"
  const url = process.env.EWF_MYSQL_URL;
  if (url) return mysql.createPool(url);

  // 默认回落：你指定的标准
  const host = process.env.EWF_MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.EWF_MYSQL_PORT || "3306");
  const user = process.env.EWF_MYSQL_USER || "admin";
  const password = process.env.EWF_MYSQL_PASSWORD || "123456";
  const database = process.env.EWF_MYSQL_DATABASE || "ewf";

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 10,
  });
}
