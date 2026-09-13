#!/usr/bin/env bash
#
# One-off: takes a name out of the git history, metadata and contents both.
#
# Removing a name from the working tree is not enough. Every commit carries its
# author and committer name in its metadata, and older commits still hold the
# file contents as they were. Both are rewritten here, so every commit gets a
# new hash. That is safe while this repository has no remote and nobody has
# cloned it; once either is true, stop and think first.
#
#   bash scripts/rewrite-history.sh --yes "Old Name" ["Other Spelling" ...]
#
# The names to erase are arguments rather than settings in this file, so that
# the script itself never becomes the last place the name is written down.
# Every commit is reattributed to the identity below regardless.
#
# A bundle of the current state is written next to the repository before
# anything changes. To get back:
#
#   git clone ../pixygoat-before-rewrite-<timestamp>.bundle recovered
#
# Delete this script once it has done its job.

set -euo pipefail

NEW_NAME="Fossel"
NEW_EMAIL="finnsgames2020@gmail.com"

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
    echo "Usage: bash scripts/rewrite-history.sh --yes [\"Old Name\" ...]"
    echo
    echo "Rewrites every commit in $(pwd): author and committer become"
    echo "$NEW_NAME <$NEW_EMAIL>, each name given is replaced in file contents,"
    echo "and all commit hashes change."
    exit 1
fi
shift

old_names=("$@")

if [ -n "$(git status --porcelain)" ]; then
    echo "The working tree has uncommitted changes. Commit or stash them first." >&2
    exit 1
fi

if [ -n "$(git remote)" ]; then
    echo "This repository has a remote. A rewrite here means a force push and" >&2
    echo "broken clones for anyone who already pulled. Remove the remote, or" >&2
    echo "delete this check once you have thought it through." >&2
    exit 1
fi

backup="../pixygoat-before-rewrite-$(date +%Y%m%d-%H%M%S).bundle"
git bundle create "$backup" --all
echo "Backup written: $backup"
echo

# One sed program for every spelling, with the characters sed reads as syntax
# escaped, so a name containing a slash or an ampersand does not turn into one.
sed_program=""
replacements="$(mktemp)"
trap 'rm -f "$replacements"' EXIT

for old in "${old_names[@]}"; do
    printf '%s==>%s\n' "$old" "$NEW_NAME" >>"$replacements"
    escaped_old="$(printf '%s' "$old" | sed 's/[\/&.*[]/\\&/g')"
    escaped_new="$(printf '%s' "$NEW_NAME" | sed 's/[\/&]/\\&/g')"
    sed_program="${sed_program}s/${escaped_old}/${escaped_new}/g; "
done

if git filter-repo --version >/dev/null 2>&1; then
    echo "Rewriting with git-filter-repo."
    args=(--force
          --name-callback "return b\"$NEW_NAME\""
          --email-callback "return b\"$NEW_EMAIL\"")
    [ ${#old_names[@]} -gt 0 ] && args+=(--replace-text "$replacements")
    git filter-repo "${args[@]}"
else
    echo "git-filter-repo is not installed; using git filter-branch instead."
    echo "(The faster, better supported route: pip install git-filter-repo, then start over.)"
    echo

    tree_filter="true"
    if [ -n "$sed_program" ]; then
        # -I skips binary files, so no image gets a byte rewritten by accident.
        tree_filter="grep -rlIZ --exclude-dir=.git $(printf -- '-e %q ' "${old_names[@]}") . 2>/dev/null | xargs -0 -r sed -i '${sed_program}' ; true"
    fi

    FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
        --env-filter "
            export GIT_AUTHOR_NAME='$NEW_NAME'
            export GIT_AUTHOR_EMAIL='$NEW_EMAIL'
            export GIT_COMMITTER_NAME='$NEW_NAME'
            export GIT_COMMITTER_EMAIL='$NEW_EMAIL'
        " \
        --tree-filter "$tree_filter" \
        --tag-name-filter cat -- --all

    git for-each-ref --format='%(refname)' refs/original |
        while read -r ref; do git update-ref -d "$ref"; done
fi

# Future commits, so the old identity does not walk back in.
git config user.name "$NEW_NAME"
git config user.email "$NEW_EMAIL"

git reflog expire --expire=now --all
git gc --prune=now

echo
echo "--- identities in the rewritten history:"
git log --format='%an <%ae> | %cn <%ce>' | sort -u

for old in "${old_names[@]}"; do
    echo
    echo "--- commits still carrying \"$old\" in a file:"
    git log --oneline -S"$old" --all || true
    echo "(nothing listed above means the contents are clean)"
done
