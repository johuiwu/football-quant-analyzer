const path = require("path");

module.exports = {
  development: {
    client: "sqlite3",
    connection: {
      filename: path.join(__dirname, "database", "football_data.db"),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "migrations"),
      extension: "cjs",
    },
  },
  production: {
    client: "sqlite3",
    connection: {
      filename: process.env.DATABASE_PATH || path.join(__dirname, "database", "football_data.db"),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "migrations"),
      extension: "cjs",
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.run("PRAGMA journal_mode=WAL;", cb);
      },
    },
  },
};
