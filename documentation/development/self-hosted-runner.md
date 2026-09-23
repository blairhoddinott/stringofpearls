# Local GitHub Actions runner

String of Pearls runs GitHub Actions only on a repository-scoped self-hosted runner. The supported runner host is a dedicated or disposable x86_64 Debian 13 server with Docker Engine and the Compose plugin.

The runner container is built from repository-owned files. It uses the digest-pinned Node 24 image, GitHub Actions runner `2.337.0` verified against GitHub's published SHA-256 checksum, and Docker CLI/Compose copied from a digest-pinned official Docker image. No third-party runner image is used.

## Trust model

The workflow intentionally accepts work only when both `github.actor` and `github.triggering_actor` are `blairhoddinott`:

- pushes to non-`master` branches run the fast branch checks;
- pull requests targeting `master` from `blairhoddinott` branches in this repository run the full acceptance suite;
- manual dispatches run the full acceptance suite on the selected ref;
- pushes and merges to `master` do not repeat acceptance; a separate release coordinator runs only after an owner merge;
- events initiated or re-run by any other account are skipped before a job is assigned;
- no GitHub-hosted runner label or fallback exists;
- `pull_request` execution is limited to same-repository PRs owned by `blairhoddinott`;
- no `pull_request_target` workflow or external contributor code runs on the local runner.

The actor check is deliberate for re-runs: GitHub distinguishes the account that triggered the original run from the account that initiated a re-run. Both must match.

The general container receives the host Docker socket because repository acceptance includes production-container and browser smoke tests. Access to that socket is effectively administrative access to the host. It also uses host networking so the runner can reach random loopback ports published by the production-container smoke test. Do not run this configuration on a server containing unrelated workloads, credentials, or valuable data.

Release signing uses a second, separately registered runner on a **different host or Docker daemon that the ordinary CI runner cannot access**, with the custom `stringofpearls-release` label. Deploy it from `compose.release.yaml`; it deliberately has no Docker socket. Only that isolated host mounts the dedicated OpenPGP keyring volume. The key makes that runner capable of producing trusted repository history: treat its state, work, host, and keyring volumes as privileged credentials, never route pull-request jobs to it, and never approve external code for it.

## 1. Install Docker on Debian 13

If Docker Engine and the Compose plugin are already installed, skip to the verification commands. Otherwise, use Docker's official Debian repository:

```sh
sudo apt update
sudo apt install --yes ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl --fail --silent --show-error --location \
  https://download.docker.com/linux/debian/gpg \
  --output /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install --yes \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod --append --groups docker "$USER"
```

Log out and back in after changing group membership. Membership in the `docker` group grants root-equivalent control of this dedicated host; do not grant it to untrusted accounts.

Verify the host:

```sh
dpkg --print-architecture
docker --version
docker info
docker compose version
```

The architecture must report `amd64`. The login account uses its `docker` group membership to run the host CLI. The runner container separately receives the socket's numeric group ID through Compose so its non-root `node` user can reach the same daemon.

## 2. Clone the repository

Choose a stable directory on the server:

```sh
sudo install --directory --owner "$USER" --group "$(id -gn)" /opt/stringofpearls-runner
git clone https://github.com/blairhoddinott/stringofpearls.git /opt/stringofpearls-runner/repository
cd /opt/stringofpearls-runner/repository/infrastructure/github-runner
```

Create a local Compose environment file containing only non-secret host configuration:

```sh
printf 'DOCKER_GID=%s\nRUNNER_NAME=%s\n' \
  "$(stat --format='%g' /var/run/docker.sock)" \
  "stringofpearls-debian" \
  > .env
```

The repository ignores this `.env` file. Never add a registration token, personal access token, or runner credential to it.

## 3. Build the runner image

```sh
docker compose build --pull runner
```

The build fails if the downloaded GitHub runner archive does not match its pinned checksum.

## 4. Create the repository runner in GitHub

1. Open `https://github.com/blairhoddinott/stringofpearls/settings/actions/runners`.
2. Select **New self-hosted runner**.
3. Select **Linux** and **x64**.
4. Copy only the time-limited registration token shown by GitHub. Registration tokens expire after one hour.
5. In the server shell, read the token without writing it to history or disk:

```sh
read -r -s -p 'GitHub runner registration token: ' REGISTRATION_TOKEN
printf '\n'
REGISTRATION_TOKEN="${REGISTRATION_TOKEN}" \
  docker compose run --rm --env REGISTRATION_TOKEN runner configure
unset REGISTRATION_TOKEN
```

The transient registration container is removed when configuration completes. Persistent runner credentials are stored in the `runner-state` Docker volume, not in the image, repository, Compose file, or ordinary container environment.

## 5. Start and verify the runner

