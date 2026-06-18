import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '..', 'database');
const SRC_DB = path.join(DB_DIR, 'worldcup.db');
const DST_DB = path.join(DB_DIR, 'football_data.db');

const SKIP_TABLES = new Set(['sqlite_sequence']);

function openDb(filepath, mode) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filepath, mode, (err) => {
            if (err) reject(err); else resolve(db);
        });
    });
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function dbClose(db) {
    return new Promise((resolve) => { db.close(() => resolve()); });
}

async function main() {
    console.log('=== worldcup.db -> football_data.db Migration ===\n');
    console.log('Source:', SRC_DB);
    console.log('Target:', DST_DB, '\n');

    const srcDb = await openDb(SRC_DB, sqlite3.OPEN_READONLY);
    const dstDb = await openDb(DST_DB, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

    await dbRun(dstDb, 'PRAGMA journal_mode=WAL');

    const tables = await dbAll(srcDb, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const userTables = tables.filter(t => !SKIP_TABLES.has(t.name));

    console.log('Source tables:', userTables.length);
    let totalMigrated = 0;

    for (const tableObj of userTables) {
        const tableName = tableObj.name;
        try {
            const columns = await dbAll(srcDb, 'PRAGMA table_info([' + tableName + '])');
            const colDefs = columns.map(c => {
                const pk = c.pk ? ' PRIMARY KEY' : '';
                const notNull = c.notnull && !c.pk ? ' NOT NULL' : '';
                const defaultVal = c.dflt_value ? ' DEFAULT ' + c.dflt_value : '';
                return '[' + c.name + '] ' + (c.type || 'TEXT') + pk + notNull + defaultVal;
            }).join(',\n    ');

            const newTableName = 'worldcup_' + tableName;

            const createSQL = 'CREATE TABLE IF NOT EXISTS [' + newTableName + '] (\n    ' + colDefs + '\n)';
            await dbRun(dstDb, createSQL);

            const countResult = await dbAll(srcDb, 'SELECT COUNT(*) as cnt FROM [' + tableName + ']');
            const srcCount = countResult[0].cnt;

            const rows = await dbAll(srcDb, 'SELECT * FROM [' + tableName + ']');

            if (rows.length === 0) {
                console.log('  ' + newTableName + ': 0 rows (empty), skipped');
                continue;
            }

            const colNames = columns.map(c => '[' + c.name + ']').join(', ');
            const placeholders = columns.map(() => '?').join(', ');
            const insertSQL = 'INSERT OR IGNORE INTO [' + newTableName + '] (' + colNames + ') VALUES (' + placeholders + ')';

            let inserted = 0;
            for (const row of rows) {
                try {
                    const values = columns.map(c => row[c.name]);
                    await dbRun(dstDb, insertSQL, values);
                    inserted++;
                } catch (err) {
                    if (err.code !== 'SQLITE_CONSTRAINT') {
                        console.error('    ERROR:', err.message);
                    }
                }
            }

            console.log('  ' + newTableName + ': ' + inserted + '/' + srcCount + ' rows migrated');
            totalMigrated += inserted;

        } catch (err) {
            console.error('  FAILED ' + tableName + ':', err.message);
        }
    }

    await dbClose(srcDb);
    await dbClose(dstDb);

    console.log('\n=== Migration Complete: ' + totalMigrated + ' total rows across ' + userTables.length + ' tables ===');
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
