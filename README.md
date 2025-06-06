# Arcognition

Arcognition detects furniture items in a room image, performs reverse image search,
scrapes product information and produces an Excel report sorted by price.

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the pipeline:
   ```bash
   python -m arcognition.main path/to/image.jpg
   ```

The resulting spreadsheet `arcognition_report.xlsx` will contain product names,
prices, websites and links.

Visit this app at: https://Shinsekami.github.io/Arcognition

