"""Validate a GitHub release against its branch, app metadata and scoped ACR digests."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def validate(manifest, tag, environment, registry, package, build_info):
    target, branch = {"production": ("prod", "main"), "staging": ("stg", "develop")}[environment]
    version = tag.removeprefix("v")
    suffix = r"-develop\.[1-9][0-9]*" if target == "stg" else ""
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" + suffix, version):
        raise ValueError("Version does not match deployment environment")
    expected = {"schema": 1, "version": version, "tag": tag, "branch": branch,
                "target": target, "environment": environment, "application_repository": "kobchocen/mcvv"}
    if any(manifest.get(key) != value for key, value in expected.items()):
        raise ValueError("Release identity mismatch")
    if package.get("version") != version or build_info != {
        "version": version, "buildNumber": manifest.get("buildNumber"), "revision": manifest.get("revision")
    }:
        raise ValueError("Release metadata does not match tagged application sources")
    if not re.fullmatch(r"[a-f0-9]{40}", str(manifest.get("revision", ""))):
        raise ValueError("Invalid source commit")
    if not re.fullmatch(r"[1-9][0-9]*\.[1-9][0-9]*", str(manifest.get("buildNumber", ""))):
        raise ValueError("Invalid build number")
    for kind in ("web", "migration"):
        if not re.fullmatch(re.escape(f"{registry}.azurecr.io/{kind}/{target}@") + r"sha256:[a-f0-9]{64}", manifest.get(kind, "")):
            raise ValueError("Image is outside the environment's immutable ACR repository")
    return {"target": target, "web": manifest["web"], "migration": manifest["migration"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", required=True)
    parser.add_argument("--environment", choices=("production", "staging"), required=True)
    args = parser.parse_args()
    app = Path(os.environ.get("APP_SOURCE_PATH", ".local/application"))
    directory = Path(".local/release")
    data = (directory / "release.json").read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    entries = (directory / "SHA256SUMS").read_text().splitlines()
    if entries.count(f"{checksum}  release.json") != 1:
        raise ValueError("Release manifest checksum mismatch")
    manifest = json.loads(data)
    output = validate(manifest, args.tag, args.environment, os.environ["ACR_NAME"],
                      json.loads((app / "package.json").read_text()),
                      json.loads((app / "src/lib/build-info.json").read_text()))
    def git(*arguments):
        return subprocess.check_output(["git", "-C", str(app), *arguments], text=True).strip()
    if git("rev-parse", "HEAD") != git("rev-parse", f"refs/tags/{args.tag}^{{commit}}"):
        raise ValueError("Release is no longer the current application branch head")
    if git("rev-parse", "HEAD^") != manifest["revision"]:
        raise ValueError("Tagged release commit does not descend from the recorded build source")
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        for key, value in output.items():
            stream.write(f"{key}={value}\n")
    print(f"Verified {args.tag} build {manifest['buildNumber']} for {args.environment}")


if __name__ == "__main__":
    main()
