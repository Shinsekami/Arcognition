# Arcognition

Arcognition is a simple online tool that finds furniture from any room image and gathers shopping links.

[**Open Arcognition**](https://shinsekami.github.io/Arcognition)

## How to use
1. Open **https://shinsekami.github.io/Arcognition**
2. Upload an image **or** paste an image URL.
3. Click **Process** and wait a few seconds.
4. Download the Excel report.

Use it to identify pieces from moodboards, real rooms, or 3D renders and quickly compare prices.

---

### ⚙️ For Developers
• Vision detection and URL→base64 proxy run on Supabase Edge Functions:
  • `detect` → https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect
  • `download_image` → https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/download_image
• Reverse image search runs on Cloud Run (`/reverse`).
• No keys or setup required for end-users.

#### Deployment
To build and deploy the reverse search API to Cloud Run:

```bash
gcloud builds submit --config cloudbuild.yaml .
```
This containerizes `reverse_image_api/` and deploys it as the `arcognition-search` service in `us-central1`.
