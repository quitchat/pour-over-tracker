declare module "connect-pg-simple" {
    import session from "express-session";

    interface PgSessionOptions {
        conString?: string;
        tableName?: string;
        schemaName?: string;
        ttl?: number;
        pruneSessionInterval?: number | false;
        createTableIfMissing?: boolean;
    }

    function connectPgSimple(expressSession: typeof session): {
        new(options?: PgSessionOptions): session.Store;
    };

    export default connectPgSimple;
}
