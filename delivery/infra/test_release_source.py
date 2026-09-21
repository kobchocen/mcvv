import copy
import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).with_name("release-source.py")
if not source.exists():
    source = Path(__file__).resolve().parents[1] / "scripts/release-source.py"
spec = importlib.util.spec_from_file_location("release_source", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseSourceTests(unittest.TestCase):
    def setUp(self):
        self.info = {"version": "1.2.3", "buildNumber": "42.1", "revision": "a" * 40}
        self.manifest = {
            "schema": 1, **self.info, "tag": "v1.2.3", "branch": "main", "target": "prod",
            "environment": "production", "application_repository": "kobchocen/mcvv",
            "web": "registry.azurecr.io/web/prod@sha256:" + "b" * 64,
            "migration": "registry.azurecr.io/migration/prod@sha256:" + "c" * 64,
        }

    def validate(self, manifest):
        return module.validate(manifest, "v1.2.3", "production", "registry", {"version": "1.2.3"}, self.info)

    def test_accepts_exact_release_identity(self):
        self.assertEqual(self.validate(self.manifest)["target"], "prod")

    def test_rejects_cross_environment_mutable_images_and_mismatched_sources(self):
        for key, value in {
            "web": "registry.azurecr.io/web/stg@sha256:" + "b" * 64,
            "migration": "registry.azurecr.io/migration/prod:latest",
            "branch": "develop", "buildNumber": "43.1", "revision": "d" * 40,
            "application_repository": "other/repository", "tag": "v2.0.0",
        }.items():
            with self.subTest(key=key):
                manifest = copy.deepcopy(self.manifest)
                manifest[key] = value
                with self.assertRaises(ValueError):
                    self.validate(manifest)

    def test_rejects_prerelease_in_production(self):
        with self.assertRaises(ValueError):
            module.validate(self.manifest, "v1.2.3-develop.1", "production", "registry", {}, {})


if __name__ == "__main__":
    unittest.main()
