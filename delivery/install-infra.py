from pathlib import Path
import shutil
import argparse
parser = argparse.ArgumentParser(description="Install the MCVV release contract into an infrastructure checkout")
parser.add_argument("--target", type=Path, required=True)
args = parser.parse_args()
app = Path(__file__).resolve().parents[1]
infra = args.target.resolve()
if not (infra / "scripts/platform.py").is_file():
    raise SystemExit("Target is not the expected infrastructure checkout")
for name, target in [('deploy-release.yml', '.github/workflows/deploy-release.yml'), ('release-source.py', 'scripts/release-source.py'), ('test_release_source.py', 'tests/test_release_source.py')]:
    shutil.copy2(app / 'delivery/infra' / name, infra / target)
p = infra / 'Dockerfile'
s = p.read_text()
if 'ca-certificates openssl' not in s:
    s = s.replace('RUN npm install --global corepack@0.34.0', 'RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \\\n    && rm -rf /var/lib/apt/lists/*\nRUN npm install --global corepack@0.34.0')
s = s.replace('RUN bash /usr/local/bin/package-manager test\n', '# Application CI gates publication before this production build.\n')
p.write_text(s)
p = infra / 'scripts/build-context.py'
s = p.read_text()
if '"dist", "build", "out", "delivery", "docs", "*.tsbuildinfo",' not in s:
    s = s.replace('"coverage", ".pnpm-store", ".yarn-cache", "__pycache__",', '"coverage", ".pnpm-store", ".yarn-cache", "__pycache__",\n    "dist", "build", "out", "delivery", "docs", "*.tsbuildinfo",')
s = s.replace('    if root == source or root.is_relative_to(source):\n        raise ValueError("Application source must not contain the infrastructure repository.")', '    # GitHub checks out infrastructure under app/.local/infra; .local is never copied.\n    if root == source or (root.is_relative_to(source) and\n            root.relative_to(source).parts[0] != ".local"):\n        raise ValueError("Nested infrastructure checkout must be inside excluded .local/.")')
p.write_text(s)
p = infra / 'tests/test_application_delivery.py'
s = p.read_text().replace('(".git", "secrets", "node_modules", ".next")', '(".git", "secrets", "node_modules", ".next", "dist", "delivery", "docs")')
marker = '    def test_application_check_uses_configured_path_from_any_working_directory(self):'
addition = '''    def test_nested_infrastructure_is_only_allowed_in_excluded_local_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            (app / "package.json").write_text("{}")
            for directory, allowed in ((".local/infra", True), ("infra", False)):
                infra = app / directory
                (infra / "scripts").mkdir(parents=True)
                (infra / "runtime").mkdir()
                for name in ("Dockerfile", ".dockerignore", "scripts/package-manager.sh", "scripts/migrate.sh", "runtime/gateway.mjs"):
                    (infra / name).write_text("fixture")
                if allowed:
                    result = context.prepare(infra, app)
                    self.assertFalse((result / "app/.local").exists())
                else:
                    with self.assertRaises(ValueError):
                        context.prepare(infra, app)

'''
if 'def test_nested_infrastructure_' not in s:
    s = s.replace(marker, addition + marker)
p.write_text(s)
shutil.copy2(app / 'docs/APPLICATION-DELIVERY.md', infra / 'docs/SEMANTIC-RELEASE.md')
shutil.copy2(app / 'docs/DELIVERY-VALIDATION.md', infra / 'docs/DELIVERY-VALIDATION.md')
p = infra / 'docs/APPLICATION-DELIVERY.md'
s = p.read_text()
notice = '> Automatické verzované vydávání MCVV nyní používá `deploy-release.yml` a hotové ACR digesty. Nastavení a postup jsou v [SEMANTIC-RELEASE.md](SEMANTIC-RELEASE.md). Níže uvedený dispatch podle SHA zůstává pouze pro původní ruční provozní workflow.\n\n'
if 'SEMANTIC-RELEASE.md' not in s:
    p.write_text(notice + s)
print('Installed release workflow/validator/tests and patched infrastructure build contract. Audit flags unchanged.')