```sh
docker compose up --detach runner
docker compose ps
docker compose logs --follow --tail 100 runner
```

A healthy startup reports that it is connected and listening for jobs. In GitHub, the runner should appear **Idle** with the default `self-hosted`, `Linux`, and `X64` labels plus `stringofpearls-ci`.

No inbound firewall rule or published runner port is required. The runner initiates outbound HTTPS connections to GitHub on port 443. Its host-network access exists only so repository smoke tests can reach containers that publish ephemeral ports on host loopback.

## 6. Enable and test the workflow

The push workflow at `.github/workflows/local-ci.yml` and the pull-request workflow at `.github/workflows/local-master-acceptance.yml` route every executing job to:

```yaml
runs-on: [self-hosted, linux, x64, stringofpearls-ci]
```

Push a commit as `blairhoddinott` to a non-`master` branch. The **Branch checks** job should run on `stringofpearls-debian`. It installs the exact npm lockfile and runs workflow-policy, Dockerfile, whitespace, lint, strict-contract, and deterministic-build checks.

Opening or updating a pull request from one of those branches into `master` starts **Master acceptance** against GitHub's proposed merge commit. A manual **Run workflow** action also starts it on the selected ref. That job adds coverage, browser-free validation, aviation validation, deterministic build and server contracts, the production dependency audit, production-container smoke, and browser acceptance. Merging the pull request does not run the suite again.

Manual re-runs and same-repository pull-request events initiated by any account other than `blairhoddinott` are skipped by design. GitHub is configured to require approval for workflows from every external contributor; do not approve those workflows onto this privileged runner. GitHub treats a conditionally skipped job as successful after approval, so external merge handling is a procedural policy rather than enforcement by this ruleset. External contributions require the separate contributor process before CI execution or merge.

## 7. Configure the privileged release runner

This section is required only for automated release preparation and publication. Complete it after the release workflow has merged to `master`; until then, the repository-owned release tooling is available only for local checks.

### Create the isolated keyring

On the isolated release host, first make the required deployment acknowledgement. Set this only after proving that the general CI runner cannot reach this host or Docker daemon:

```sh
export RELEASE_RUNNER_ISOLATED_HOST=confirmed-no-general-ci-access
```

The container also refuses to start if a Docker socket is present. These guards do not turn a shared host into an isolated one; they make the operator decision explicit and fail closed on the most dangerous misconfiguration.

Build the image from the dedicated Compose file, then stream Balder's existing secret signing subkey directly from that host's keyring into the named Docker volume. The export is never written to disk:

```sh
docker compose -f compose.release.yaml build --pull release-runner

gpg --batch --export-secret-subkeys \
  55752C968BC2E769D973F65727D0742393C6CAA3 \
  | docker compose -f compose.release.yaml run --rm --no-deps --no-TTY \
      --entrypoint gpg release-runner --batch --import
```

Verify that the release keyring contains the expected primary fingerprint:

```sh
docker compose -f compose.release.yaml run --rm --no-deps \
  --entrypoint gpg release-runner \
  --batch --with-colons --fingerprint --list-secret-keys \
  55752C968BC2E769D973F65727D0742393C6CAA3
```

The output must contain exactly this primary fingerprint:

```text
55752C968BC2E769D973F65727D0742393C6CAA3
```

Before registration, prove unattended signing works inside the isolated volume. This writes only disposable probe files inside the temporary container:

```sh
docker compose -f compose.release.yaml run --rm --no-deps \
  --entrypoint sh release-runner -c '
    set -eu
    printf "%s\n" "release signing probe" > /tmp/probe
    gpg --batch --yes --pinentry-mode error \
      --local-user 55752C968BC2E769D973F65727D0742393C6CAA3 \
      --detach-sign /tmp/probe
    gpg --batch --verify /tmp/probe.sig /tmp/probe
  '
```

If this asks for a passphrase or fails under `--pinentry-mode error`, stop. Do not put a passphrase or exported key in Compose, workflow YAML, `.env`, an Actions secret, or shell history. Use a dedicated unattended signing subkey before enabling automation.

### Register the second runner

Create another repository-scoped Linux x64 runner in **Settings → Actions → Runners**. Read its one-hour registration token without persisting it:

```sh
read -r -s -p 'Release runner registration token: ' REGISTRATION_TOKEN
printf '\n'
REGISTRATION_TOKEN="${REGISTRATION_TOKEN}" \
  docker compose -f compose.release.yaml run --rm --no-deps \
    --env REGISTRATION_TOKEN release-runner configure
unset REGISTRATION_TOKEN
```

