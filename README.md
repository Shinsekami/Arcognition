# Arcognition

Arcognition is a simple online tool that finds furniture from any room image and gathers shopping links.

[**Open Arcognition**](https://shinsekami.github.io/Arcognition)

## How to use
1. Open **https://shinsekami.github.io/Arcognition**
2. Upload an image **or** paste an image URL.
3. Click **Process** and wait a few seconds while items are detected.
4. Review the highlighted objects and matching links.
5. Click **Download Excel Report** to save the results.

Use it to identify pieces from moodboards, real rooms, or 3D renders and quickly compare prices.

---

### ⚙️ For Developers
The backend pipeline runs on Google Cloud Run and internally uses Supabase Edge Functions
for object detection and image download. Reverse image search also runs on Cloud Run.

#### Deployment
To build and deploy the reverse search API to Cloud Run:

```bash
gcloud builds submit --config cloudbuild.yaml .
```
This containerizes `reverse_image_api/` and deploys it as the `arcognition-search` service in `us-central1`.
