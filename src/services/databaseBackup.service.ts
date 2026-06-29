import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export type DatabaseBackupInfo = {
    databaseName: string;
    host: string;
    port: string;
    backupFormat: string;
    pgDumpCommand: string;
};

export type DatabaseBackupResult = {
    filePath: string;
    fileName: string;
    cleanup: () => Promise<void>;
};

function getDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not configured.");
    }

    return databaseUrl;
}

function getPgDumpCommand(): string {
    return process.env.PG_DUMP_PATH || "pg_dump";
}

function parseDatabaseUrl(databaseUrl: string): URL | null {
    try {
        return new URL(databaseUrl);
    } catch (error) {
        return null;
    }
}

function getTimestampForFileName(): string {
    return new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

export function getDatabaseBackupInfo(): DatabaseBackupInfo {
    const databaseUrl = getDatabaseUrl();
    const parsed = parseDatabaseUrl(databaseUrl);

    return {
        databaseName: parsed ? parsed.pathname.replace(/^\//, "") || "PostgreSQL" : "PostgreSQL",
        host: parsed ? parsed.hostname || "" : "",
        port: parsed ? parsed.port || "default" : "",
        backupFormat: "PostgreSQL custom dump (.dump)",
        pgDumpCommand: getPgDumpCommand()
    };
}

function runPgDump(databaseUrl: string, outputFilePath: string): Promise<void> {
    const pgDumpCommand = getPgDumpCommand();
    const args = [
        "--dbname",
        databaseUrl,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        outputFilePath
    ];

    return new Promise(function (resolve, reject) {
        const child = spawn(pgDumpCommand, args, {
            windowsHide: true
        });

        let stderr = "";

        child.stderr.on("data", function (chunk) {
            stderr += chunk.toString();
        });

        child.on("error", function (error) {
            reject(new Error(`Unable to start pg_dump. Make sure PostgreSQL client tools are installed and pg_dump is on PATH, or set PG_DUMP_PATH. ${error.message}`));
        });

        child.on("close", function (code) {
            if (code === 0) {
                resolve();
                return;
            }

            const details = stderr.trim() || `pg_dump exited with code ${code}.`;
            reject(new Error(`Database backup failed: ${details}`));
        });
    });
}

export async function createPostgresBackup(): Promise<DatabaseBackupResult> {
    const databaseUrl = getDatabaseUrl();
    const databaseInfo = getDatabaseBackupInfo();
    const safeDatabaseName = (databaseInfo.databaseName || "database")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/^_+|_+$/g, "") || "database";
    const backupDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pour-over-db-backup-"));
    const fileName = `${safeDatabaseName}-${getTimestampForFileName()}.dump`;
    const filePath = path.join(backupDirectory, fileName);

    try {
        await runPgDump(databaseUrl, filePath);
    } catch (error) {
        await fs.rm(backupDirectory, {
            recursive: true,
            force: true
        });

        throw error;
    }

    return {
        filePath: filePath,
        fileName: fileName,
        cleanup: async function () {
            await fs.rm(backupDirectory, {
                recursive: true,
                force: true
            });
        }
    };
}
