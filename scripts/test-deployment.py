"""Exercise the real Docker images against isolated MySQL 8.4 with verified TLS."""
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]


def run(*args, expected=0, timeout=600):
    result = subprocess.run(args, cwd=ROOT, timeout=timeout, check=False)
    if (result.returncode == 0) != (expected == 0):
        raise RuntimeError(f"Unexpected exit status for {args[0]}: {result.returncode}")


def main():
    run("docker", "version", timeout=15)
    prefix = "mcvv-test-" + uuid.uuid4().hex[:12]
    database, web = prefix + "-db", prefix + "-web"
    network, volume = prefix + "-net", prefix + "-data"
    migration_image, web_image = prefix + ":migration", prefix + ":web"
    with tempfile.TemporaryDirectory(prefix="mcvv-tls-") as directory:
        certs = Path(directory) / "certs"
        certs.mkdir(mode=0o755)
        run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=MCVV Integration CA", "-keyout", str(certs / "ca.key"),
            "-out", str(certs / "ca.crt"))
        run("openssl", "req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=mysql.test",
            "-keyout", str(certs / "server.key"), "-out", str(certs / "server.csr"))
        (certs / "extensions.cnf").write_text("subjectAltName=DNS:mysql.test\nextendedKeyUsage=serverAuth\n")
        run("openssl", "x509", "-req", "-days", "1", "-in", str(certs / "server.csr"),
            "-CA", str(certs / "ca.crt"), "-CAkey", str(certs / "ca.key"), "-CAcreateserial",
            "-extfile", str(certs / "extensions.cnf"), "-out", str(certs / "server.crt"))
        # Ephemeral test keys only; the non-root MySQL process must read its key.
        (certs / "server.key").chmod(0o644)
        mount = f"{certs}:/test-certs:ro"
        url = "mysql://mcvv:test-password@mysql.test:3306/mcvv_delivery_test"

        def database_start():
            run("docker", "run", "-d", "--name", database, "--network", network,
                "--network-alias", "mysql.test", "--network-alias", "wrong.test",
                "-v", f"{volume}:/var/lib/mysql", "-v", mount,
                "-e", "MYSQL_ROOT_PASSWORD=test-root", "-e", "MYSQL_USER=mcvv",
                "-e", "MYSQL_PASSWORD=test-password", "-e", "MYSQL_DATABASE=mcvv_delivery_test",
                "mysql:8.4", "--require-secure-transport=ON", "--ssl-ca=/test-certs/ca.crt",
                "--ssl-cert=/test-certs/server.crt", "--ssl-key=/test-certs/server.key",
                "--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci")
            for _ in range(90):
                result = subprocess.run(
                    ["docker", "exec", database, "mysql", "--protocol=TCP", "-hmysql.test",
                     "-umcvv", "-ptest-password", "--ssl-mode=VERIFY_IDENTITY",
                     "--ssl-ca=/test-certs/ca.crt", "-e", "SELECT 1"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False,
                )
                if result.returncode == 0:
                    return
                time.sleep(1)
            raise RuntimeError("MySQL did not become ready")

        def command(script, *args, connection=url, ca=True, expected=0):
            settings = ["-e", f"DATABASE_URL={connection}"]
            if ca:
                settings += ["-e", "DATABASE_SSL_CA=/test-certs/ca.crt"]
            run("docker", "run", "--rm", "--network", network, "-v", mount, *settings,
                migration_image, "node", "--import", "tsx", f"scripts/{script}.ts", *args,
                expected=expected)

        def probe(path, status, body=None):
            expression = (
                f'fetch("http://127.0.0.1:3000/{path}").then(async r => {{'
                f'if(r.status !== {status}) process.exit(1);'
                + (f'if(await r.text() !== "{body}") process.exit(1);' if body else "")
                + '}).catch(() => process.exit(1))'
            )
            run("docker", "exec", web, "node", "-e", expression, timeout=15)

        try:
            run("docker", "build", "--target", "migration", "-t", migration_image, ".")
            run("docker", "build", "--target", "runner", "-t", web_image, ".")
            run("docker", "network", "create", network)
            run("docker", "volume", "create", volume)
            database_start()
            command("db-check", expected=1)  # Empty schema is not ready.
            command("db-migrate")
            command("db-migrate")  # Deployment migrations must be idempotent.
            command("db-check")
            command("db-check", connection=url.replace("mysql.test", "wrong.test"), expected=1)
            command("db-check", ca=False, expected=1)  # The test CA is not publicly trusted.
            command("db-migrate", connection=url.replace("mysql.test", "wrong.test"), expected=1)
            command("db-migrate", ca=False, expected=1)
            command("integration-fixture", "write")
            run("docker", "rm", "-f", database)
            database_start()  # A new database container must retain the same rows and image bytes.
            command("db-check")
            command("integration-fixture", "read")
            run("docker", "run", "-d", "--name", web, "--network", network, "-v", mount,
                "-e", f"DATABASE_URL={url}", "-e", "DATABASE_SSL_CA=/test-certs/ca.crt", web_image)
            for _ in range(30):
                result = subprocess.run(
                    ["docker", "exec", web, "node", "-e",
                     'fetch("http://127.0.0.1:3000/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False,
                )
                if result.returncode == 0:
                    break
                time.sleep(1)
            probe("healthz", 200, "ok")
            probe("readyz", 200)
            run("docker", "stop", database)
            probe("healthz", 200, "ok")
            probe("readyz", 503)
            print("PASS: Docker, MySQL/TLS, migrations, schema, persistence and health probes")
        finally:
            for arguments in [
                ["rm", "-f", web, database], ["volume", "rm", volume],
                ["network", "rm", network], ["image", "rm", migration_image, web_image],
            ]:
                subprocess.run(["docker", *arguments], check=False, timeout=60,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
