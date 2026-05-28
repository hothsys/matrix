# Testing

The app includes a Playwright integration test suite. Tests run against a temporary data directory so your real data is never touched.

## Prerequisites

Node.js (for Playwright)

## Run all tests

```bash
python3 serve.py --run-tests
```

This will:
1. Create an isolated temp directory for test data
2. Generate test fixture images (with EXIF GPS data)
3. Install Playwright and Chromium (first run only)
4. Start the server and run all 67 tests
5. Clean up and exit with the test result code

> You may need to run `npx playwright install` first if browsers aren't installed.

## Run a specific test file

```bash
# Start the server in one terminal
python3 serve.py

# Run specific tests in another terminal
cd tests
npx playwright test specs/albums.spec.js --project=chromium
```

## Run by test name

```bash
cd tests
npx playwright test --grep "empty map cache"
```

## Test structure

```
tests/
├── specs/               # Test files
│   ├── albums.spec.js
│   ├── api.spec.js
│   ├── app-load.spec.js
│   ├── countries-bar.spec.js
│   ├── lightbox.spec.js
│   ├── photo-management.spec.js
│   ├── photo-upload.spec.js
│   ├── pin-position.spec.js
│   ├── safari-reload.spec.js
│   ├── settings-export-import.spec.js
│   └── sidebar.spec.js
├── helpers/
│   └── test-setup.js    # setupApp, uploadTestPhotos, clearState
├── fixtures/            # Generated test images with EXIF GPS data
└── playwright.config.js
```
