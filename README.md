# Arcognition

[**Open Arcognition**](https://shinsekami.github.io/Arcognition)

Arcognition lets you upload or link to any room photo and quickly see matching furniture listings. Everything runs in the browser using Supabase functions for detection and a Cloud Run service for reverse image search.

## How to use
1. Open the link above.
2. Upload an image **or** paste an image URL.
3. Click **Process** and wait a moment.
4. Review the detected items and links.
5. Click **Download Excel Report** to save the spreadsheet.

---
### ⚙️ For Developers
The public front end calls two Supabase Edge functions (`detect` and `download_image`) plus a Cloud Run `/reverse` service. No local setup is required.
