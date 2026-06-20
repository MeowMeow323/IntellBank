# AI Service Setup

## 1. Python dependencies
```bash
pip install -r requirements.txt
```

## 2. System dependencies (must be installed manually)

These are compiled C++ programs that pip cannot install.

### Tesseract OCR
1. Download the Windows installer from:
   https://github.com/UB-Mannheim/tesseract/wiki
   (e.g. `tesseract-ocr-w64-setup-5.5.0.exe`)
2. Run the installer — check **"Add to PATH"** during setup
3. Verify: `tesseract --version`

### Poppler (required by pdf2image to read PDFs)
1. Download the latest zip from:
   https://github.com/oschwartz10612/poppler-windows/releases
2. Extract to e.g. `C:\poppler`
3. Add `C:\poppler\Library\bin` to your system PATH:
   - Search "Edit the system environment variables" in Start
   - Environment Variables → System Variables → Path → Edit → New
   - Paste the path → OK → restart your terminal
4. Verify: `pdftoppm -v`

## 3. Verify everything works
```bash
python -c "import pytesseract; print(pytesseract.get_tesseract_version())"
python -c "from pdf2image import convert_from_path; print('poppler ok')"
```

## 4. Environment variables
Copy `.env.example` to `.env` and fill in your Supabase credentials.
