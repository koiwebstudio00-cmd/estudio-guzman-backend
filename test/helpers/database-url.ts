const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);

export function requireSafeTestDatabaseUrl(
  value: string | undefined,
  runtimeValue = process.env.DATABASE_URL
): string {
  if (!value) {
    throw new Error(
      "DATABASE_URL_TEST es obligatoria para integración; los tests no se omiten sin una DB exclusiva."
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL_TEST no es una URL PostgreSQL válida.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL_TEST debe usar postgresql:// o postgres://.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || SYSTEM_DATABASES.has(databaseName)) {
    throw new Error("DATABASE_URL_TEST no puede apuntar a una base de sistema.");
  }
  if (!/(^|[_-])tests?($|[_-])/i.test(databaseName)) {
    throw new Error("El nombre de DATABASE_URL_TEST debe incluir el segmento `test`.");
  }

  if (!LOCAL_HOSTS.has(url.hostname) && process.env.ALLOW_REMOTE_TEST_DATABASE !== "true") {
    throw new Error(
      "DATABASE_URL_TEST debe ser local; ALLOW_REMOTE_TEST_DATABASE=true habilita CI remoto explícito."
    );
  }

  if (runtimeValue) {
    const runtimeUrl = new URL(runtimeValue);
    const sameTarget =
      runtimeUrl.hostname === url.hostname &&
      (runtimeUrl.port || "5432") === (url.port || "5432") &&
      runtimeUrl.pathname === url.pathname;
    if (sameTarget) {
      throw new Error("DATABASE_URL_TEST debe ser distinta de DATABASE_URL.");
    }
  }

  return value;
}
