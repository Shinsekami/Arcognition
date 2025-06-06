# Arcognition

Arcognition detects furniture items in a room image, performs reverse image search,
scrapes product information and produces an Excel report sorted by price.

## Usage

1. Set up `.env` with required API tokens:
   ```
   GOOGLE_VISION_API_KEY=your_google_api_key
   APIFY_TOKEN=your_apify_token
   REVERSE_SEARCH_ENDPOINT=https://your-cloud-run-url/reverse
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the pipeline:
   ```bash
   python -m arcognition.main path/to/image.jpg
   ```

The resulting spreadsheet `arcognition_report.xlsx` will contain product names,
prices, websites and links.

Visit this app at: https://<your-username>.github.io/Arcognition
