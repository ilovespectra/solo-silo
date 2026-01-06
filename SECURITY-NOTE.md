# Security Notice

## Config.yaml Privacy Fix

**Date:** January 6, 2026

### Issue
The `backend/config.yaml` file was accidentally committed in early repository history containing private user folder paths. This has been fixed as of commit `b74fbb8`.

### Current Status
- ✅ `backend/config.yaml` is now in `.gitignore`
- ✅ File removed from git tracking (no longer in new commits)
- ✅ `backend/config.yaml.example` provided as template
- ⚠️ **Old git history still contains this file**

### Recommended Actions for Users

1. **For new clones:** The file is no longer tracked and won't appear in fresh clones after commit `b74fbb8`

2. **To clean old history (ADVANCED):** If you forked before this fix and want to remove from history:
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch backend/config.yaml' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   ```
   ⚠️ **WARNING:** This rewrites history and will break existing forks/clones

3. **For paranoid users:** If sensitive paths were exposed, consider creating a fresh repository with clean history:
   ```bash
   # Create new repo without history
   git checkout --orphan clean-start
   git commit -m "Initial commit with clean history"
   git branch -D local  # Delete old branch
   git branch -m local  # Rename clean-start to local
   git push -f origin local
   ```

### Prevention
All user-specific configuration files are now in `.gitignore`:
- `backend/config.yaml`
- `backend/silos.json`
- `cache/` directories
- All database files
