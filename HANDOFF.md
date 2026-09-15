# Handoff prompt for Claude Code

Open a terminal in this folder, start Claude Code, and paste the prompt below.
You need the GitHub CLI (`gh`) installed and signed in (`gh auth login`).

---

This folder is a static compliance site for the QR codes on our gin bottles. Read README.md first.

1. Ask me for the values to replace every `TODO` placeholder in `site.json` and
   `products/hue-gin.json` (run `npm run build` to list them). Don't invent any values.
   If I don't have one yet, leave that TODO in place and tell me.
2. Add French, German, Italian and Spanish translations for the text fields I give you
   (ingredients, allergens), but never translate the legal name. Show me the translations before saving.
3. Run `npm install`, `npm run check` and `npm run qr`, and fix any errors.
4. Create a public GitHub repo named `anyonesdrinks-compliance` with `gh`, commit everything
   (including `qr/`), and push to `main`.
5. Configure GitHub Pages to deploy from GitHub Actions and set the custom domain to
   `compliance.anyonesdrinks.com` (use `gh api` for the Pages settings), then confirm the
   workflow run succeeded.
6. Tell me the exact DNS record to add, and the remaining manual steps from README.md
   (Enforce HTTPS, verified domain, branch protection).

Never change a product's `slug` once it's pushed.