The runner must appear with `self-hosted`, `Linux`, `X64`, and `stringofpearls-release`. Its credentials live in `release-runner-state`. The ordinary runner cannot reach this host or its `release-gnupg` volume; merely omitting the mount on a shared Docker host is not isolation because the ordinary runner has Docker-socket authority.

### Configure release API authentication

Create a fine-grained personal access token owned by `blairhoddinott`, restricted to this repository, with:

- **Contents: Read and write** for release branches, signed tag publication, and GitHub Releases;
- **Pull requests: Read and write** for release-PR discovery and creation;
- **Metadata: Read**.

Store it as the repository Actions secret `RELEASE_AUTOMATION_TOKEN`. Give it a short expiry and rotate it deliberately. Never place it in `.env`, Compose, Git configuration, a remote URL, command arguments, documentation output, or logs. A personal token is required here because events created by the default workflow token do not trigger the branch and pull-request checks that protect generated release PRs.

Start only the release service and verify it is idle:

```sh
docker compose -f compose.release.yaml up --detach release-runner
docker compose -f compose.release.yaml ps
docker compose -f compose.release.yaml logs --follow --tail 100 release-runner
```

The `local-release` workflow runs after trusted pushes to `master`. It does **not** repeat acceptance. It either prepares a signed `chore/release-vX.Y.Z` pull request or, after that pull request is merged, publishes the locally verified signed tag and matching GitHub Release. The semantic workflow-policy validator pins this routing and rejects any attempt to send pull-request work to the signing runner.

## 8. Protect `master`

In **Settings → Rules → Rulesets**, create a branch ruleset targeting `master`:

- require a pull request before merging;
- block force pushes;
- block branch deletion;
- require signed commits;
- require `Master acceptance`;
- require the branch to be current with `master` before merging;
- configure no bypass actors.

`Branch checks` provides fast advisory feedback on each trusted branch push. It is not a required merge context because push checks attach to the branch-head commit while pull-request checks attach to GitHub's test-merge commit. `Master acceptance` repeats those checks, adds the full acceptance suite on the test-merge commit, and is the sole required status context. GitHub blocks the pull request when it fails and does not run another acceptance job after the merge reaches `master`.

The repository policy validator parses the complete workflow set, rejects duplicate mappings and YAML aliases, compares the canonical workflow semantics with the reviewed policy, and exercises negative mutations for extra workflows or jobs, weakened actor/repository guards, external checkout overrides, hosted runner routes, and unapproved actions.

## Operations

Check status and recent logs:

```sh
cd /opt/stringofpearls-runner/repository/infrastructure/github-runner
docker compose ps
docker compose logs --tail 200 runner
```

Run the corresponding release-runner commands from the checkout on the isolated release host:

```sh
docker compose -f compose.release.yaml ps
docker compose -f compose.release.yaml logs --tail 200 release-runner
```

Restart without re-registering:

```sh
docker compose restart runner
```

Update repository configuration and rebuild:

```sh
git fetch origin
git checkout master
git pull --ff-only origin master
docker compose build --pull runner
docker compose up --detach runner
```

Repeat the checkout update separately on the isolated release host, then run:

```sh
docker compose -f compose.release.yaml build --pull release-runner
docker compose -f compose.release.yaml up --detach release-runner
```

Periodically remove unused build cache and images on the dedicated runner host:

```sh
docker builder prune --filter until=168h
docker image prune --filter until=168h
```

The Compose service rotates its own JSON logs at 10 MiB and retains five files. Review disk usage before pruning; these commands remove only unused cache and images, not active containers or named runner volumes.

The runner is registered with `--disableupdate`; updates are delivered by rebuilding the pinned image. GitHub requires disabled-update runners to be updated within 30 days of a new runner release, and can stop routing jobs to an outdated runner sooner for a critical security update.

To retire the runner:

1. Remove it in **Settings → Actions → Runners**.
2. Stop it and delete its credentials, work directory, and diagnostics. The following command also deletes the release signing keyring if the release profile was configured:

```sh
docker compose down --volumes --remove-orphans
```

Do not delete the volumes before removing the runner in GitHub unless the intent is to abandon that registration.

If retiring only the release runner, first remove that runner in GitHub, then remove its container and four dedicated volumes without touching the ordinary CI runner:

```sh
docker compose -f compose.release.yaml stop release-runner
docker compose -f compose.release.yaml rm --force release-runner
docker volume rm \
  stringofpearls-release-runner_release-runner-state \
  stringofpearls-release-runner_release-runner-work \
  stringofpearls-release-runner_release-runner-diagnostics \
  stringofpearls-release-runner_release-gnupg
```

## References

- [GitHub: Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)
- [GitHub: Adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [GitHub: Self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [GitHub: Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Docker: Install Docker Engine on Debian](https://docs.docker.com/engine/install/debian/)
