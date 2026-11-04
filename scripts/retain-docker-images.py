#!/usr/bin/env python3
"""Keep the newest N unique images per explicit repository on the VPS.
Never removes containers, volumes, build cache, registry versions, or image IDs
referenced by ANY container. Uses no force; Docker rechecks container safety.
"""
import argparse
import json
import re
import subprocess


def removable_tags(images, repository, protected, keep):
    unique = {image['Id']: image for image in images}
    newest = sorted(unique.values(), key=lambda image: image['Created'], reverse=True)
    retained = {image['Id'] for image in newest[:keep]} | set(protected)
    for image in newest:
        if any(tag in (repository + ':rollback', repository + ':previous') for tag in image.get('RepoTags') or []):
            retained.add(image['Id'])
    return [tag for image in reversed(newest) if image['Id'] not in retained
            for tag in image.get('RepoTags') or [] if tag.startswith(repository + ':')]


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('repositories', nargs='+')
    args = parser.parse_args()
    if args.keep < 1 or any(not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._/-]*', repo) for repo in args.repositories):
        parser.error('Use positive keep count and explicit repositories without tags or wildcards')
    containers = docker('ps', '-aq').splitlines()
    protected = {item['Image'] for item in json.loads(docker('container', 'inspect', *containers))} if containers else set()
    for repository in args.repositories:
        ids = list(set(docker('image', 'ls', '--no-trunc', '--quiet', repository).splitlines()))
        if not ids:
            continue
        images = json.loads(docker('image', 'inspect', *ids))
        # Only exact repository matches; docker's repository filter can be broader.
        images = [image for image in images if any(tag.startswith(repository + ':') for tag in image.get('RepoTags') or [])]
        tags = removable_tags(images, repository, protected, args.keep)
        print(f'{repository}: keep newest {args.keep} image IDs plus container/rollback references; remove {len(tags)} obsolete tags')
        for tag in tags:
            if args.dry_run:
                print('Would remove', tag)
            else:
                # No --force: a new container reference can veto deletion after planning.
                subprocess.run(['docker', 'image', 'rm', tag], check=True)


if __name__ == '__main__':
    main()
