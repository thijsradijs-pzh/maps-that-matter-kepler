Deploy maps-that-matter to Vercel production.

Steps:
1. Switch gh auth: `gh auth switch --user thijsradijs-pzh`
2. Push: `GIT_ASKPASS= git -c credential.helper='!gh auth git-credential' push`
3. Deploy: `GIT_ASKPASS= npx vercel --prod --yes 2>&1`

Report the production deployment URL when done. If step 2 says "nothing to push" that's fine — continue to step 3. If any step fails, explain what went wrong and what to fix.
