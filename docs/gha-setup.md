GitHub Actions setup and upload instructions

This document explains how to publish the local repository to GitHub, enable Actions, and register a self-hosted runner.

Prerequisites
- GitHub account with permission to create repositories under the target owner
- A Personal Access Token (PAT) with at least the following scopes:
  - repo (full control of private repositories or repo:public_repo for public repos)
  - workflow (to create and manage Actions/workflows)
  - admin:org/repo if registering runners under an org (if needed)

Steps to push this repository to GitHub (recommended)
1. On a trusted machine, generate a PAT with the scopes above.
2. On this host, authenticate gh with the PAT:
   echo "YOUR_PAT" | gh auth login --with-token

3. Create the GitHub repo and push:
   cd /home/chris/Documents/usbip
   gh repo create <owner>/<repo> --private --source=. --push

4. Verify workflows appear in the repo (Actions tab). CI workflows respond to push and pull requests, while `release.yml` publishes tag-based release assets for Linux x64/arm64, macOS arm64, and Windows x64. The Linux builds are intended to run on Debian and Ubuntu hosts. Manual dispatch can be used for release validation or, with a `release_tag`, manual publishing from the GitHub UI.

If gh cannot create the repo due to token scopes, use the GitHub web UI to create the repository and then add the remote:
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main

Registering a self-hosted runner (optional)
1. Create a registration token for the repository via the REST API or the web UI (requires PAT with repo scope). Example API:
   curl -XPOST -H "Authorization: token $PAT" https://api.github.com/repos/<owner>/<repo>/actions/runners/registration-token
   This returns a JSON with "token" to use for config.
2. On the host, the runner software can be downloaded from https://github.com/actions/runner/releases.
3. Follow the runner setup instructions (extract, run ./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN> --labels usbip-host)
4. Start the runner as a service (./svc.sh install; ./svc.sh start)

Notes & next steps
- The repository already contains workflows under `.github/workflows`. The frontend workflow is reusable (`workflow_call` + `workflow_dispatch`) and the release workflow publishes self-contained platform archives on tag pushes.
- If you want the agent to proceed to create the repo and enable Actions and/or register the runner, provide a PAT with the required scopes or confirm you will add the SSH public key to your GitHub account.
- For security, create the PAT on a secure machine and paste it only when needed. Do NOT email tokens.

Troubleshooting
- If gh reports "Resource not accessible by personal access token", the PAT lacks the necessary scopes.
- If Actions fail in the UI, open the workflow run to see logs; we can update the workflow to increase timeouts or adapt Node versions.
