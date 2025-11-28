# FileShare - Offline File Sharing Application

A simple and elegant offline file sharing web application built with Python and Flask.

## Features

- Modern, responsive UI with dark/light theme support
- Drag and drop file upload
- File download and deletion
- Clean and minimal interface
- Offline file sharing capability

## Requirements

- Python 3.7 or higher
- Flask
- Other dependencies listed in requirements.txt

## Installation

1. Clone this repository or download the files
2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Start the application:
   ```bash
   python app.py
   ```
2. Open your web browser and navigate to `http://localhost:5000`
3. Use the application to:
   - Upload files by dragging and dropping or clicking the upload button
   - Download files by clicking the download button
   - Delete files by clicking the delete button
   - Switch between dark and light themes using the theme toggle

## Security Notes

- This application is designed for local network use only
- Files are stored in the `uploads` directory
- Maximum file size is set to 16MB by default
- Always use this application in a trusted network environment

## License

MIT License 