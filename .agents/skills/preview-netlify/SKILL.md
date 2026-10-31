---
name: preview-netlify
description: Put a rig page online as a public preview on Netlify, check it opens for a stranger, and take the lane marker off it after the review (ADR 0003). Use when a plan has a "Preview for review" or "Clean up" step and the host is Netlify.
---

# preview-netlify

A preview is one HTML file, saved by command, on a public Netlify site that we upload over
later (ADR 0003). The human owns the Netlify account; this skill runs the steps they approve.

## Before the first upload

- The human has a Netlify account. Creating one is theirs to do.
- CLI, pinned, nothing installed globally: `npx -y netlify-cli@27.16.1 <command>`.
- Sign-in, once per machine: `netlify login`. The human approves it in their browser. The CLI
  keeps a token in the home folder; `netlify logout` removes it. Never print or paste it.

## Steps

1. **Save the page by command**, into a folder outside the repo (no previews in the repo):

   ```sh
   PORT=8793 npx tsx --env-file=.env src/server.ts &   # rig, with LANE_MARKER set
   curl -sS -o ../rig-preview/index.html http://localhost:8793/digest/<night>
   kill %1
   ```

2. **Ask the human** before every upload: what, where, who can see it, how to undo it.
3. **Upload.** First time: `netlify deploy --prod --no-build --dir . --site-name <name>` in that
   folder. Later: the same with `--site <name>`, so the link stays the same.
4. **Check it as a stranger would**, signed out: `curl -sS -o /dev/null -w '%{http_code}' <link>`.
   - `401` and a "Login Redirect" page: the team protects every site by default
     (`sso_login: true` in `netlify api getSite`). With the human's yes, turn it off for this
     site only: `netlify api updateSite --data '{"site_id":"<id>","body":{"sso_login":false}}'`.
   - `200`: diff the served page against the file. On the free plan Netlify adds an HTML
     comment and a badge `<script>`; the setting `built_with_badge_enabled` can't be turned
     off there. Tell the human before sending (ADR 0001: no client JS in our pages).
5. **Send the link.** The preview issue stays open until the reviewer has looked (AGENTS.md).

## Clean up (after the review)

1. Save the page again with the marker unset; the banner must read "no marker set":

   ```sh
   PORT=8794 env -u LANE_MARKER LANE_ID=<lane> npx tsx src/server.ts &
   ```

2. Ask the human, then upload over the same site (step 3, with `--site`).
3. Netlify keeps every upload at its own deploy link. With the human's yes, delete the
   marked ones: `netlify api listSiteDeploys --data '{"site_id":"<id>"}'`, then
   `netlify api deleteDeploy --data '{"deploy_id":"<old id>"}'`. Never the published one.
4. Check: the main link shows "no marker set", each old deploy link answers `404`.

## Don'ts

- No previews in the repo, in issues or in chat attachments (ADR 0003).
- No upload, setting change or deploy deletion without the human's yes.
